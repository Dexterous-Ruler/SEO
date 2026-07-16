-- n8n prompt-edit history: undo/rollback for the in-dashboard n8n control panel.
-- Every save through POST /n8n-update-prompts records the edited paths with their
-- BEFORE and AFTER values (edits jsonb = [{nodeId,nodeName,path,before,after}]).
-- Kept to the last 10 entries per workflow (pruned on write). Rollbacks are
-- recorded too (source='rollback'), so a rollback can itself be undone.
-- NOTE: edits made directly in the n8n editor bypass this (no hook exists) —
-- the panel shows each workflow's n8n updatedAt so external edits are visible.
create table if not exists n8n_prompt_history (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   text not null,
  workflow_name text,
  edits         jsonb not null,
  source        text default 'dashboard',
  created_at    timestamptz default now()
);
create index if not exists n8n_prompt_history_wf_idx
  on n8n_prompt_history (workflow_id, created_at desc);
