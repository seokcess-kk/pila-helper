'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { bookAction } from '../../actions';
import { Button } from '../ui/Button';
import { Icons } from '../icons';

function ConfirmSubmit({ full }: { full: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full size="lg" loading={pending} variant={full ? 'secondary' : 'primary'}>
      {full ? '대기 신청하기' : '예약 확정'}
    </Button>
  );
}

/** 예약 확인 바텀시트 — 회원이 수업·차감 안내를 확인한 뒤 확정(예약 확인 단계). */
export function BookConfirmSheet({
  sessionId,
  memberId,
  sessionName,
  timeLabel,
  instructor,
  room,
  full,
  hasPass,
  passText,
}: {
  sessionId: string;
  memberId: string;
  sessionName: string;
  timeLabel: string;
  instructor: string;
  room: string;
  full: boolean;
  hasPass: boolean;
  passText: string;
}) {
  const [open, setOpen] = useState(false);

  if (!hasPass) {
    return (
      <button disabled className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-slate-400">
        수강권 필요
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white ${full ? 'bg-warning' : 'bg-brand-600'}`}
      >
        {full ? '대기' : '예약'}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative mx-auto w-full max-w-sm rounded-t-2xl bg-surface p-5 pb-7 shadow-pop animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="text-base font-bold text-slate-900">{full ? '대기 신청' : '예약 확인'}</h2>
            <div className="mt-3 space-y-2 rounded-xl bg-muted p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">수업</span><span className="font-medium text-slate-800">{sessionName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">시간</span><span className="tnum font-medium text-slate-800">{timeLabel}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">강사·룸</span><span className="font-medium text-slate-800">{instructor} · {room}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">내 수강권</span><span className="font-medium text-slate-800">{passText}</span></div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Icons.info className="h-3.5 w-3.5" />
              {full ? '정원 마감 — 취소석 발생 시 자동 예약됩니다.' : '예약 시 수강권 1회가 차감됩니다.'}
            </p>
            <div className="mt-4 space-y-2">
              <form action={bookAction}>
                <input type="hidden" name="session_id" value={sessionId} />
                <input type="hidden" name="member_id" value={memberId} />
                <ConfirmSubmit full={full} />
              </form>
              <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg py-2 text-sm text-slate-500">
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
