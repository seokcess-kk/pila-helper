'use client';
import { useState } from 'react';
import { Menu, MenuItem, MenuLabel } from '../ui/Menu';
import { buttonVariants } from '../ui/Button';
import { MemberFormModal } from '../AddMemberDialog';
import { Icons } from '../icons';

/** 글로벌 ＋빠른등록 — 핵심 생성 액션을 어느 화면에서든 2클릭 내로(스펙 P2). */
export function QuickAddMenu() {
  const [memberOpen, setMemberOpen] = useState(false);
  return (
    <>
      <Menu
        align="right"
        triggerLabel="빠른 등록"
        triggerClassName={buttonVariants({ variant: 'primary', size: 'md' })}
        trigger={
          <>
            <Icons.plus className="h-4 w-4" />
            <span className="hidden sm:inline">빠른 등록</span>
            <Icons.chevronDown className="h-3.5 w-3.5 opacity-80" />
          </>
        }
      >
        {(close) => (
          <>
            <MenuLabel>등록</MenuLabel>
            <MenuItem
              icon={<Icons.users className="h-4 w-4" />}
              onClick={() => {
                close();
                setMemberOpen(true);
              }}
            >
              회원 등록
            </MenuItem>
            <MenuItem href="/crm" icon={<Icons.headset className="h-4 w-4" />} onClick={close}>
              상담 등록
            </MenuItem>
            <MenuItem href="/timetable" icon={<Icons.calendar className="h-4 w-4" />} onClick={close}>
              예약 등록
            </MenuItem>
            <MenuItem href="/members" icon={<Icons.ticket className="h-4 w-4" />} onClick={close}>
              수강권·결제
            </MenuItem>
            <MenuItem href="/finance" icon={<Icons.wallet className="h-4 w-4" />} onClick={close}>
              지출 등록
            </MenuItem>
          </>
        )}
      </Menu>
      <MemberFormModal open={memberOpen} onClose={() => setMemberOpen(false)} />
    </>
  );
}
