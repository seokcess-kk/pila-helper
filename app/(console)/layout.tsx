import { Suspense, type ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import { can, currentStudio, ROLE_LABEL } from '@/biz/index.js';
import { ToastBridge, ToastProvider } from '../components/ui';
import { ConsoleShell } from '../components/console/ConsoleShell';
import { Sidebar } from '../components/console/Sidebar';
import { GlobalBar } from '../components/console/GlobalBar';

export default function ConsoleLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const ctx = getContext();
  const studio = currentStudio(ctx);
  const me = ctx.db.users.find((u) => u.id === ctx.user_id);
  const curStaff = ctx.staff_id ? ctx.db.staff.find((s) => s.id === ctx.staff_id) : null;
  const staff = ctx.db.staff
    .filter((s) => s.studio_id === ctx.studio_id && s.status === 'active' && !s.deleted_at)
    .map((s) => ({ id: s.id, name: s.name, roleLabel: ROLE_LABEL[s.role] }));
  const actorLabel = curStaff ? curStaff.name : '샵 오너';
  const userName = curStaff ? curStaff.name : '원장님';

  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <ToastBridge />
      </Suspense>
      <ConsoleShell
        sidebar={<Sidebar studioName={studio.name} role={ctx.role} />}
        bar={
          <GlobalBar
            studioName={studio.name}
            userName={userName}
            roleLabel={ROLE_LABEL[ctx.role]}
            email={me?.email}
            actorLabel={actorLabel}
            staff={staff}
            canQuickAdd={can(ctx.role, 'members', 'create')}
          />
        }
      >
        {children}
        {modal}
      </ConsoleShell>
    </ToastProvider>
  );
}
