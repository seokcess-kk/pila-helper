import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/server/db2.js';
import {
  addDays,
  assertCan,
  dateKST,
  getTimetable,
  MEMBER_STATUS_LABEL,
  profitDashboard,
  ROLE_LABEL,
  scoped,
  won,
  ymOf,
} from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat, buttonVariants } from '../../../components/ui';
import { Icons } from '../../../components/icons';

export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = { fulltime: '정직원', parttime: '파트타임', freelance: '프리랜서' };
const TYPE_TONE: Record<string, 'warning' | 'info' | 'brand'> = { personal: 'warning', group: 'info', trial: 'brand' };

export default function StaffDetail({ params }: { params: { id: string } }) {
  const ctx = getContext();
  assertCan(ctx.role, 'users', 'read');
  const s = scoped(ctx, ctx.db.staff).find((x) => x.id === params.id);
  if (!s) notFound();
  const ym = ymOf(dateKST(ctx.now));
  const today = dateKST(ctx.now);
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const weekCells = getTimetable(ctx, monday, addDays(monday, 6)).filter(
    (c) => c.session.instructor_staff_id === s.id || c.session.substitute_staff_id === s.id,
  );
  const assigned = scoped(ctx, ctx.db.members).filter((m) => m.assigned_staff_id === s.id);
  const revenue = profitDashboard(ctx, ym, 'consumption').by_instructor.find((x) => x.staff_id === s.id)?.revenue ?? 0;
  const monthSessions = scoped(ctx, ctx.db.class_sessions).filter((x) => x.start_at.slice(0, 7) === ym && (x.instructor_staff_id === s.id || x.substitute_staff_id === s.id)).length;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {s.name}
            {s.status === 'active' ? <Badge tone="success" label="재직" dot /> : <Badge tone="muted" label="퇴사" />}
          </span>
        }
        sub={`${ROLE_LABEL[s.role]} · ${EMP_LABEL[s.employment_type]}${s.phone ? ` · ${s.phone}` : ''}`}
        actions={
          <Link href="/staff" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <Icons.chevronLeft className="h-4 w-4" /> 목록
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="담당 회원" value={`${assigned.length}명`} />
        <Stat label="이번 달 수업" value={`${monthSessions}개`} />
        <Stat label="소진기준 매출" value={won(revenue)} />
        <Stat label="정산 방식" value={s.settlement_method ?? '-'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="이번 주 담당 수업">
          {weekCells.length > 0 ? (
            <ul className="space-y-1.5">
              {weekCells.map((c) => (
                <li key={c.session.id}>
                  <Link href={`/sessions/${c.session.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 transition-colors hover:bg-muted">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tnum text-sm font-semibold text-slate-700">{c.session.start_at.slice(5, 16).replace('T', ' ')}</span>
                      <Badge value={c.session.class_type} tone={TYPE_TONE[c.session.class_type]} label={c.session.name} dot />
                    </span>
                    <span className="tnum shrink-0 text-xs text-slate-500">{c.booked}/{c.capacity}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<Icons.calendar className="h-5 w-5" />} title="이번 주 배정된 수업이 없습니다" />
          )}
        </Card>

        <Card title={`담당 회원 (${assigned.length})`}>
          {assigned.length > 0 ? (
            <ul className="divide-y divide-line">
              {assigned.map((m) => (
                <li key={m.id}>
                  <Link href={`/members/${m.id}`} className="flex items-center justify-between gap-2 py-2.5 transition-colors hover:bg-muted">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{m.name}</span>
                      <Badge value={m.member_status} label={MEMBER_STATUS_LABEL[m.member_status]} />
                    </span>
                    <span className="tnum text-xs text-slate-400">{m.phone}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<Icons.users className="h-5 w-5" />} title="배정된 담당 회원이 없습니다" />
          )}
        </Card>
      </div>
    </div>
  );
}
