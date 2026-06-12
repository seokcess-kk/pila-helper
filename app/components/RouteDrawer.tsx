'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Drawer } from './ui/Drawer';

/**
 * 라우트 인터셉트용 우측 드로어 — 닫으면 이전 화면(타임테이블 등)으로 router.back().
 * 서버 컴포넌트(세션 상세)를 children 으로 받아 그대로 렌더한다.
 */
export function RouteDrawer({
  title,
  subtitle,
  width = 'lg',
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: 'md' | 'lg';
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Drawer title={title} subtitle={subtitle} width={width} onClose={() => router.back()}>
      {children}
    </Drawer>
  );
}
