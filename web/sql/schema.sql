-- Enums
create type message_type as enum ('sms','email','unknown');
create type redact_level as enum ('default','strict');

-- Tables
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  uploader_fingerprint text,
  image_url text not null,
  message_type message_type default 'unknown',
  raw_text text,
  processing_status text default 'queued' check (processing_status in ('queued','ocr','classified','done','error')),
  ocr_method text,
  ocr_confidence numeric,
  ocr_ms int,
  classifier_ms int,
  sender_id text,
  sender_name text,
  links jsonb default '[]'::jsonb,
  redact_level redact_level default 'default',
  ai_version text,
  ai_confidence numeric,
  email_subject text,
  email_body text,
  email_body_original text,
  email_from text,
  public boolean default true,
  is_fundraising boolean,
  landing_url text,
  landing_screenshot_url text,
  landing_rendered_at timestamptz,
  landing_render_status text check (landing_render_status in ('pending','success','failed')),
  ai_summary text,
  normalized_text text,
  normalized_hash text,
  simhash64 bigint,
  forwarder_email text,
  submission_token text,
  token_used_at timestamptz,
  preview_email_sent_at timestamptz,
  preview_email_status text,
  media_urls jsonb default '[]'::jsonb,
  email_sent_at timestamptz,
  sort_date timestamptz generated always as (coalesce(email_sent_at, created_at)) stored
);
create index if not exists submissions_sender_idx on submissions(sender_id);
create index if not exists submissions_created_idx on submissions(created_at);
create index if not exists submissions_sort_date_idx on submissions(sort_date desc);

create table if not exists violations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null,
  evidence_spans jsonb,
  severity int not null,
  confidence numeric not null,
  actblue_verified boolean default false
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  kind text default 'user' check (kind in ('user','landing_page'))
);

create table if not exists evaluation_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  ip_address text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_evaluations int default 0,
  is_complete boolean default false
);

create table if not exists evaluation_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references evaluation_sessions(id) on delete cascade,
  submission_id uuid references submissions(id) on delete cascade,
  manual_violations jsonb default '[]'::jsonb,
  ai_violations jsonb default '[]'::jsonb,
  evaluator_notes text,
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references submissions(id) on delete cascade,
  to_email text not null,
  cc_email text,
  subject text not null,
  body text not null,
  screenshot_url text,
  landing_url text not null,
  status text not null,
  created_at timestamptz default now()
);

create table if not exists report_replies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  case_id uuid not null references submissions(id) on delete cascade,
  from_email text not null,
  body_text text not null,
  created_at timestamptz default now()
);

create table if not exists report_verdicts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references submissions(id) on delete cascade,
  verdict text not null check (verdict in ('violation_confirmed','no_violation','pending','under_review','resolved')),
  explanation text,
  determined_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sender_violation_exemptions (
  id uuid primary key default gen_random_uuid(),
  sender_pattern text not null,
  violation_code text not null,
  reason text,
  verified_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  submission_id uuid references submissions(id) on delete cascade,
  payload jsonb,
  created_at timestamptz default now()
);

-- Deletion Requests: allow anyone to request a case be deleted
create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  reason text not null,
  requester text, -- optional: email, ip hash, or name if provided
  created_at timestamptz default now()
);

-- indexes for faster lookups
create index if not exists deletion_requests_submission_idx on deletion_requests(submission_id);

-- RLS (to enable in Supabase)
-- alter table submissions enable row level security;
-- create policy public_read_only on submissions for select using (public = true);
-- create policy admin_full on submissions for all using (auth.role() = 'admin') with check (auth.role() = 'admin');

-- alter table violations enable row level security;
-- create policy public_read on violations for select using (
--   exists(select 1 from submissions s where s.id = violations.submission_id and s.public = true)
-- );

