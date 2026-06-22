-- 007_geo_context.sql — per-site AI-visibility context.
-- Free-text "what this site is about / who it serves / what to focus on", set in the
-- AI Visibility (GEO) screen. Read by /geo-prompts and woven into suggestPrompts so each
-- site's generated buyer-intent prompts are sharper and on-topic. Nullable; absent = no steer.
alter table sites add column if not exists geo_context text;
