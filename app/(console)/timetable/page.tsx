import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import { addDays, can, dateKST, getTimetable, listMembers, type TimetableCell } from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui';
import { Icons } from '../../components/icons';
import { TimetableControls } from '../../components/console/TimetableControls';
import { TimetableBookingDialog } from '../../components/console/TimetableBookingDialog';

export const dynamic = 'force-dynamic';

type View = 'day' | 'week' | 'month';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const TYPE_BORDER: Record<string, string> = {
  personal: 'border-l-warning',
  group: 'border-l-info',
  trial: 'border-l-brand-400',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function dow(date: string) {
  return new Date(date + 'T12:00:00Z').getUTCDay(); // 0=일
}
function monthRangeOf(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const first = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { first, last: `${y}-${pad(m + 1)}-${pad(lastDay)}`, y, m };
}

/** 세션 카드(주/일 뷰). */
function SessionCard({ c, dense = false }: { c: TimetableCell; dense?: boolean }) {
  const full = c.booked >= c.capacity;
  const canceled = c.session.session_status === 'canceled';
  const time = c.session.start_at.slice(11, 16);
  return (
    <Link
      href={`/sessions/${c.session.id}`}
      className={`block rounded-lg border border-line border-l-[3px] bg-surface p-2 transition hover:border-brand-200 hover:shadow-card ${TYPE_BORDER[c.session.class_type] ?? ''} ${canceled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold tnum text-slate-700">{time}</span>
        {canceled ? <Badge value="canceled" label="폐강" /> : full ? <Badge tone="danger" label="만석" /> : null}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{c.session.name}</div>
      <div className="truncate text-xs text-slate-500">
        {c.instructor_name || '미배정'}
        {!dense ? ` · ${c.room_name || '룸-'}` : ''} · <span className="tnum">{c.booked}/{c.capacity}</span>
      </div>
    </Link>
  );
}

export default function TimetablePage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string; staff?: string; room?: string; type?: string };
}) {
  const ctx = getContext();
  const today = dateKST(ctx.now);
  const view: View = searchParams.view === 'day' || searchParams.view === 'month' ? searchParams.view : 'week';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : today;
  // 강사 본인 범위: 강사 역할이면 본인 staff로 고정(셀프뷰)
  const lockStaff = ctx.role === 'instructor' ? ctx.staff_id ?? '' : '';
  const staff = lockStaff || searchParams.staff || '';
  const room = searchParams.room ?? '';
  const type = searchParams.type ?? '';

  // 기간 계산
  let from = date;
  let to = date;
  if (view === 'week') {
    const monday = addDays(date, -((dow(date) + 6) % 7));
    from = monday;
    to = addDays(monday, 6);
  } else if (view === 'month') {
    const r = monthRangeOf(date);
    from = r.first;
    to = r.last;
  }

  const cellsAll = getTimetable(ctx, from, to);
  // 필터 옵션(기간 내 등장하는 강사/룸)
  const staffMap = new Map<string, string>();
  const roomMap = new Map<string, string>();
  for (const c of cellsAll) {
    if (c.session.instructor_staff_id) staffMap.set(c.session.instructor_staff_id, c.instructor_name);
    if (c.session.room_id) roomMap.set(c.session.room_id, c.room_name);
  }
  const cells = cellsAll.filter(
    (c) =>
      (!staff || c.session.instructor_staff_id === staff) &&
      (!room || c.session.room_id === room) &&
      (!type || c.session.class_type === type),
  );

  // 예약 추가 다이얼로그용 데이터
  const bookable = cellsAll
    .filter((c) => c.session.session_status !== 'canceled')
    .map((c) => ({
      id: c.session.id,
      label: `${c.session.start_at.slice(5, 16).replace('T', ' ')} ${c.session.name} · ${c.instructor_name || '미배정'}`,
    }));
  const members = listMembers(ctx, {}).map((r) => ({ id: r.member.id, name: r.member.name, pass_label: r.pass_label }));

  const rangeLabel =
    view === 'day'
      ? `${date} (${DOW[dow(date)]})`
      : view === 'week'
        ? `${from} ~ ${to.slice(5)}`
        : `${date.slice(0, 7).replace('-', '년 ')}월`;

  return (
    <div>
      <PageHeader
        title="타임테이블 · 예약"
        sub={rangeLabel}
        actions={can(ctx.role, 'reservations', 'create') ? <TimetableBookingDialog sessions={bookable} members={members} /> : null}
      />

      <TimetableControls
        view={view}
        date={date}
        today={today}
        staff={staff}
        room={room}
        type={type}
        staffOptions={[...staffMap].map(([id, name]) => ({ id, name }))}
        roomOptions={[...roomMap].map(([id, name]) => ({ id, name }))}
      />

      {view === 'week' ? <WeekView from={from} cells={cells} today={today} /> : null}
      {view === 'day' ? <DayView date={date} cells={cells} /> : null}
      {view === 'month' ? <MonthView date={date} cells={cells} today={today} qs={{ staff, room, type }} /> : null}

      <p className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-warning" />1:1</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-info" />그룹</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-400" />체험</span>
        <span>· 카드 클릭 → 상세·출결 드로어</span>
      </p>
    </div>
  );
}

function WeekView({ from, cells, today }: { from: string; cells: TimetableCell[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day, i) => {
        const dayCells = cells.filter((c) => c.session.start_at.slice(0, 10) === day);
        const isToday = day === today;
        return (
          <div key={day} className={`rounded-card border bg-canvas/40 p-2 ${isToday ? 'border-brand-300 ring-1 ring-brand-100' : 'border-line'}`}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-600">{DOW[(i + 1) % 7]} {day.slice(8)}</span>
              {isToday ? <span className="rounded bg-brand-600 px-1.5 text-[10px] font-medium text-white">오늘</span> : null}
            </div>
            <div className="space-y-1.5">
              {dayCells.map((c) => (
                <SessionCard key={c.session.id} c={c} dense />
              ))}
              {dayCells.length === 0 ? <div className="px-1 py-3 text-center text-xs text-slate-300">—</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ date, cells }: { date: string; cells: TimetableCell[] }) {
  const dayCells = cells.filter((c) => c.session.start_at.slice(0, 10) === date);
  if (dayCells.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icons.calendar className="h-6 w-6" />}
          title="이 날 등록된 수업이 없습니다"
          description="우측 상단 ‘예약 추가’로 회원을 수업에 예약하거나, 다른 날짜를 확인해 보세요."
        />
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {dayCells.map((c) => (
        <SessionCard key={c.session.id} c={c} />
      ))}
    </div>
  );
}

function MonthView({
  date,
  cells,
  today,
  qs,
}: {
  date: string;
  cells: TimetableCell[];
  today: string;
  qs: { staff: string; room: string; type: string };
}) {
  const { first, m } = monthRangeOf(date);
  const gridStart = addDays(first, -((dow(first) + 6) % 7)); // 월요일 시작
  const weeks = 6;
  const byDay = new Map<string, TimetableCell[]>();
  for (const c of cells) {
    const d = c.session.start_at.slice(0, 10);
    const arr = byDay.get(d);
    if (arr) arr.push(c);
    else byDay.set(d, [c]);
  }
  const extra = [qs.staff && `staff=${qs.staff}`, qs.room && `room=${qs.room}`, qs.type && `type=${qs.type}`]
    .filter(Boolean)
    .join('&');
  const dayHref = (d: string) => `/timetable?view=day&date=${d}${extra ? '&' + extra : ''}`;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-muted text-center text-xs font-medium text-slate-500">
        {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const day = addDays(gridStart, i);
          const inMonth = new Date(day + 'T12:00:00Z').getUTCMonth() === m;
          const dayCells = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <div key={day} className={`min-h-[5.5rem] border-b border-r border-line p-1 ${inMonth ? '' : 'bg-muted/40'}`}>
              <Link
                href={dayHref(day)}
                className={`mb-1 flex h-5 w-5 items-center justify-center rounded text-xs ${isToday ? 'bg-brand-600 font-semibold text-white' : inMonth ? 'text-slate-600 hover:bg-muted' : 'text-slate-300'}`}
              >
                {day.slice(8)}
              </Link>
              <div className="space-y-0.5">
                {dayCells.slice(0, 3).map((c) => (
                  <Link
                    key={c.session.id}
                    href={`/sessions/${c.session.id}`}
                    className={`block truncate rounded border-l-2 bg-muted px-1 py-0.5 text-[11px] text-slate-600 hover:bg-brand-soft ${TYPE_BORDER[c.session.class_type] ?? ''}`}
                  >
                    <span className="tnum">{c.session.start_at.slice(11, 16)}</span> {c.session.name}
                  </Link>
                ))}
                {dayCells.length > 3 ? (
                  <Link href={dayHref(day)} className="block px-1 text-[11px] text-brand-600 hover:underline">
                    +{dayCells.length - 3}건 더
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
