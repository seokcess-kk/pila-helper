import { notFound } from 'next/navigation';
import { getContext } from '@/server/db2.js';
import { can, getSessionDetail, listMembers } from '@/biz/index.js';
import { RouteDrawer } from '../../../../components/RouteDrawer';
import { SessionDetailView } from '../../../../components/SessionDetailView';

export const dynamic = 'force-dynamic';

export default function SessionModal({ params }: { params: { id: string } }) {
  const ctx = getContext();
  const detail = getSessionDetail(ctx, params.id);
  if (!detail) notFound();
  const s = detail.session;
  const closed = s.session_status === 'canceled';
  const members = listMembers(ctx, {}).map((r) => ({ id: r.member.id, name: r.member.name, pass_label: r.pass_label }));
  return (
    <RouteDrawer title={s.name} subtitle={`${s.start_at.slice(0, 16).replace('T', ' ')}${closed ? ' · 폐강' : ''}`}>
      <SessionDetailView detail={detail} members={members} canBook={can(ctx.role, 'reservations', 'create')} linkMembers={ctx.role !== 'instructor'} />
    </RouteDrawer>
  );
}
