import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import { can, listMembers, MEMBER_STATUS_LABEL, won, type MemberStatus } from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat, buttonVariants } from '../../components/ui';
import { Icons } from '../../components/icons';
import { AddMemberDialog } from '../../components/AddMemberDialog';
import { MemberFilters } from '../../components/console/MemberFilters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

export default function MembersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; sort?: string; page?: string };
}) {
  const ctx = getContext();
  const q = (searchParams.q ?? '').trim();
  const status = (searchParams.status ?? '') as MemberStatus | '';
  const sort = searchParams.sort ?? 'name';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  // 강사 본인 범위: 담당 회원만(셀프뷰). 생성 권한 없으면 등록 버튼 숨김.
  const isInstructor = ctx.role === 'instructor';
  const canCreate = can(ctx.role, 'members', 'create');
  let all = listMembers(ctx, {});
  if (isInstructor && ctx.staff_id) all = all.filter((r) => r.member.assigned_staff_id === ctx.staff_id);
  // 요약(전체 기준)
  const summary = {
    total: all.length,
    active: all.filter((r) => r.member.member_status === 'enrolled' || r.member.member_status === 're_enrolled').length,
    receivable: all.filter((r) => r.receivable > 0).length,
    dormant: all.filter((r) => r.member.member_status === 'dormant').length,
  };

  // 검색 + 상태 결합 필터
  const filtered = all.filter((r) => {
    if (q && !r.member.name.includes(q) && !r.member.phone.includes(q)) return false;
    if (status && r.member.member_status !== status) return false;
    return true;
  });
  // 정렬
  filtered.sort((a, b) => {
    if (sort === 'recent') return (b.last_visit ?? '').localeCompare(a.last_visit ?? '');
    if (sort === 'receivable') return b.receivable - a.receivable;
    return a.member.name.localeCompare(b.member.name, 'ko');
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const rows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    if (sort !== 'name') sp.set('sort', sort);
    sp.set('page', String(p));
    return `/members?${sp.toString()}`;
  };

  const GRID = 'grid grid-cols-[1.3fr_1fr_1.5fr_0.9fr_0.9fr_0.9fr] items-center gap-3';

  return (
    <div>
      <PageHeader title={isInstructor ? '담당 회원' : '회원'} sub={`총 ${summary.total}명`} actions={canCreate ? <AddMemberDialog /> : undefined} />

      {/* 요약 */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="전체 회원" value={`${summary.total}명`} />
        <Stat label="활성 회원" value={`${summary.active}명`} tone="pos" />
        <Stat label="미수금 회원" value={`${summary.receivable}명`} tone={summary.receivable ? 'warn' : 'default'} href="/finance" />
        <Stat label="휴면 회원" value={`${summary.dormant}명`} />
      </div>

      <MemberFilters q={q} status={status} sort={sort} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icons.users className="h-6 w-6" />}
            title={q || status ? '조건에 맞는 회원이 없습니다' : '아직 등록된 회원이 없습니다'}
            description={q || status ? '검색어나 필터를 바꿔보세요.' : isInstructor ? '아직 배정된 담당 회원이 없습니다.' : '첫 회원을 등록하고 예약 관리를 시작해보세요.'}
            action={canCreate && !q && !status ? <AddMemberDialog /> : undefined}
          />
        </Card>
      ) : (
        <>
          {/* 데스크톱 테이블 */}
          <Card bodyClassName="p-0" className="hidden md:block">
            <div className={`${GRID} border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400`}>
              <span>이름</span>
              <span>연락처</span>
              <span>수강권</span>
              <span>상태</span>
              <span className="text-right">미수금</span>
              <span>최근 방문</span>
            </div>
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <Link key={r.member.id} href={`/members/${r.member.id}`} className={`${GRID} px-4 py-3 text-sm transition-colors hover:bg-muted`}>
                  <span className="font-medium text-brand-700">{r.member.name}</span>
                  <span className="tnum text-slate-500">{r.member.phone}</span>
                  <span className="truncate text-slate-600">{r.pass_label}</span>
                  <span><Badge value={r.member.member_status} label={MEMBER_STATUS_LABEL[r.member.member_status]} dot /></span>
                  <span className={`tnum text-right ${r.receivable > 0 ? 'text-warning-fg' : 'text-slate-300'}`}>{r.receivable > 0 ? won(r.receivable) : '-'}</span>
                  <span className="tnum text-slate-500">{r.last_visit ?? '-'}</span>
                </Link>
              ))}
            </div>
          </Card>

          {/* 모바일 카드 */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Link key={r.member.id} href={`/members/${r.member.id}`} className="block rounded-card border border-line bg-surface p-3 shadow-card transition-colors hover:border-brand-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-slate-800">
                    {r.member.name}
                    <Badge value={r.member.member_status} label={MEMBER_STATUS_LABEL[r.member.member_status]} dot />
                  </span>
                  <span className="text-xs text-slate-400">{r.last_visit ?? '미방문'}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  <span className="tnum">{r.member.phone}</span> · {r.pass_label}
                </div>
                {r.receivable > 0 ? <div className="mt-1 text-xs text-warning-fg">미수금 {won(r.receivable)}</div> : null}
              </Link>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Link
                href={pageHref(Math.max(1, curPage - 1))}
                aria-disabled={curPage === 1}
                className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ${curPage === 1 ? 'pointer-events-none opacity-40' : ''}`}
              >
                <Icons.chevronLeft className="h-4 w-4" /> 이전
              </Link>
              <span className="tnum px-2 text-slate-500">{curPage} / {totalPages}</span>
              <Link
                href={pageHref(Math.min(totalPages, curPage + 1))}
                aria-disabled={curPage === totalPages}
                className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ${curPage === totalPages ? 'pointer-events-none opacity-40' : ''}`}
              >
                다음 <Icons.chevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
