'use client';
// 회원 모바일웹 에러 경계.
import { Icons } from '../../components/icons';

export default function MemberError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-line bg-surface p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger-fg">
        <Icons.alert className="h-6 w-6" />
      </div>
      <h2 className="mb-1 text-base font-bold text-slate-900">문제가 발생했어요</h2>
      <p className="mb-5 text-sm text-slate-500">잠시 후 다시 시도해 주세요.</p>
      <button onClick={() => reset()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
        다시 시도
      </button>
    </div>
  );
}
