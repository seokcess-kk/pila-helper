'use client';
import { useState, useTransition } from 'react';
import { cancelAction } from '../../actions';
import { Icons } from '../icons';

/** 예약 취소(확인 후) — 취소 정책 안내 포함. */
export function CancelButton({ reservationId, memberId, classLabel }: { reservationId: string; memberId: string; classLabel: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-slate-500">
        취소
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative mx-auto w-full max-w-sm rounded-t-2xl bg-surface p-5 pb-7 shadow-pop animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="text-base font-bold text-slate-900">예약을 취소할까요?</h2>
            <p className="mt-1 text-sm text-slate-500">{classLabel}</p>
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-fg">
              <Icons.alert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              취소 마감 시간이 지난 뒤 취소하면 수강권 1회가 차감될 수 있어요.
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const fd = new FormData();
                    fd.set('reservation_id', reservationId);
                    fd.set('member_id', memberId);
                    await cancelAction(fd);
                    setOpen(false);
                  })
                }
                className="w-full rounded-lg bg-danger py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? '취소 중…' : '예약 취소하기'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg py-2 text-sm text-slate-500">
                유지하기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
