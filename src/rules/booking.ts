/**
 * 예약 자격검증 — canon §6.1 정책 + §3.5 상태. 순수 함수.
 * 시간창(오픈/마감) · 정원(만석→대기) · 수강권 스코프/잔여/만료 · 1일한도 · 중복 판정.
 * 상세 규칙: docs/spec/14-booking-policy.md
 */
import type { BookingPolicy } from '../domain/index.js';
import type { ClassType, ISODate, ISODateTime } from '../domain/index.js';

export type EligibilityReason =
  | 'no_pass'
  | 'no_remaining'
  | 'expired'
  | 'scope_mismatch'
  | 'not_open_yet'
  | 'closed'
  | 'session_canceled'
  | 'daily_limit'
  | 'duplicate';

/** 자격검증용 수강권 후보(스토어와 분리된 순수 입력) */
export interface PassCandidate {
  id: string;
  class_types: ClassType[]; // product.allowed_class_types
  remaining_count: number | null; // null = 기간/무제한
  start_date: ISODate;
  expire_date: ISODate;
}

export interface SessionLite {
  id: string;
  class_type: ClassType;
  start_at: ISODateTime;
  capacity: number;
  booked_count: number;
  is_canceled: boolean;
}

export interface EligibilityInput {
  now: Date;
  session: SessionLite;
  policy: BookingPolicy;
  passes: PassCandidate[];
  /** 회원의 같은 날 활성 예약 수 */
  bookings_on_date: number;
  /** 같은 회차에 이미 활성 예약 보유 */
  has_duplicate: boolean;
}

export interface EligibilityResult {
  ok: boolean; // 즉시 확정 가능
  waitlist: boolean; // 자격은 되나 만석 → 대기 가능
  selected_pass_id?: string;
  reasons: EligibilityReason[];
}

function dateOf(iso: ISODateTime): ISODate {
  return iso.slice(0, 10);
}

/** 수강권이 해당 수업 유형을 커버하고 사용 가능한지 + 만료/잔여 판정 */
function evaluatePass(
  p: PassCandidate,
  classType: ClassType,
  sessionDate: ISODate,
): { usable: boolean; reason?: EligibilityReason } {
  if (!p.class_types.includes(classType)) return { usable: false, reason: 'scope_mismatch' };
  if (sessionDate > p.expire_date) return { usable: false, reason: 'expired' };
  if (p.remaining_count !== null && p.remaining_count <= 0)
    return { usable: false, reason: 'no_remaining' };
  return { usable: true };
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { now, session, policy, passes } = input;
  const reasons: EligibilityReason[] = [];

  if (session.is_canceled) reasons.push('session_canceled');

  // 시간창 판정
  const start = new Date(session.start_at).getTime();
  const openFrom = start - policy.booking_open_days * 86400000;
  const closeAt = start - policy.booking_close_minutes * 60000;
  if (now.getTime() < openFrom) reasons.push('not_open_yet');
  if (now.getTime() > closeAt) reasons.push('closed');

  // 중복·1일 한도
  if (input.has_duplicate) reasons.push('duplicate');
  if (policy.daily_booking_limit !== null && input.bookings_on_date >= policy.daily_booking_limit)
    reasons.push('daily_limit');

  // 수강권 선택 (§6.3 선택 규칙: 사용 가능한 것 중 만료 임박 우선)
  const sessionDate = dateOf(session.start_at);
  let selected: PassCandidate | undefined;
  if (passes.length === 0) {
    reasons.push('no_pass');
  } else {
    const usable = passes
      .map((p) => ({ p, ev: evaluatePass(p, session.class_type, sessionDate) }))
      .filter((x) => x.ev.usable)
      .map((x) => x.p)
      .sort((a, b) => (a.expire_date < b.expire_date ? -1 : 1));
    if (usable.length > 0) {
      selected = usable[0];
    } else {
      // 사용 가능 수강권 없음 → 가장 흔한 사유 1개 노출
      const reasonsOfPasses = passes.map(
        (p) => evaluatePass(p, session.class_type, sessionDate).reason!,
      );
      const pick: EligibilityReason =
        reasonsOfPasses.find((r) => r === 'no_remaining') ??
        reasonsOfPasses.find((r) => r === 'expired') ??
        reasonsOfPasses[0]!;
      reasons.push(pick);
    }
  }

  const blocked = reasons.length > 0 || !selected;
  if (blocked) {
    return { ok: false, waitlist: false, selected_pass_id: selected?.id, reasons };
  }

  // 자격 충족 — 정원 판정
  const full = session.booked_count >= session.capacity;
  return {
    ok: !full,
    waitlist: full,
    selected_pass_id: selected!.id,
    reasons: [],
  };
}
