'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icons } from '../icons';
import { cn } from '../ui/cn';

function Tab({ href, active, icon, label }: { href: string; active: boolean; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', active ? 'text-brand-700' : 'text-slate-400')}>
      <span className={cn(active ? 'text-brand-600' : 'text-slate-400')}>{icon}</span>
      {label}
    </Link>
  );
}

/** 회원 모바일 하단 탭바 — 예약 · 마이 · 알림. ?member= 데모 식별자 유지. */
export function MemberBottomNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const member = params.get('member');
  const q = member ? `?member=${member}` : '';
  const on = (p: string) => pathname === p || pathname.startsWith(p + '/');
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-sm -translate-x-1/2 border-t border-line bg-surface/95 backdrop-blur">
      <Tab href={`/m/booking${q}`} active={on('/m/booking')} icon={<Icons.calendar className="h-5 w-5" />} label="예약" />
      <Tab href={`/m/mypage${q}`} active={on('/m/mypage')} icon={<Icons.ticket className="h-5 w-5" />} label="마이" />
      <Tab href={`/m/alerts${q}`} active={on('/m/alerts')} icon={<Icons.bell className="h-5 w-5" />} label="알림" />
    </nav>
  );
}
