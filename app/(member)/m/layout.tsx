import type { ReactNode } from 'react';
import { getDb } from '@/server/db2.js';
import { MemberHeader } from '../../components/member/MemberHeader';
import { MemberBottomNav } from '../../components/member/MemberBottomNav';
import { DevMemberSwitcher } from '../../components/member/DevMemberSwitcher';

export default function MemberLayout({ children }: { children: ReactNode }) {
  const db = getDb();
  const members = db.members.filter((m) => !m.deleted_at).map((m) => ({ id: m.id, name: m.name }));
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const studioName = db.studios.find((s) => s.id === 'studio_1')?.name ?? '필라테스';

  return (
    <div className="min-h-screen bg-slate-100">
      <DevMemberSwitcher members={members} />
      <div className="relative mx-auto min-h-screen max-w-sm bg-canvas shadow-sm">
        <MemberHeader studioName={studioName} names={names} />
        <main className="px-4 pb-24 pt-4">{children}</main>
        <MemberBottomNav />
      </div>
    </div>
  );
}
