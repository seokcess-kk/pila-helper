'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { SegmentedNav } from '../ui/Tabs';
import { Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { Icons } from '../icons';

type View = 'day' | 'week' | 'month';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shift(date: string, view: View, dir: number): string {
  const d = new Date(date + 'T12:00:00Z');
  if (view === 'day') d.setUTCDate(d.getUTCDate() + dir);
  else if (view === 'week') d.setUTCDate(d.getUTCDate() + dir * 7);
  else d.setUTCMonth(d.getUTCMonth() + dir);
  return ymd(d);
}

export function TimetableControls({
  view,
  date,
  today,
  staff,
  room,
  type,
  staffOptions,
  roomOptions,
}: {
  view: View;
  date: string;
  today: string;
  staff: string;
  room: string;
  type: string;
  staffOptions: Array<{ id: string; name: string }>;
  roomOptions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/timetable?${next.toString()}`);
  };

  const hrefFor = (v: View) => {
    const next = new URLSearchParams(params.toString());
    next.set('view', v);
    next.set('date', date);
    return `/timetable?${next.toString()}`;
  };
  const typeHref = (t: string) => {
    const next = new URLSearchParams(params.toString());
    if (t) next.set('type', t);
    else next.delete('type');
    return `/timetable?${next.toString()}`;
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" aria-label="이전" onClick={() => push({ date: shift(date, view, -1) })}>
          <Icons.chevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => push({ date: today })}>
          오늘
        </Button>
        <Button variant="secondary" size="sm" aria-label="다음" onClick={() => push({ date: shift(date, view, 1) })}>
          <Icons.chevronRight className="h-4 w-4" />
        </Button>
      </div>

      <SegmentedNav<View>
        size="sm"
        current={view}
        hrefFor={hrefFor}
        options={[
          { value: 'day', label: '일' },
          { value: 'week', label: '주' },
          { value: 'month', label: '월' },
        ]}
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SegmentedNav
          size="sm"
          current={type}
          hrefFor={typeHref}
          options={[
            { value: '', label: '전체' },
            { value: 'personal', label: '1:1' },
            { value: 'group', label: '그룹' },
            { value: 'trial', label: '체험' },
          ]}
        />
        <Select aria-label="강사" value={staff} onChange={(e) => push({ staff: e.target.value })} className="h-8 w-28 text-xs">
          <option value="">강사 전체</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="룸" value={room} onChange={(e) => push({ room: e.target.value })} className="h-8 w-24 text-xs">
          <option value="">룸 전체</option>
          {roomOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
