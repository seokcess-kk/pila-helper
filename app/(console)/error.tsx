'use client';
// 콘솔 라우트 에러 경계 — 서비스가 throw 하는 권한(ForbiddenError)·검증 오류를 친화적으로 표시.
import { Button } from '../components/ui/Button';
import { Icons } from '../components/icons';

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.message.includes('권한 없음');
  return (
    <div className="mx-auto mt-16 max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
      <div
        className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
          forbidden ? 'bg-warning-soft text-warning-fg' : 'bg-danger-soft text-danger-fg'
        }`}
      >
        {forbidden ? <Icons.settings className="h-6 w-6" /> : <Icons.alert className="h-6 w-6" />}
      </div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">{forbidden ? '접근 권한이 없습니다' : '문제가 발생했습니다'}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {forbidden ? '이 화면을 볼 수 있는 권한이 없어요. 관리자에게 문의해 주세요.' : '잠시 후 다시 시도해 주세요. 입력하던 내용은 사라지지 않았습니다.'}
      </p>
      <Button variant="secondary" onClick={() => reset()}>
        다시 시도
      </Button>
    </div>
  );
}
