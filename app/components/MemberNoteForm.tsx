'use client';
import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { addMemberCounselingAction } from '../actions';
import { Button } from './ui/Button';
import { Textarea } from './ui/Field';
import { Icons } from './icons';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending} icon={<Icons.plus className="h-4 w-4" />}>
      메모 추가
    </Button>
  );
}

/** 상담/운영 메모 추가 — 제출 후 입력창 초기화. */
export function MemberNoteForm({ memberId }: { memberId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await addMemberCounselingAction(fd);
        ref.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="member_id" value={memberId} />
      <Textarea name="content" rows={2} required placeholder="상담 내용·운영 메모를 입력하세요" />
      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
