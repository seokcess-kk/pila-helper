'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus, useFormState } from 'react-dom';
import {
  adminBookAction,
  attendanceAction,
  cancelReservationAdminAction,
  closeSessionAction,
  promoteWaitlistAction,
  type BookState,
} from '../../actions';
import { Button, buttonVariants } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Select } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { Icons } from '../icons';

/** 출석 / 노쇼 — 클릭 즉시 처리 + 토스트. */
export function AttendanceButtons({ reservationId, sessionId }: { reservationId: string; sessionId: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (event: 'attend' | 'no_show') =>
    start(async () => {
      const fd = new FormData();
      fd.set('reservation_id', reservationId);
      fd.set('session_id', sessionId);
      fd.set('event', event);
      await attendanceAction(fd);
      toast({ title: event === 'attend' ? '출석 처리했습니다' : '노쇼 처리했습니다', variant: 'success' });
    });
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="primary" loading={pending} onClick={() => run('attend')}>
        출석
      </Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run('no_show')}>
        노쇼
      </Button>
    </div>
  );
}

/** 예약 취소(확인 후). */
export function CancelReservationButton({ reservationId, memberName }: { reservationId: string; memberName: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        aria-label="예약 취소"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-danger-soft hover:text-danger-fg"
      >
        <Icons.x className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        title="예약을 취소할까요?"
        message={`${memberName} 님의 예약을 취소합니다. 정책에 따라 수강권이 복구되며, 차감 매출도 함께 상쇄됩니다.`}
        confirmLabel="예약 취소"
        onClose={() => setOpen(false)}
        onConfirm={() =>
          start(async () => {
            const fd = new FormData();
            fd.set('reservation_id', reservationId);
            await cancelReservationAdminAction(fd);
            toast({ title: '예약을 취소했습니다', variant: 'success' });
          })
        }
      />
      {pending ? <span className="sr-only">처리 중</span> : null}
    </>
  );
}

/** 대기 1순위 승격. */
export function PromoteWaitlistButton({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Icons.arrowRight className="h-3.5 w-3.5" />}
      loading={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set('session_id', sessionId);
          await promoteWaitlistAction(fd);
          toast({ title: '대기자를 예약으로 승격했습니다', variant: 'success' });
        })
      }
    >
      대기 승격
    </Button>
  );
}

/** 수업 폐강(확인 후). */
export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="dangerGhost" disabled={pending} onClick={() => setOpen(true)}>
        수업 폐강
      </Button>
      <ConfirmDialog
        open={open}
        title="이 수업을 폐강할까요?"
        message="예약된 회원 전원이 취소 처리되고 수강권이 복구됩니다. 되돌릴 수 없습니다."
        confirmLabel="폐강 처리"
        onClose={() => setOpen(false)}
        onConfirm={() =>
          start(async () => {
            const fd = new FormData();
            fd.set('session_id', sessionId);
            await closeSessionAction(fd);
            toast({ title: '수업을 폐강했습니다', variant: 'success' });
          })
        }
      />
    </>
  );
}

function BookSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending} icon={<Icons.plus className="h-4 w-4" />}>
      예약 추가
    </Button>
  );
}

/** 운영자 대리예약 폼 — 회원 선택 후 이 수업에 예약. 결과/사유를 인라인+토스트로. */
export function AdminBookForm({
  sessionId,
  members,
}: {
  sessionId: string;
  members: Array<{ id: string; name: string; pass_label: string }>;
}) {
  const toast = useToast();
  const [state, formAction] = useFormState<BookState, FormData>(adminBookAction, { status: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'ok') {
      toast({ title: '예약을 추가했습니다', variant: 'success' });
      formRef.current?.reset();
    } else if (state.status === 'waitlist') {
      toast({ title: '정원 마감 — 대기예약으로 등록했습니다', variant: 'info' });
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="flex items-center gap-2">
        <Select name="member_id" defaultValue="" aria-label="회원 선택" className="flex-1">
          <option value="">회원 선택…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.pass_label}
            </option>
          ))}
        </Select>
        <BookSubmit />
      </div>
      {state.status === 'error' && state.message ? (
        <p className={cn('text-xs text-danger-fg')}>{state.message}</p>
      ) : null}
    </form>
  );
}
