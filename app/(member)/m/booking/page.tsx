import Link from 'next/link';
import { getDb, getMemberContext } from '@/server/db2.js';
import { addDays, dateKST, getTimetable } from '@/biz/index.js';
import { Badge } from '../../../components/ui';
import { Icons } from '../../../components/icons';
import { BookConfirmSheet } from '../../../components/member/BookConfirmSheet';

export const dynamic = 'force-dynamic';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const REASON: Record<string, string> = {
  no_pass: '수강권이 없어요',
  no_remaining: '잔여 횟수가 없어요',
  expired: '수강권이 만료됐어요',
  scope_mismatch: '이 수업에 맞는 수강권이 아니에요',
  not_open_yet: '아직 예약 오픈 전이에요',
  closed: '예약이 마감됐어요',
  session_canceled: '폐강된 수업이에요',
  daily_limit: '하루 예약 한도를 초과했어요',
  duplicate: '이미 같은 시간에 예약이 있어요',
};

export default function MemberBooking({ searchParams }: { searchParams: { member?: string; date?: string; msg?: string } }) {
  const db = getDb();
  const memberId = searchParams.member ?? db.members[0]?.id ?? '';
  const ctx = getMemberContext(memberId);
  const member = db.members.find((m) => m.id === memberId);
  const pass = db.passes.find((p) => p.member_id === memberId && p.pass_status === 'active');
  const passName = pass ? db.products.find((pp) => pp.id === pass.product_id)?.name : null;
  const passText = pass
    ? `${passName} ${pass.remaining_count != null ? `${pass.remaining_count}회` : '무제한'}`
    : '없음';

  const today = dateKST(ctx.now);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const cells = getTimetable(ctx, date, date).filter((c) => c.session.session_status !== 'canceled');
  const msg = searchParams.msg;
  const mq = `?member=${memberId}`;

  return (
    <div className="space-y-4">
      {/* 결과 배너 */}
      {msg ? (
        msg === 'ok' || msg === 'waitlist' ? (
          <div className="rounded-xl border border-success/30 bg-success-soft p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-success-fg">
              <Icons.check className="h-4 w-4" />
              {msg === 'ok' ? '예약이 완료됐어요!' : '대기 예약으로 등록됐어요'}
            </div>
            <Link href={`/m/mypage${mq}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success-fg underline">
              마이페이지에서 예약 확인 <Icons.arrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger-fg">
            {msg.split(',').map((r) => REASON[r] ?? r).join(' / ')}
          </div>
        )
      ) : null}

      {/* 내 수강권 요약 */}
      <div className="rounded-xl bg-brand-soft p-3">
        {pass ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-brand-900">
              <b>{passName}</b>{' '}
              {pass.remaining_count != null ? `${pass.remaining_count}회 남음` : '무제한'}
            </span>
            <span className="text-xs text-brand-700">~{pass.expire_date}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-danger-fg">
            <Icons.alert className="h-4 w-4" /> 유효한 수강권이 없어요
          </div>
        )}
      </div>

      {/* 날짜 선택 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">날짜 선택</div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const active = d === date;
            const dn = new Date(d + 'T12:00:00Z').getUTCDay();
            return (
              <Link
                key={d}
                href={`/m/booking?member=${memberId}&date=${d}`}
                className={`flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center ${
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-slate-600'
                }`}
              >
                <span className={`text-[11px] ${active ? 'text-white/80' : d === today ? 'text-brand-600' : 'text-slate-400'}`}>
                  {d === today ? '오늘' : DOW[dn]}
                </span>
                <span className="tnum text-lg font-bold">{d.slice(8)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 수업 목록 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">예약 가능한 수업</div>
        <div className="space-y-2">
          {cells.map((c) => {
            const full = c.booked >= c.capacity;
            const isPast = new Date(c.session.start_at) < ctx.now;
            const timeLabel = `${c.session.start_at.slice(11, 16)}`;
            return (
              <div key={c.session.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="tnum text-sm font-bold text-slate-900">{timeLabel}</span>
                    <span className="truncate text-sm font-medium text-slate-700">{c.session.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <span>{c.instructor_name}</span>
                    <span>·</span>
                    <span className="tnum">{c.booked}/{c.capacity}</span>
                    {isPast ? <Badge tone="muted" label="종료" /> : full ? <Badge tone="warning" label="대기 가능" /> : <Badge tone="success" label="예약 가능" dot />}
                  </div>
                </div>
                {isPast ? (
                  <span className="rounded-lg bg-muted px-3 py-1.5 text-xs text-slate-400">종료</span>
                ) : (
                  <BookConfirmSheet
                    sessionId={c.session.id}
                    memberId={memberId}
                    sessionName={c.session.name}
                    timeLabel={`${date.slice(5)} ${timeLabel}`}
                    instructor={c.instructor_name}
                    room={c.room_name}
                    full={full}
                    hasPass={!!pass}
                    passText={passText}
                  />
                )}
              </div>
            );
          })}
          {cells.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-slate-400">
              이 날은 예약 가능한 수업이 없어요
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
