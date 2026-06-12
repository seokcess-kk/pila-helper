'use client';
import { Menu, MenuLabel } from '../ui/Menu';
import { setActorAction } from '../../actions';
import { Icons } from '../icons';

/**
 * 데모 전용 역할 전환 — 실서비스엔 없는 개발용. 선택 시 actor 쿠키를 설정하고 대시보드로.
 * 역할별 메뉴 클로킹·강사 본인 범위 화면을 미리보기 위함.
 */
export function ActorSwitcher({
  currentLabel,
  staff,
}: {
  currentLabel: string;
  staff: Array<{ id: string; name: string; roleLabel: string }>;
}) {
  return (
    <Menu
      align="left"
      width="15rem"
      triggerLabel="역할 전환(데모)"
      triggerClassName="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:bg-muted"
      trigger={
        <>
          <Icons.user className="h-3.5 w-3.5" />
          <span className="hidden whitespace-nowrap md:inline">보기: {currentLabel}</span>
          <Icons.chevronDown className="h-3 w-3" />
        </>
      }
    >
      {() => (
        <>
          <MenuLabel>데모: 역할로 보기</MenuLabel>
          <ActorItem actor="owner" label="샵 오너 (전체)" />
          {staff.map((s) => (
            <ActorItem key={s.id} actor={s.id} label={`${s.name} · ${s.roleLabel}`} />
          ))}
        </>
      )}
    </Menu>
  );
}

function ActorItem({ actor, label }: { actor: string; label: string }) {
  return (
    <form action={setActorAction}>
      <input type="hidden" name="actor" value={actor} />
      <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-muted">
        {label}
      </button>
    </form>
  );
}
