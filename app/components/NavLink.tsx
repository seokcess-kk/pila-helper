'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from './ui/cn';

/** 사이드바 네비 항목 — 아이콘 + 라벨. 세그먼트 경계로 활성 판정(부분일치 오작동 방지). */
export function NavLink({
  href,
  icon,
  children,
  exact = false,
}: {
  href: string;
  icon?: ReactNode;
  children: ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-muted hover:text-slate-900',
      )}
    >
      {icon ? <span className={cn('shrink-0', active ? 'text-white' : 'text-slate-400')}>{icon}</span> : null}
      <span className="truncate">{children}</span>
    </Link>
  );
}
