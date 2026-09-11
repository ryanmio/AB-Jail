-- get_homepage_stats: return user_submitted boolean. Otherwise identical to 2025-11-29.

create or replace function get_homepage_stats(
  recent_limit int default 5,
  offenders_limit int default 10,
  offenders_days int default null,  -- null = lifetime, otherwise last N days
  reports_limit int default 5
)
returns json
language plpgsql
stable
as $$
declare
  result json;
begin
  result := json_build_object(
    'recent_cases', (
      select json_agg(
        json_build_object(
          'id', id,
          'created_at', created_at,
          'sender_id', sender_id,
          'sender_name', sender_name,
          'raw_text', raw_text,
          'message_type', message_type,
          'user_submitted', (forwarder_email is not null),
          'image_url', image_url,
          'violations', violations
        ) order by created_at desc
      )
      from (
        select 
          s.id,
          s.created_at,
          s.sender_id,
          s.sender_name,
          s.raw_text,
          s.message_type,
          s.forwarder_email,
          s.image_url,
          json_agg(
            json_build_object('code', v.code, 'title', v.title, 'actblue_verified', v.actblue_verified)
            order by v.severity desc, v.confidence desc
          ) filter (where v.code is not null) as violations
        from submissions s
        join violations v on v.submission_id = s.id
        where s.public = true
        group by s.id
        order by s.created_at desc
        limit recent_limit
      ) recent
    ),
    'worst_offenders', (
      select json_agg(
        json_build_object(
          'sender_name', sender_name,
          'violation_count', violation_count,
          'latest_violation_at', latest_violation_at
        ) order by violation_count desc, latest_violation_at desc
      )
      from (
        with violation_cases as (
          select distinct 
            s.id,
            coalesce(s.sender_name, s.sender_id, 'Unknown') as sender,
            s.created_at
          from submissions s
          join violations v on v.submission_id = s.id
          where s.public = true
            and v.actblue_verified = false
            and (offenders_days is null or s.created_at >= now() - (offenders_days || ' days')::interval)
        )
        select 
          sender as sender_name,
          count(*) as violation_count,
          max(created_at) as latest_violation_at
        from violation_cases
        group by sender
        order by violation_count desc, latest_violation_at desc
        limit offenders_limit
      ) offenders
    ),
    'recent_reports', (
      select json_agg(
        json_build_object(
          'report', json_build_object(
            'id', r.id,
            'case_id', r.case_id,
            'to_email', r.to_email,
            'cc_email', r.cc_email,
            'subject', r.subject,
            'body', r.body,
            'screenshot_url', r.screenshot_url,
            'landing_url', r.landing_url,
            'status', r.status,
            'created_at', r.created_at
          ),
          'case', json_build_object(
            'id', s.id,
            'sender_name', s.sender_name,
            'sender_id', s.sender_id,
            'raw_text', s.raw_text,
            'image_url', s.image_url,
            'created_at', s.created_at,
            'message_type', s.message_type,
            'email_body', s.email_body
          ),
          'verdict', case 
            when rv.id is not null then json_build_object(
              'id', rv.id,
              'verdict', rv.verdict,
              'explanation', rv.explanation,
              'determined_by', rv.determined_by,
              'created_at', rv.created_at,
              'updated_at', rv.updated_at
            )
            else null
          end,
          'violations', coalesce(
            (
              select json_agg(
                json_build_object('code', v.code, 'title', v.title)
                order by v.severity desc, v.confidence desc
              )
              from violations v
              where v.submission_id = s.id
            ),
            '[]'::json
          )
        ) order by r.created_at desc
      )
      from (
        select r.*
        from reports r
        join submissions s on s.id = r.case_id
        where s.public = true
        order by r.created_at desc
        limit reports_limit
      ) r
      join submissions s on s.id = r.case_id
      left join report_verdicts rv on rv.case_id = r.case_id
    ),
    'platform_status', (
      select json_build_object(
        'actblue_reporting_status', ps.actblue_reporting_status,
        'bot_network_sender_count', (
          select count(distinct coalesce(s.sender_name, s.sender_id, 'Unknown'))
          from submissions s
          where s.created_at >= now() - interval '30 days'
            and s.public = true
        )
      )
      from platform_status ps
      where ps.id = 'default'
    )
  );
  
  return result;
end;
$$;

