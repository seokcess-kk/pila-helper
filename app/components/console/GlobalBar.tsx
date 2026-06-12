import { SearchInput } from '../ui/Field';
import { Icons } from '../icons';
import { QuickAddMenu } from './QuickAddMenu';
import { AccountMenu } from './AccountMenu';
import { NotificationBell } from './NotificationBell';
import { ActorSwitcher } from './ActorSwitcher';

/** 상단 글로벌 바 — 스튜디오 · 역할전환(데모) · 전역검색 · ＋빠른등록 · 알림 · 계정. */
export function GlobalBar({
  studioName,
  userName,
  roleLabel,
  email,
  unread,
  actorLabel,
  staff,
  canQuickAdd,
}: {
  studioName: string;
  userName: string;
  roleLabel: string;
  email?: string;
  unread?: number;
  actorLabel: string;
  staff: Array<{ id: string; name: string; roleLabel: string }>;
  canQuickAdd: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5">
      {/* 스튜디오 스위처(단일 지점은 표시만) */}
      <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 lg:flex">
        <Icons.building className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">{studioName}</span>
      </div>

      {/* 데모 역할 전환 */}
      <ActorSwitcher currentLabel={actorLabel} staff={staff} />

      {/* 전역 검색 */}
      <form action="/members" method="get" className="hidden min-w-0 flex-1 sm:block">
        <SearchInput name="q" placeholder="회원·연락처 검색" aria-label="회원·연락처 검색" className="max-w-md" />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        {canQuickAdd ? <QuickAddMenu /> : null}
        <NotificationBell unread={unread} />
        <AccountMenu name={userName} roleLabel={roleLabel} email={email} />
      </div>
    </div>
  );
}
