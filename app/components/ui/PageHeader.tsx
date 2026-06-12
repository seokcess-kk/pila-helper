import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 페이지 헤더 — 제목 + 보조설명 + 우측 주요 액션을 한 행에 표준 배치.
 * 화면마다 즉흥적으로 흩어진 제목/액션 위치를 통일한다.
 */
export function PageHeader({
  title,
  sub,
  actions,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {sub ? <div className="mt-0.5 text-sm text-slate-500">{sub}</div> : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** 구버전 호환 — 기존 PageTitle 시그니처 유지(점진 교체용). */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return <PageHeader title={children} actions={sub} />;
}

/** 목록 상단 툴바(검색·필터·요약·우측 액션). */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>;
}
