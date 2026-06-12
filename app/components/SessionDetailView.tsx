import Link from 'next/link';
import type { SessionDetail } from '@/biz/index.js';
import {
  CLASS_TYPE_LABEL,
  MEMBER_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  type MemberStatus,
} from '@/biz/index.js';
import { Badge } from './ui/Badge';
import { Icons } from './icons';
import {
  AdminBookForm,
  AttendanceButtons,
  CancelReservationButton,
  CloseSessionButton,
  PromoteWaitlistButton,
} from './console/SessionActions';

type BookMember = { id: string; name: string; pass_label: string };

const TYPE_TONE: Record<string, 'warning' | 'info' | 'brand'> = {
  personal: 'warning',
  group: 'info',
  trial: 'brand',
};

/** 세션 상세 본문(드로어/풀페이지 공용) — 메타 + 출결 보드 + 대리예약 + 폐강. */
export function SessionDetailView({
  detail,
  members,
  canBook = true,
  linkMembers = true,
}: {
  detail: SessionDetail;
  members: BookMember[];
  canBook?: boolean;
  /** 회원 상세 링크 노출(강사는 담당 외 회원 360 접근 불가 → 일반 텍스트). */
  linkMembers?: boolean;
}) {
  const s = detail.session;
  const closed = s.session_status === 'canceled';
  const date = s.start_at.slice(0, 10);
  const time = `${s.start_at.slice(11, 16)}–${s.end_at.slice(11, 16)}`;
  const open = Math.max(0, detail.capacity - detail.booked);
  const full = open === 0;

  return (
    <div className="space-y-5">
      {/* 메타 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge value={s.class_type} tone={TYPE_TONE[s.class_type]} label={CLASS_TYPE_LABEL[s.class_type]} dot />
          <Badge value={s.session_status} label={SESSION_STATUS_LABEL[s.session_status]} />
        </div>
        <dl className="grid grid-cols-[4rem,1fr] gap-x-3 gap-y-2 rounded-lg bg-muted p-3 text-sm">
          <dt className="text-slate-400">일시</dt>
          <dd className="font-medium text-slate-800">
            {date} <span className="tnum">{time}</span>
          </dd>
          <dt className="text-slate-400">강사·룸</dt>
          <dd className="font-medium text-slate-800">
            {detail.instructor_name || '미배정'} · {detail.room_name || '룸 미지정'}
          </dd>
          <dt className="text-slate-400">정원</dt>
          <dd className="font-medium text-slate-800">
            <span className="tnum">{detail.booked}/{detail.capacity}</span>
            {detail.waitlist > 0 ? <span className="ml-2 text-warning-fg">대기 {detail.waitlist}</span> : null}
            {full ? <span className="ml-2 text-danger-fg">· 만석</span> : <span className="ml-2 text-slate-400">· 빈자리 {open}</span>}
          </dd>
        </dl>
      </div>

      {/* 출결 보드 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">예약 회원 · 출결</div>
          {detail.waitlist > 0 && open > 0 && !closed ? <PromoteWaitlistButton sessionId={s.id} /> : null}
        </div>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {detail.attendees.map((a) => {
            const actionable = a.status === 'booked' && !closed;
            return (
              <li key={a.reservation_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {linkMembers ? (
                      <Link href={`/members/${a.member_id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                        {a.member_name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{a.member_name}</span>
                    )}
                    <Badge value={a.member_status} label={MEMBER_STATUS_LABEL[a.member_status as MemberStatus]} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    <span className="tnum">{a.member_phone}</span> · {a.pass_label}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {actionable ? (
                    <>
                      <AttendanceButtons reservationId={a.reservation_id} sessionId={s.id} />
                      <CancelReservationButton reservationId={a.reservation_id} memberName={a.member_name} />
                    </>
                  ) : (
                    <>
                      <Badge value={a.status} label={RESERVATION_STATUS_LABEL[a.status]} dot />
                      {a.status === 'waitlisted' && !closed ? (
                        <CancelReservationButton reservationId={a.reservation_id} memberName={a.member_name} />
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {detail.attendees.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-400">아직 예약자가 없습니다</li>
          ) : null}
        </ul>
      </div>

      {/* 대리예약 */}
      {!closed && canBook ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">예약 추가 (대리예약)</div>
          <AdminBookForm sessionId={s.id} members={members} />
        </div>
      ) : null}

      {/* 푸터 */}
      <div className="flex items-center gap-3 border-t border-line pt-3">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Icons.info className="h-3.5 w-3.5" />
          출석 확정 시 정책에 따라 수강권 차감 + 소진기준 매출 인식
        </p>
        {!closed ? (
          <div className="ml-auto">
            <CloseSessionButton sessionId={s.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
