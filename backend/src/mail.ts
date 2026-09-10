import { logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Whether outbound mail actually sends, vs. logging only (dev/tests). */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Best-effort transactional mail, no SDK — one `fetch` to the Resend HTTP API
 * when `RESEND_API_KEY` is set. Unset (dev/tests): logs the subject + text
 * instead of sending, so account-recovery flows still work end to end
 * locally via the server log. Never throws: a mail-provider outage must not
 * fail the request that already did its real work (issuing the token) by the
 * time this is called.
 */
export async function sendMail({ to, subject, text, html }: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info(`[mail] (unconfigured — logging only) to=${to} subject="${subject}"\n${text}`);
    return;
  }
  const from = process.env.MAIL_FROM ?? 'SpellControl <no-reply@spellcontrol.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.error(`[mail] Resend responded ${res.status} sending to ${to}`);
  } catch (err) {
    logger.error('[mail] send failed:', err);
  }
}
