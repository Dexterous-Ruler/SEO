// ===========================================================================
// Email sender (Resend) — the transactional channel for link-outreach. Replaces
// the n8n send step: Sentinel sends directly via the Resend API. Concurrency-
// capped + retried via the shared infra layer.
//
// Env: RESEND_API_KEY   — from resend.com (free tier available)
//      OUTREACH_FROM    — verified sender, e.g. 'Karim <outreach@go-visa.co.uk>'
//                         (the domain must be verified in Resend: SPF/DKIM)
//      OUTREACH_REPLY_TO (optional) — where replies land (a mailbox you watch)
// ===========================================================================
import { config } from 'dotenv';
config({ override: true });
import { withRetry, withTimeout } from './infra.js';

export function emailConfigured() { return !!(process.env.RESEND_API_KEY && process.env.OUTREACH_FROM); }

export async function sendEmail({ to, subject, text, html, from, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { const e = new Error('Email not configured — set RESEND_API_KEY.'); e.code = 'NO_EMAIL'; throw e; }
  const sender = from || process.env.OUTREACH_FROM;
  if (!sender) { const e = new Error('Set OUTREACH_FROM (e.g. "Name <you@your-verified-domain>").'); e.code = 'NO_EMAIL'; throw e; }
  if (!to) throw new Error('No recipient.');
  const body = { from: sender, to: [to], subject: subject || '(no subject)', reply_to: replyTo || process.env.OUTREACH_REPLY_TO || undefined };
  if (html) body.html = html;
  if (text || !html) body.text = text || '';
  return withRetry(() => withTimeout((async () => {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) { const e = new Error('Resend ' + res.status); e.transient = true; throw e; }
    if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (data.message || JSON.stringify(data).slice(0, 160)));
    return { id: data.id };
  })(), 20000, 'Resend send'), { retries: 2, base: 800, retryOn: (e) => e && (e.transient || e.code === 'ETIMEOUT') });
}

export default { sendEmail, emailConfigured };
