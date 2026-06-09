# Link Outreach — n8n send workflow (Link Engine Phase 2)

This is the **sending** half of assisted outreach. Sentinel does the research,
contact-finding, drafting, and pushes a row per prospect into an Airtable
**`Outreach`** table; this workflow sends the emails and tracks results. **You stay
in control** — nothing sends until you set a row's **Status → `Send Outreach`**.

## The loop
```
Sentinel (Backlinks → Outreach: Prepare campaign → Push → Airtable)
   → Airtable "Outreach" table (Status = "To review", with Subject + Email + Contact Email)
   → YOU review the draft in Airtable and set Status = "Send Outreach"
   → n8n "Every 15 min" sends the email, sets Status = "Sent", Sent At = now
   → n8n "Daily follow-up" sends one follow-up after 3 days if not Replied
   → mark Replied / Won (+ Won URL) in Airtable → shows in Sentinel's Tracker
```

## Setup (one-time)
1. **Import** `link-outreach.json` into n8n (Workflows → Import from File).
2. In every Airtable node, set **Base** to your site's base ID (replace `YOUR_BASE_ID`)
   and pick your Airtable credential. Table is `Outreach` (Sentinel auto-creates it
   on first push).
3. In both **Gmail** nodes, select your Gmail/SMTP credential. (For non-Gmail, swap
   the node for the *Send Email (SMTP)* node — same field mapping.)
4. **Deliverability — do this before any volume:** authenticate the sending domain
   with **SPF, DKIM and DMARC**, start at a low daily volume and ramp, and keep
   drafts personalised. Cold outreach must comply with **CAN-SPAM / GDPR / PECR**:
   identify yourself, target business contacts, and honour opt-outs/replies.
5. Activate the workflow.

## The `Outreach` table fields (auto-created by Sentinel)
`Domain · Contact Email · Contact Page · Rank · Competitors Linked · Link Value Score ·
Tactic · Status · Subject · Email · Sent At · Replied · Won · Won URL`

- **Status** values: `To review → Send Outreach → Sent → Follow-up 1 → Follow-up 2 → Replied → Won` (or `Skip`).
- Mark **Replied** / **Won** (+ paste the **Won URL**) when a link lands — Sentinel's
  **Backlinks → Outreach → Tracker** reads these back for reply-rate / win-rate / ROI.

## Notes
- Replies: point the Gmail "Reply-To" at a mailbox you watch; when someone replies,
  tick **Replied** (or add a small n8n branch that watches the inbox and sets it).
- The follow-up node stops automatically once **Replied** is ticked (the filter
  excludes replied rows). Add a second daily branch (filter `Status = 'Follow-up 1'`
  + 3 days) for a second, final follow-up — then stop.
- Never offer payment for do-follow links or run link exchanges — that violates
  Google's link-scheme policy and is intentionally not part of this flow.
