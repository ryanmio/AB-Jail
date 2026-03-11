-- Advanced stats RPC for the revamped stats page.
-- Returns sender intelligence, domain/link data, message type trends,
-- source trends, violation code trends, and fundraising breakdown.
-- Uses the same filter parameters as get_stats for consistency.

create or replace function get_advanced_stats(
  start_date timestamptz default null,
  end_date timestamptz default now(),
  sender_names text[] default null,
  violation_codes text[] default null,
  violation_permitted_flags boolean[] default null,
  sources text[] default null,
  message_types text[] default null
)
returns json
language plpgsql
as $$
declare
  result json;
  day_count int;
  filter_enabled boolean := sender_names is not null and array_length(sender_names, 1) is not null;
  violation_filter_enabled boolean := violation_codes is not null and array_length(violation_codes, 1) is not null;
  source_filter_enabled boolean := sources is not null and array_length(sources, 1) is not null;
  type_filter_enabled boolean := message_types is not null and array_length(message_types, 1) is not null;
begin
  if start_date is null then
    select coalesce(min(created_at), now() - interval '1 year') into start_date from submissions;
  end if;

  select greatest(1, extract(days from end_date - start_date)::int) into day_count;

  result := json_build_object(
    -- Enhanced sender stats with violation rate, top code, first/last seen
    'sender_stats', (
      select coalesce(json_agg(row_to_json(t) order by t.captures_with_violations desc, t.total_captures desc), '[]'::json)
      from (
        select
          coalesce(s.sender_name, s.sender_id, 'Unknown') as sender,
          count(distinct s.id) as total_captures,
          count(distinct case when v.id is not null and v.actblue_verified = false then s.id end) as captures_with_violations,
          round(
            count(distinct case when v.id is not null and v.actblue_verified = false then s.id end)::numeric
            / nullif(count(distinct s.id), 0) * 100, 1
          ) as violation_rate,
          (
            select v2.code from violations v2
            where v2.submission_id = any(array_agg(distinct s.id))
              and v2.actblue_verified = false
            group by v2.code
            order by count(*) desc
            limit 1
          ) as top_violation_code,
          min(s.created_at)::date as first_seen,
          max(s.created_at)::date as last_seen,
          count(distinct case when v.id is not null and v.actblue_verified = false then s.id end) >= 3 as is_repeat_offender
        from submissions s
        left join violations v on v.submission_id = s.id
          and (violation_filter_enabled or v.actblue_verified = false)
          and (not violation_filter_enabled or (
            v.code = any(violation_codes)
            and (
              case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                   when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                   else v.actblue_verified = false
              end
            )
          ))
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not violation_filter_enabled or exists (
            select 1 from violations v2
            where v2.submission_id = s.id
              and v2.code = any(violation_codes)
              and (
                case when violation_permitted_flags[array_position(violation_codes, v2.code)] is null then v2.actblue_verified = false
                     when violation_permitted_flags[array_position(violation_codes, v2.code)] = true then v2.actblue_verified = true
                     else v2.actblue_verified = false
                end
              )
          ))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by coalesce(s.sender_name, s.sender_id, 'Unknown')
        having count(distinct s.id) >= 1
        order by count(distinct case when v.id is not null and v.actblue_verified = false then s.id end) desc, count(distinct s.id) desc
      ) t
    ),

    -- Top domains extracted from links JSONB (only from submissions with violations)
    'top_domains', (
      select coalesce(json_agg(json_build_object('domain', domain_val, 'count', cnt) order by cnt desc), '[]'::json)
      from (
        select
          coalesce(
            elem->>'domain',
            substring(elem->>'url' from '://([^/]+)')
          ) as domain_val,
          count(*) as cnt
        from submissions s,
             jsonb_array_elements(case when jsonb_typeof(s.links) = 'array' and jsonb_array_length(s.links) > 0 then s.links else '[]'::jsonb end) as elem
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and exists (
            select 1 from violations v
            where v.submission_id = s.id
              and v.actblue_verified = false
          )
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not violation_filter_enabled or exists (
            select 1 from violations v
            where v.submission_id = s.id
              and v.code = any(violation_codes)
              and (
                case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                     when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                     else v.actblue_verified = false
                end
              )
          ))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by domain_val
        having coalesce(elem->>'domain', substring(elem->>'url' from '://([^/]+)')) is not null
        order by cnt desc
        limit 15
      ) domains
    ),

    -- Top ActBlue URLs (specific contribution pages)
    'top_actblue_urls', (
      select coalesce(json_agg(json_build_object('url', url_val, 'count', cnt) order by cnt desc), '[]'::json)
      from (
        select
          elem->>'url' as url_val,
          count(*) as cnt
        from submissions s,
             jsonb_array_elements(case when jsonb_typeof(s.links) = 'array' and jsonb_array_length(s.links) > 0 then s.links else '[]'::jsonb end) as elem
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and (
            coalesce(elem->>'domain', substring(elem->>'url' from '://([^/]+)')) ilike '%actblue%'
          )
          and exists (
            select 1 from violations v
            where v.submission_id = s.id
              and v.actblue_verified = false
          )
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by url_val
        order by cnt desc
        limit 10
      ) urls
    ),

    -- Message type by time bucket (for stacked area chart)
    'message_type_by_bucket', (
      select coalesce(json_agg(json_build_object(
        'bucket', bucket_key,
        'sms', sms_count,
        'email', email_count,
        'unknown', unknown_count
      ) order by bucket_key), '[]'::json)
      from (
        select
          to_char(
            case when day_count <= 45 then date_trunc('day', s.created_at at time zone 'America/New_York')
                 else date_trunc('week', s.created_at at time zone 'America/New_York') end,
            'YYYY-MM-DD'
          ) as bucket_key,
          count(*) filter (where s.message_type::text = 'sms') as sms_count,
          count(*) filter (where s.message_type::text = 'email') as email_count,
          count(*) filter (where s.message_type::text = 'unknown') as unknown_count
        from submissions s
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not violation_filter_enabled or exists (
            select 1 from violations v
            where v.submission_id = s.id
              and v.code = any(violation_codes)
              and (
                case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                     when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                     else v.actblue_verified = false
                end
              )
          ))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by bucket_key
        order by bucket_key
      ) type_buckets
    ),

    -- Source split by time bucket (user_upload vs honeytrap over time)
    'source_by_bucket', (
      select coalesce(json_agg(json_build_object(
        'bucket', bucket_key,
        'user_upload', user_upload_count,
        'honeytrap', honeytrap_count
      ) order by bucket_key), '[]'::json)
      from (
        select
          to_char(
            case when day_count <= 45 then date_trunc('day', s.created_at at time zone 'America/New_York')
                 else date_trunc('week', s.created_at at time zone 'America/New_York') end,
            'YYYY-MM-DD'
          ) as bucket_key,
          count(*) filter (where (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)) as user_upload_count,
          count(*) filter (where (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)) as honeytrap_count
        from submissions s
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not violation_filter_enabled or exists (
            select 1 from violations v
            where v.submission_id = s.id
              and v.code = any(violation_codes)
              and (
                case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                     when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                     else v.actblue_verified = false
                end
              )
          ))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by bucket_key
        order by bucket_key
      ) source_buckets
    ),

    -- Violation trends by code over time
    'violations_by_code_by_bucket', (
      select coalesce(json_agg(json_build_object(
        'bucket', bucket_key,
        'code', violation_code,
        'count', cnt
      ) order by bucket_key, violation_code), '[]'::json)
      from (
        select
          to_char(
            case when day_count <= 45 then date_trunc('day', s.created_at at time zone 'America/New_York')
                 else date_trunc('week', s.created_at at time zone 'America/New_York') end,
            'YYYY-MM-DD'
          ) as bucket_key,
          v.code as violation_code,
          count(*) as cnt
        from violations v
        join submissions s on v.submission_id = s.id
        where s.created_at >= start_date and s.created_at <= end_date
          and s.public = true
          and (violation_filter_enabled or v.actblue_verified = false)
          and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
          and (not violation_filter_enabled or (
            v.code = any(violation_codes)
            and (
              case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                   when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                   else v.actblue_verified = false
              end
            )
          ))
          and (not source_filter_enabled or (
            case
              when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
              when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
              when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
              else false
            end
          ))
          and (not type_filter_enabled or s.message_type::text = any(message_types))
        group by bucket_key, v.code
        order by bucket_key, v.code
      ) code_buckets
    ),

    -- Fundraising breakdown
    'fundraising_split', (
      select json_build_object(
        'fundraising', count(*) filter (where s.is_fundraising = true),
        'non_fundraising', count(*) filter (where s.is_fundraising = false),
        'unknown', count(*) filter (where s.is_fundraising is null)
      )
      from submissions s
      where s.created_at >= start_date and s.created_at <= end_date
        and s.public = true
        and (not filter_enabled or coalesce(s.sender_name, s.sender_id, 'Unknown') = any(sender_names))
        and (not violation_filter_enabled or exists (
          select 1 from violations v
          where v.submission_id = s.id
            and v.code = any(violation_codes)
            and (
              case when violation_permitted_flags[array_position(violation_codes, v.code)] is null then v.actblue_verified = false
                   when violation_permitted_flags[array_position(violation_codes, v.code)] = true then v.actblue_verified = true
                   else v.actblue_verified = false
              end
            )
        ))
        and (not source_filter_enabled or (
          case
            when 'user_upload' = any(sources) and 'honeytrap' = any(sources) then true
            when 'user_upload' = any(sources) then (s.message_type::text = 'unknown') or (s.message_type::text = 'email' and s.forwarder_email is not null)
            when 'honeytrap' = any(sources) then (s.message_type::text = 'sms') or (s.message_type::text = 'email' and s.forwarder_email is null)
            else false
          end
        ))
        and (not type_filter_enabled or s.message_type::text = any(message_types))
    )
  );

  return result;
end;
$$;
