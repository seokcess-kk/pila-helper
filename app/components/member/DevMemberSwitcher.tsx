'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icons } from '../icons';

/**
 * 데모 전용 미리보기 전환 — 실제 회원 앱 UI가 아니라, 시뮬레이터 바깥의 개발용 스트립.
 * 실서비스는 로그인 세션으로 본인이 고정되며 이 컨트롤은 존재하지 않음.
 */
export function DevMemberSwitcher({ members }: { members: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('member') ?? members[0]?.id ?? '';
  return (
    <div className="mx-auto flex max-w-sm items-center gap-2 px-3 py-1.5 text-[11px] text-slate-400">
      <Icons.user className="h-3 w-3" />
      <span>데모 미리보기</span>
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set('member', e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-slate-500"
        aria-label="데모 회원 전환"
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
