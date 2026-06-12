-- Per-site outreach controls (in-Sentinel sending via Resend, replacing n8n).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table sites add column if not exists outreach_mode      text default 'manual'; -- 'manual' | 'auto'
alter table sites add column if not exists outreach_daily_cap int  default 10;     -- max sends per day per site
