import { getDb, getMemberContext } from '@/server/db2.js';
import { listNotifications, NOTIFICATION_TYPE_LABEL, type NotificationType } from '@/biz/index.js';
import { Icons } from '../../../components/icons';

export const dynamic = 'force-dynamic';

export default function AlertsPage({ searchParams }: { searchParams: { member?: string } }) {
  const db = getDb();
  const memberId = searchParams.member ?? db.members[0]?.id ?? '';
  const ctx = getMemberContext(memberId);
  const notis = listNotifications(ctx, memberId);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">알림</h2>
      {notis.length > 0 ? (
        <ul className="space-y-2">
          {notis.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-700">
                <Icons.bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">
                  {NOTIFICATION_TYPE_LABEL[n.notification_type as NotificationType] ?? n.notification_type}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {(n.sent_at ?? '').slice(0, 16).replace('T', ' ')} · {n.channel}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-slate-400">
            <Icons.bell className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-slate-600">도착한 알림이 없어요</p>
          <p className="text-xs text-slate-400">예약·수강권 관련 소식을 여기서 받아볼 수 있어요.</p>
        </div>
      )}
    </div>
  );
}
