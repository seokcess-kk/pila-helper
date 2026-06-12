'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icons } from '../icons';

/** 회원 앱 상단 헤더 — 스튜디오명 + 본인 인사 + 알림 진입. (운영 콘솔 링크 없음 = 회원 격리) */
export function MemberHeader({ studioName, names }: { studioName: string; names: Record<string, string> }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const member = params.get('member') ?? '';
  const name = names[member] ?? Object.values(names)[0] ?? '';
  const q = member ? `?member=${member}` : '';
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="leading-tight">
        <div className="text-[11px] text-slate-400">{studioName}</div>
        <div className="text-sm font-bold text-slate-900">{name} 님</div>
      </div>
      <Link
        href={`/m/alerts${q}`}
        aria-label="알림"
        className={`flex h-9 w-9 items-center justify-center rounded-full ${pathname.startsWith('/m/alerts') ? 'bg-brand-soft text-brand-700' : 'text-slate-400 hover:bg-muted'}`}
      >
        <Icons.bell className="h-5 w-5" />
      </Link>
    </header>
  );
}
