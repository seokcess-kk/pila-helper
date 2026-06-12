'use client';
import { Menu, MenuItem, MenuLabel } from '../ui/Menu';
import { Icons } from '../icons';

/** 알림 벨 — 운영 알림 진입점. (전체 알림 센터는 후속 단계) */
export function NotificationBell({ unread = 0 }: { unread?: number }) {
  return (
    <Menu
      align="right"
      width="16rem"
      triggerLabel="알림"
      triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-muted"
      trigger={
        <>
          <Icons.bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />
          ) : null}
        </>
      }
    >
      {(close) => (
        <>
          <MenuLabel>운영 알림</MenuLabel>
          <MenuItem href="/timetable" icon={<Icons.calendar className="h-4 w-4" />} onClick={close}>
            오늘 일정 확인
          </MenuItem>
          <MenuItem href="/finance" icon={<Icons.wallet className="h-4 w-4" />} onClick={close}>
            미수금·미입금 확인
          </MenuItem>
          <div className="px-2.5 py-2 text-xs text-slate-400">알림 센터는 준비 중입니다.</div>
        </>
      )}
    </Menu>
  );
}
