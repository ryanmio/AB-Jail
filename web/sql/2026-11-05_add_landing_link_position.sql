-- Where the chosen ActBlue link sits in the message: 'body' or 'header_footer'.
-- Set at ingest for new rows; older rows stay null.

alter table submissions
add column if not exists landing_link_position text
check (landing_link_position in ('body', 'header_footer'));

comment on column submissions.landing_link_position is 'Position of the ActBlue landing link in the message: body or header_footer. Null when unknown.';
