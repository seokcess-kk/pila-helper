'use client';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Icons } from '../icons';

/** 계정 메뉴 — 사용자/역할 표시 + 설정·로그아웃. */
export function AccountMenu({ name, roleLabel, email }: { name: string; roleLabel: string; email?: string }) {
  const initial = name.slice(0, 1);
  return (
    <Menu
      align="right"
      triggerLabel="계정 메뉴"
      triggerClassName="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
      trigger={
        <>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initial}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-slate-800">{name}</span>
            <span className="block text-xs text-slate-400">{roleLabel}</span>
          </span>
          <Icons.chevronDown className="h-3.5 w-3.5 text-slate-400" />
        </>
      }
    >
      {(close) => (
        <>
          <MenuLabel>{email ?? name}</MenuLabel>
          <MenuItem href="/settings" icon={<Icons.settings className="h-4 w-4" />} onClick={close}>
            설정
          </MenuItem>
          <MenuSeparator />
          <MenuItem href="/login" icon={<Icons.logout className="h-4 w-4" />} onClick={close} danger>
            로그아웃
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
