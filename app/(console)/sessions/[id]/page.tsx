import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/server/db2.js';
import { can, getSessionDetail, listMembers } from '@/biz/index.js';
import { Card, PageHeader, buttonVariants } from '../../../components/ui';
import { SessionDetailView } from '../../../components/SessionDetailView';
import { Icons } from '../../../components/icons';

export const dynamic = 'force-dynamic';

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const ctx = getContext();
  const detail = getSessionDetail(ctx, params.id);
  if (!detail) notFound();
  const s = detail.session;
  const members = listMembers(ctx, {}).map((r) => ({ id: r.member.id, name: r.member.name, pass_label: r.pass_label }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={s.name}
        sub={`${s.start_at.slice(0, 16).replace('T', ' ')} · 정원 ${detail.capacity} · 예약 ${detail.booked}`}
        actions={
          <Link href="/timetable" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Icons.chevronLeft className="h-4 w-4" /> 타임테이블
          </Link>
        }
      />
      <Card>
        <SessionDetailView detail={detail} members={members} canBook={can(ctx.role, 'reservations', 'create')} linkMembers={ctx.role !== 'instructor'} />
      </Card>
    </div>
  );
}
