/** v2 서비스 공용 유틸 — 금액·날짜·ID·기간 헬퍼. */
import type { ISODate, ISODateTime } from '../domain/index.js';

export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/** KST 기준 날짜(YYYY-MM-DD) */
export function dateKST(d: Date): ISODate {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** ISO 문자열(KST 오프셋 유지) */
export function isoKST(d: Date): ISODateTime {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

export function addDays(isoDate: ISODate, days: number): ISODate {
  const d = new Date(`${isoDate}T00:00:00+09:00`);
  return dateKST(new Date(d.getTime() + days * 86400000));
}

export function addMinutesISO(iso: ISODateTime, min: number): ISODateTime {
  const d = new Date(iso);
  return isoKST(new Date(d.getTime() + min * 60000));
}

/** 'YYYY-MM' → [월초, 월말] ISODate */
export function monthRange(ym: string): { start: ISODate; end: ISODate } {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function ymOf(d: ISODate): string {
  return d.slice(0, 7);
}

export function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** 접두사_N 형식 ID에서 최대 N+1 (갭/충돌 안전) */
export function nextId(rows: { id: string }[], prefix: string): string {
  const re = new RegExp(`^${prefix}_(\\d+)`);
  let max = 0;
  for (const r of rows) {
    const m = r.id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}_${max + 1}`;
}
