import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import { assertCan, dateKST, profitDashboard, ROLE_LABEL, scoped, won, ymOf } from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat } from '../../components/ui';
import { Icons } from '../../components/icons';

export const dynamic = 'force-dynamic';

const EMP_LABEL: Record<string, string> = { fulltime: '정직원', parttime: '파트타임', freelance: '프리랜서' };

export default function StaffPage() {
  const ctx = getContext();
  assertCan(ctx.role, 'users', 'read');
  const ym = ymOf(dateKST(ctx.now));
  const staff = scoped(ctx, ctx.db.staff);
  const members = scoped(ctx, ctx.db.members);
  const sessions = scoped(ctx, ctx.db.class_sessions).filter((s) => s.start_at.slice(0, 7) === ym);
  const revByStaff = new Map(profitDashboard(ctx, ym, 'consumption').by_instructor.map((x) => [x.staff_id, x.revenue]));

  const rows = staff.map((s) => ({
    s,
    assigned: members.filter((m) => m.assigned_staff_id === s.id).length,
    sessionCount: sessions.filter((x) => x.instructor_staff_id === s.id || x.substitute_staff_id === s.id).length,
    revenue: revByStaff.get(s.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader title="강사" sub={`${staff.length}명 · ${ym.replace('-', '년 ')}월 지표`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="전체 직원" value={`${staff.length}명`} />
        <Stat label="강사" value={`${staff.filter((s) => s.role === 'instructor').length}명`} />
        <Stat label="이번 달 수업" value={`${sessions.length}개`} />
        <Stat label="재직중" value={`${staff.filter((s) => s.status === 'active').length}명`} tone="pos" />
      </div>

      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ s, assigned, sessionCount, revenue }) => (
            <Link key={s.id} href={`/staff/${s.id}`} className="group rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-brand-300 hover:shadow-pop">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-700">{s.name.slice(0, 1)}</span>
                  <div>
                    <div className="font-semibold text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-400">{ROLE_LABEL[s.role]} · {EMP_LABEL[s.employment_type]}</div>
                  </div>
                </div>
                {s.status === 'active' ? <Badge tone="success" label="재직" dot /> : <Badge tone="muted" label="퇴사" />}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <div className="text-xs text-slate-400">담당 회원</div>
                  <div className="tnum text-sm font-bold text-slate-800">{assigned}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">이번 달 수업</div>
                  <div className="tnum text-sm font-bold text-slate-800">{sessionCount}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">소진 매출</div>
                  <div className="tnum text-sm font-bold text-slate-800">{won(revenue)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={<Icons.staff className="h-6 w-6" />} title="등록된 강사가 없습니다" /></Card>
      )}
    </div>
  );
}
