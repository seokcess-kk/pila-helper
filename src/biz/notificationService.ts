/** 알림 서비스(MVP: 발송 이력 기록). canon §2(H)·§3.20 / docs/spec 11(알림). */
import type { ID, Notification, NotificationType } from '../domain/index.js';
import { isoKST, nextId } from '../lib/util.js';
import { baseFields, currentStudio, scoped, type RequestContext } from './context.js';

export function notify(
  ctx: RequestContext,
  input: { member_id?: ID | null; notification_type: NotificationType; channel?: Notification['channel']; payload?: unknown },
): Notification {
  const n: Notification = {
    id: nextId(ctx.db.notifications, 'noti'),
    ...baseFields(ctx),
    member_id: input.member_id ?? null,
    template_id: null,
    notification_type: input.notification_type,
    channel: input.channel ?? currentStudio(ctx).policy_json.notification.default_channel ?? 'sms',
    status: 'sent',
    scheduled_at: null,
    sent_at: isoKST(ctx.now),
    payload_json: input.payload,
  };
  ctx.db.notifications.push(n);
  return n;
}

export function listNotifications(ctx: RequestContext, member_id?: ID): Notification[] {
  return scoped(ctx, ctx.db.notifications)
    .filter((n) => !member_id || n.member_id === member_id)
    .sort((a, b) => ((a.sent_at ?? '') < (b.sent_at ?? '') ? 1 : -1));
}
