'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from './Toast';

// 모듈 플래그 — dev StrictMode의 이펙트 2회 실행으로 인한 중복 토스트 방지.
// msg가 사라지면(파라미터 정리 완료) 다시 false로 풀려, 동일 메시지의 후속 액션도 정상 표시.
let handled = false;

/**
 * 서버액션 성공 피드백 브리지 — redirect(`?toast=메시지&tt=타입`)로 전달된 결과를
 * 토스트로 띄우고 URL에서 파라미터를 제거(새로고침 시 재표시·URL 공유 시 가짜 성공 방지).
 */
export function ToastBridge() {
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const msg = params.get('toast');
  const tt = (params.get('tt') ?? 'success') as 'success' | 'error' | 'info';

  useEffect(() => {
    if (!msg) {
      handled = false;
      return;
    }
    if (handled) return;
    handled = true;
    toast({ title: msg, variant: tt });
    const next = new URLSearchParams(params.toString());
    next.delete('toast');
    next.delete('tt');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg]);

  return null;
}
