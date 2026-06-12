'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

/**
 * 라우트 인터셉트용 모달 — 닫으면 이전 화면(타임테이블 등)으로 router.back().
 * 서버 컴포넌트(세션 상세)를 children 으로 받아 그대로 렌더한다.
 */
export function RouteModal({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Modal title={title} subtitle={subtitle} onClose={() => router.back()}>
      {children}
    </Modal>
  );
}
