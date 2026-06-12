import Link from 'next/link';
import { getDb, getMemberContext } from '@/server/db2.js';
import { dateKST, getMember360, PASS_STATUS_LABEL, won } from '@/biz/index.js';
import { Badge } from '../../../components/ui';
import { Icons } from '../../../components/icons';
import { CancelButton } from '../../../components/member/CancelButton';

export const dynamic = 'force-dynamic';

export default function MyPage({ searchParams }: { searchParams: { member?: string } }) {
  const db = getDb();
  const memberId = searchParams.member ?? db.members[0]?.id ?? '';
  const ctx = getMemberContext(memberId);
  const m = getMember360(ctx, memberId);
  if (!m) return <div className="py-10 text-center text-slate-400">회원을 찾을 수 없습니다.</div>;
  const today = dateKST(ctx.now);
  const dday = (d: string) => Math.ceil((Date.parse(d) - Date.parse(today)) / 86400000);

  return (
    <div className="space-y-5">
      {/* 수강권 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">내 수강권</h2>
        <ul className="space-y-2">
          {m.passes
            .filter((p) => p.pass_status === 'active' || p.pass_status === 'paused')
            .map((p) => {
              const left = dday(p.expire_date);
              const pct = p.total_count && p.remaining_count != null ? Math.round((p.remaining_count / p.total_count) * 100) : null;
              return (
                <li key={p.id} className="rounded-xl border border-line bg-surface p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{p.product_name}</span>
                    <Badge value={p.pass_status} label={PASS_STATUS_LABEL[p.pass_status as keyof typeof PASS_STATUS_LABEL]} dot />
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tnum text-brand-700">{p.remaining_count != null ? p.remaining_count : '∞'}</span>
                    <span className="text-sm text-slate-400">{p.remaining_count != null ? `회 남음${p.total_count ? ` / ${p.total_count}회` : ''}` : '무제한'}</span>
                  </div>
                  {pct != null ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                    <Icons.clock className="h-3.5 w-3.5" />
                    <span>~{p.expire_date}</span>
                    {left >= 0 && left <= 14 ? <Badge tone="warning" label={`D-${left}`} className="ml-1" /> : null}
                  </div>
                </li>
              );
            })}
          {m.passes.filter((p) => p.pass_status === 'active' || p.pass_status === 'paused').length === 0 ? (
            <li className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-slate-400">보유한 수강권이 없어요</li>
          ) : null}
        </ul>
      </section>

      {/* 다가오는 예약 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">다가오는 예약</h2>
        <ul className="space-y-2">
          {m.upcoming.map((u) => (
            <li key={u.reservation_id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3.5">
              <div>
                <div className="tnum text-sm font-semibold text-slate-900">{u.start_at.slice(5, 16).replace('T', ' ')}</div>
                <div className="text-xs text-slate-500">{u.class_name}</div>
              </div>
              <CancelButton reservationId={u.reservation_id} memberId={memberId} classLabel={`${u.start_at.slice(5, 16).replace('T', ' ')} · ${u.class_name}`} />
            </li>
          ))}
          {m.upcoming.length === 0 ? (
            <li className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-slate-400">
              예정된 예약이 없어요
              <div className="mt-2">
                <Link href={`/m/booking?member=${memberId}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 underline">
                  수업 예약하러 가기 <Icons.arrowRight className="h-3 w-3" />
                </Link>
              </div>
            </li>
          ) : null}
        </ul>
      </section>

      {/* 요약 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">내 활동</h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-surface p-3.5">
            <div className="text-xs text-slate-400">출석</div>
            <div className="mt-0.5 text-lg font-bold tnum text-slate-900">{m.attendance.attended}회</div>
            <div className="text-xs text-slate-400">출석률 {m.attendance.rate}%</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3.5">
            <div className="text-xs text-slate-400">누적 결제</div>
            <div className="mt-0.5 text-lg font-bold tnum text-slate-900">{won(m.finance.total_paid)}</div>
            {m.finance.receivable > 0 ? <div className="text-xs text-warning-fg">미수금 {won(m.finance.receivable)}</div> : <div className="text-xs text-slate-400">미수금 없음</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
