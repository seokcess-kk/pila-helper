import { can, type Action, type Resource, type Role } from '@/biz/index.js';
import { NavLink } from '../NavLink';
import { Icons } from '../icons';

type Item = { href: string; label: string; icon: keyof typeof Icons; exact?: boolean; cap?: [Resource, Action] };

const SECTIONS: Array<{ label?: string; items: Item[] }> = [
  {
    label: '운영',
    items: [
      { href: '/dashboard', label: '대시보드', icon: 'dashboard' }, // 모든 역할
      { href: '/timetable', label: '타임테이블·예약', icon: 'calendar', cap: ['reservations', 'read'] },
      { href: '/members', label: '회원', icon: 'users', cap: ['members', 'read'] },
      { href: '/crm', label: '상담 CRM', icon: 'headset', cap: ['members', 'create'] },
    ],
  },
  {
    label: '재무 · 경영',
    items: [
      { href: '/finance', label: '손익 · 비용', icon: 'wallet', exact: true, cap: ['expenses', 'read'] },
      { href: '/finance/matching', label: '거래 매칭', icon: 'matching', cap: ['bank', 'read'] },
      { href: '/analysis', label: '수익분석', icon: 'chart', cap: ['expenses', 'read'] },
    ],
  },
  {
    label: '관리',
    items: [
      { href: '/passes', label: '수강권 · 상품', icon: 'ticket', cap: ['passes', 'create'] },
      { href: '/payments', label: '결제 · 미수금', icon: 'card', cap: ['payments', 'read'] },
      { href: '/staff', label: '강사', icon: 'staff', cap: ['users', 'read'] },
      { href: '/settings', label: '설정', icon: 'settings', cap: ['studio', 'read'] },
    ],
  },
];

export function Sidebar({ studioName, role }: { studioName: string; role: Role }) {
  const visible = (it: Item) => !it.cap || can(role, it.cap[0], it.cap[1]);
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter(visible) })).filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Icons.brand className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <div className="text-base font-extrabold tracking-tight text-slate-900">필라헬퍼</div>
          <div className="text-[11px] text-slate-400">{studioName}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {sections.map((section, i) => (
          <div key={i} className="space-y-1">
            {section.label ? (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.label}</div>
            ) : null}
            {section.items.map((item) => {
              const Icon = Icons[item.icon];
              return (
                <NavLink key={item.href} href={item.href} exact={item.exact} icon={<Icon className="h-[18px] w-[18px]" />}>
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <NavLink href="/m/booking" icon={<Icons.phone className="h-[18px] w-[18px]" />}>
          회원 화면 (데모)
        </NavLink>
      </div>
    </div>
  );
}
