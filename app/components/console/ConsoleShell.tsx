'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icons } from '../icons';

/**
 * 콘솔 셸 — 데스크톱 고정 사이드바 + 스티키 글로벌 바 + 풀폭 본문.
 * 모바일에서는 사이드바를 햄버거로 여는 오버레이 드로어로 전환.
 */
export function ConsoleShell({ sidebar, bar, children }: { sidebar: ReactNode; bar: ReactNode; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-canvas">
      {/* 데스크톱 고정 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-surface lg:block">{sidebar}</aside>

      {/* 모바일 드로어 사이드바 */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface shadow-pop animate-fade-in"
            onClick={() => setMobileOpen(false)}
          >
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6">
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-muted lg:hidden"
          >
            <Icons.menu className="h-5 w-5" />
          </button>
          {bar}
        </header>
        <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
