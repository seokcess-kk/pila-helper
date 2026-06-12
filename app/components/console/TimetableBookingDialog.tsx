'use client';
import { useEffect, useState } from 'react';
import { useFormStatus, useFormState } from 'react-dom';
import { adminBookAction, type BookState } from '../../actions';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { Field, Select } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { Icons } from '../icons';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      예약 등록
    </Button>
  );
}

export function TimetableBookingDialog({
  sessions,
  members,
}: {
  sessions: Array<{ id: string; label: string }>;
  members: Array<{ id: string; name: string; pass_label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [state, formAction] = useFormState<BookState, FormData>(adminBookAction, { status: 'idle' });

  useEffect(() => {
    if (state.status === 'ok') {
      toast({ title: '예약을 등록했습니다', variant: 'success' });
      setOpen(false);
    } else if (state.status === 'waitlist') {
      toast({ title: '정원 마감 — 대기예약으로 등록했습니다', variant: 'info' });
      setOpen(false);
    }
  }, [state, toast]);

  return (
    <>
      <Button size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        예약 추가
      </Button>
      {open ? (
        <Modal title="예약 추가" subtitle="운영자 대리예약 — 수업과 회원을 선택하세요" onClose={() => setOpen(false)}>
          <form action={formAction} className="space-y-3.5">
            <Field label="수업" required>
              <Select name="session_id" defaultValue="" required aria-label="수업 선택">
                <option value="">수업 선택…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="회원" required error={state.status === 'error' ? state.message : undefined}>
              <Select name="member_id" defaultValue="" required aria-label="회원 선택">
                <option value="">회원 선택…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.pass_label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Submit />
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
