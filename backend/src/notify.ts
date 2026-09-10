import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users } from './db/schema';
import { sendMail } from './mail';
import { publicWebOrigin } from './routes/auth';
import { logger } from './logger';

/** The three social events that email a notification (T117). */
export type NotifyKind = 'friend_request' | 'trade_offer' | 'game_night_invite';

interface NotifyPayload {
  /** Display label of the person who triggered the event (already resolved
   *  via `resolveDisplayLabel` by the caller). */
  fromLabel: string;
  /** Where the recipient lands after clicking through, relative to the app
   *  origin (e.g. `/friends?tab=requests`). */
  path: string;
  /** Only for game_night_invite: the night's title, shown in the copy. */
  nightTitle?: string;
}

function contentFor(
  kind: NotifyKind,
  payload: NotifyPayload
): { subject: string; text: string; html: string } {
  const link = `${publicWebOrigin()}${payload.path}`;
  const { fromLabel } = payload;
  let subject: string;
  let body: string;
  switch (kind) {
    case 'friend_request':
      subject = `${fromLabel} sent you a friend request on SpellControl`;
      body = `${fromLabel} sent you a friend request.`;
      break;
    case 'trade_offer':
      subject = `${fromLabel} proposed a trade on SpellControl`;
      body = `${fromLabel} proposed a trade with you.`;
      break;
    case 'game_night_invite':
      subject = `${fromLabel} invited you to ${payload.nightTitle ?? 'a game night'} on SpellControl`;
      body = `${fromLabel} invited you to "${payload.nightTitle ?? 'a game night'}".`;
      break;
  }
  return {
    subject,
    text: `${body}\n\n${link}`,
    html: `<p>${body}</p><p><a href="${link}">${link}</a></p>`,
  };
}

/**
 * Best-effort email for one of the three social events (friend request,
 * trade offer, game-night invite) — never throws, never blocks the request
 * that triggered it. Sends only when the recipient has a verified email and
 * hasn't opted out (`notify_email`). Card lists/values never appear in the
 * body — just who did what and a deep link back into the app.
 */
export async function notifyUser(
  userId: string,
  kind: NotifyKind,
  payload: NotifyPayload
): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        notifyEmail: users.notifyEmail,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row?.email || !row.emailVerified || !row.notifyEmail) return;
    await sendMail({ to: row.email, ...contentFor(kind, payload) });
  } catch (err) {
    logger.error(`[notify] failed to send ${kind} email:`, err);
  }
}
