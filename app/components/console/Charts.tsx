import { cn } from '../ui/cn';

export type BarRow = { label: string; value: number; color?: string; hint?: string };

/** 수평 막대 분해 — 매출 구성·비용 구성·수익성 분해 등. value 비중을 막대 길이로. */
export function HBars({
  rows,
  max,
  format = (n) => String(n),
  showPct = false,
}: {
  rows: BarRow[];
  max?: number;
  format?: (n: number) => string;
  showPct?: boolean;
}) {
  const m = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const total = rows.reduce((s, r) => s + Math.abs(r.value), 0) || 1;
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-slate-400">데이터 없음</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-slate-600">{r.label}</span>
            <span className="tnum shrink-0 font-medium text-slate-800">
              {format(r.value)}
              {showPct ? <span className="ml-1 text-slate-400">{Math.round((Math.abs(r.value) / total) * 100)}%</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', r.color ?? 'bg-brand-500')}
              style={{ width: `${Math.min(100, Math.round((Math.abs(r.value) / m) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 월별 추이 세로 막대. */
export function TrendBars({
  data,
  format = (n) => String(n),
}: {
  data: Array<{ label: string; value: number; highlight?: boolean }>;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="flex h-44 items-end gap-2">
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((Math.abs(d.value) / max) * 100));
        const neg = d.value < 0;
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="tnum text-[10px] text-slate-500">{format(d.value)}</span>
            <div
              className={cn('w-full max-w-[2.25rem] rounded-t', neg ? 'bg-danger' : d.highlight ? 'bg-brand-600' : 'bg-brand-300')}
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-slate-400">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 손익 워터폴 — 순매출에서 비용을 차감해 영업이익에 이르는 흐름을 비중 막대로. */
export function Waterfall({
  net,
  fixed,
  variable,
  operating,
  format,
}: {
  net: number;
  fixed: number;
  variable: number;
  operating: number;
  format: (n: number) => string;
}) {
  const base = Math.max(1, net);
  const seg = (v: number) => `${Math.min(100, Math.round((Math.abs(v) / base) * 100))}%`;
  return (
    <div className="space-y-3">
      <Step label="순매출" value={net} format={format} barClass="bg-brand-500" width="100%" />
      <Step label="− 고정비" value={-fixed} format={format} barClass="bg-warning" width={seg(fixed)} />
      <Step label="− 변동비" value={-variable} format={format} barClass="bg-warning/70" width={seg(variable)} />
      <div className="border-t border-line pt-3">
        <Step label="= 영업이익" value={operating} format={format} barClass={operating >= 0 ? 'bg-success' : 'bg-danger'} width={seg(operating)} strong />
      </div>
    </div>
  );
}

function Step({
  label,
  value,
  format,
  barClass,
  width,
  strong = false,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  barClass: string;
  width: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={strong ? 'font-semibold text-slate-800' : 'text-slate-600'}>{label}</span>
        <span className={cn('tnum font-semibold', value < 0 ? 'text-danger-fg' : strong ? 'text-success-fg' : 'text-slate-800')}>
          {format(value)}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', barClass)} style={{ width }} />
      </div>
    </div>
  );
}
