/**
 * 예약 서비스 — 타임테이블/예약·취소·대기·출결. canon §4·§6.1 / docs/spec 14.
 * 자격검증(rules/booking) + 차감 상태머신(rules/deduction) + 소진기준 매출(rules/revenue) 결합.
 */
import type {
  Attendance,
  ClassSession,
  ID,
  ISODate,
  Pass,
  Reservation,
} from '../domain/index.js';
import {
  checkEligibility,
  type EligibilityReason,
  type PassCandidate,
} from '../rules/booking.js';
import { computeDeduction, type DeductionEvent } from '../rules/deduction.js';
import { consumptionAmount, recognizeConsumption } from '../rules/revenue.js';
import { isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan, ForbiddenError } from './authz.js';
import { assertOwnMember, baseFields, currentStudio, scoped, scopedFind, touch, type RequestContext } from './context.js';
import { applyPassTxn } from './passService.js';
import { writeRevenue } from './revenueService.js';

const COUNTS_AS_BOOKED: ReadonlySet<Reservation['reservation_status']> = new Set(['booked', 'attended']);
const ACTIVE_RES: ReadonlySet<Reservation['reservation_status']> = new Set(['booked', 'waitlisted', 'attended']);
// 1일 예약 한도 산정: 확정 예약만(대기는 제외). canon §14 §2.4
const DAILY_LIMIT_RES: ReadonlySet<Reservation['reservation_status']> = new Set(['booked', 'attended']);

function sessionsScoped(ctx: RequestContext) {
  return scoped(ctx, ctx.db.class_sessions);
}

export function bookedCountOf(ctx: RequestContext, session_id: ID): number {
  return scoped(ctx, ctx.db.reservations).filter(
    (r) => r.class_session_id === session_id && COUNTS_AS_BOOKED.has(r.reservation_status),
  ).length;
}

/** 예약 차감 순소진 여부(차감 −1, 복구 +1 누적이 음수면 소진중) */
function consumedFor(ctx: RequestContext, reservation_id: ID): boolean {
  const sum = scoped(ctx, ctx.db.pass_transactions)
    .filter((t) => t.reservation_id === reservation_id)
    .reduce((s, t) => s + t.delta, 0);
  return sum < 0;
}

function passCandidates(ctx: RequestContext, member_id: ID): { pass: Pass; cand: PassCandidate }[] {
  return scoped(ctx, ctx.db.passes)
    .filter((p) => p.member_id === member_id && p.pass_status === 'active')
    .map((p) => {
      const product = scopedFind(ctx, ctx.db.products, (x) => x.id === p.product_id);
      return {
        pass: p,
        cand: {
          id: p.id,
          class_types: product?.allowed_class_types ?? [],
          remaining_count: p.remaining_count,
          start_date: p.start_date,
          expire_date: p.expire_date,
        } as PassCandidate,
      };
    });
}

// ── 타임테이블 / 상세 (UI) ────────────────────────────────────
export interface TimetableCell {
  session: ClassSession;
  instructor_name: string;
  room_name: string;
  booked: number;
  capacity: number;
}

export function getTimetable(ctx: RequestContext, from: ISODate, to: ISODate): TimetableCell[] {
  // 룩업 맵을 1회 구성(세션×조인 N+1 제거; 프로덕션은 SQL 조인/집계로 대체)
  const staffById = new Map(scoped(ctx, ctx.db.staff).map((s) => [s.id, s.name]));
  const roomById = new Map(scoped(ctx, ctx.db.rooms).map((r) => [r.id, r.name]));
  const bookedBySession = new Map<string, number>();
  for (const r of scoped(ctx, ctx.db.reservations)) {
    if (COUNTS_AS_BOOKED.has(r.reservation_status)) {
      bookedBySession.set(r.class_session_id, (bookedBySession.get(r.class_session_id) ?? 0) + 1);
    }
  }
  return sessionsScoped(ctx)
    .filter((s) => {
      const d = s.start_at.slice(0, 10);
      return d >= from && d <= to;
    })
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
    .map((s) => ({
      session: s,
      instructor_name: staffById.get(s.instructor_staff_id ?? '') ?? '',
      room_name: roomById.get(s.room_id ?? '') ?? '',
      booked: bookedBySession.get(s.id) ?? 0,
      capacity: s.capacity,
    }));
}

export interface SessionDetail {
  session: ClassSession;
  instructor_name: string;
  room_name: string;
  booked: number;
  waitlist: number;
  capacity: number;
  attendees: Array<{
    reservation_id: ID;
    member_id: ID;
    member_name: string;
    member_phone: string;
    member_status: string;
    pass_label: string;
    status: Reservation['reservation_status'];
  }>;
}

export function getSessionDetail(ctx: RequestContext, session_id: ID): SessionDetail | null {
  const s = sessionsScoped(ctx).find((x) => x.id === session_id);
  if (!s) return null;
  const order: Record<Reservation['reservation_status'], number> = {
    booked: 0, attended: 1, waitlisted: 2, no_show: 3, absent: 4, canceled: 5,
  };
  const attendees = scoped(ctx, ctx.db.reservations)
    .filter((r) => r.class_session_id === session_id && r.reservation_status !== 'canceled')
    .map((r) => {
      const m = scopedFind(ctx, ctx.db.members, (x) => x.id === r.member_id);
      const p = scopedFind(ctx, ctx.db.passes, (x) => x.id === r.pass_id);
      const prod = p ? scopedFind(ctx, ctx.db.products, (pp) => pp.id === p.product_id)?.name : undefined;
      const pass_label = p
        ? p.remaining_count != null
          ? `${prod} (${p.remaining_count}회)`
          : `${prod} (~${p.expire_date})`
        : '-';
      return {
        reservation_id: r.id,
        member_id: r.member_id,
        member_name: m?.name ?? '',
        member_phone: m?.phone ?? '',
        member_status: m?.member_status ?? 'enrolled',
        pass_label,
        status: r.reservation_status,
      };
    })
    .sort((a, b) => order[a.status] - order[b.status]);
  return {
    session: s,
    instructor_name: scopedFind(ctx, ctx.db.staff, (x) => x.id === s.instructor_staff_id)?.name ?? '',
    room_name: scopedFind(ctx, ctx.db.rooms, (r) => r.id === s.room_id)?.name ?? '',
    booked: bookedCountOf(ctx, session_id),
    waitlist: scoped(ctx, ctx.db.reservations).filter(
      (r) => r.class_session_id === session_id && r.reservation_status === 'waitlisted',
    ).length,
    capacity: s.capacity,
    attendees,
  };
}

// ── 예약 ──────────────────────────────────────────────────────
export type BookResult =
  | { ok: true; reservation: Reservation; waitlist: boolean }
  | { ok: false; reasons: EligibilityReason[] };

export function book(
  ctx: RequestContext,
  input: { session_id: ID; member_id: ID; is_self_booked?: boolean },
): BookResult {
  assertCan(ctx.role, 'reservations', 'create');
  assertOwnMember(ctx, input.member_id); // 회원은 본인만 예약
  const policy = currentStudio(ctx).policy_json.booking;
  const s = sessionsScoped(ctx).find((x) => x.id === input.session_id);
  if (!s) return { ok: false, reasons: [] };

  const cands = passCandidates(ctx, input.member_id);
  const sessionDate = s.start_at.slice(0, 10);
  const myActive = scoped(ctx, ctx.db.reservations).filter(
    (r) => r.member_id === input.member_id && ACTIVE_RES.has(r.reservation_status),
  );
  // 1일 한도는 확정 예약(booked/attended)만 — 대기(waitlisted)는 제외
  const bookings_on_date = myActive.filter((r) => {
    if (!DAILY_LIMIT_RES.has(r.reservation_status)) return false;
    const sess = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === r.class_session_id);
    return sess?.start_at.slice(0, 10) === sessionDate;
  }).length;
  const has_duplicate = myActive.some((r) => r.class_session_id === s.id);

  const result = checkEligibility({
    now: ctx.now,
    session: {
      id: s.id,
      class_type: s.class_type,
      start_at: s.start_at,
      capacity: s.capacity,
      booked_count: bookedCountOf(ctx, s.id),
      is_canceled: s.session_status === 'canceled',
    },
    policy,
    passes: cands.map((c) => c.cand),
    bookings_on_date,
    has_duplicate,
  });

  if (!result.ok && !result.waitlist) return { ok: false, reasons: result.reasons };

  const pass = cands.find((c) => c.pass.id === result.selected_pass_id)!.pass;
  const waitlist = result.waitlist;
  const at = isoKST(ctx.now);

  const reservation: Reservation = {
    id: nextId(ctx.db.reservations, 'res'),
    ...baseFields(ctx),
    class_session_id: s.id,
    member_id: input.member_id,
    pass_id: pass.id,
    reservation_status: waitlist ? 'waitlisted' : 'booked',
    booked_at: at,
    is_self_booked: input.is_self_booked ?? false,
    pass_transaction_id: null,
  };
  ctx.db.reservations.push(reservation);

  if (waitlist) {
    ctx.db.waitlists.push({
      id: nextId(ctx.db.waitlists, 'wl'),
      ...baseFields(ctx),
      class_session_id: s.id,
      member_id: input.member_id,
      pass_id: pass.id,
      position: scoped(ctx, ctx.db.waitlists).filter((w) => w.class_session_id === s.id && w.status === 'waiting').length + 1,
      status: 'waiting',
      requested_at: at,
    });
  } else if (policy.deduct_timing === 'on_booking') {
    deductAndRecognize(ctx, reservation, pass, s, 'book');
  }

  audit(ctx, { entity_type: 'reservations', entity_id: reservation.id, action: 'create', after: reservation });
  return { ok: true, reservation, waitlist };
}

/** 차감 이벤트 적용 + (차감/복구에 따른) 소진기준 매출 인식/상쇄 */
function deductAndRecognize(
  ctx: RequestContext,
  reservation: Reservation,
  pass: Pass,
  session: ClassSession,
  event: DeductionEvent,
  opts: { is_late_cancel?: boolean; attendance_id?: ID } = {},
): void {
  const policy = currentStudio(ctx).policy_json.booking;
  const consumed = consumedFor(ctx, reservation.id);
  const ded = computeDeduction(event, {
    deduct_timing: policy.deduct_timing,
    no_show_deduct: policy.no_show_deduct,
    late_cancel_deduct: policy.late_cancel_deduct,
    consumed,
    is_count_pass: pass.total_count !== null,
    is_late_cancel: opts.is_late_cancel,
  });
  if (ded.delta === 0 || !ded.reason) return;
  // 잔여 음수 방지: 이미 소진된 횟수권에서 추가 차감 금지(언더플로 가드)
  if (ded.delta < 0 && pass.remaining_count !== null && pass.remaining_count <= 0) return;

  const txn = applyPassTxn(ctx, pass, ded.reason, ded.delta, {
    reservation_id: reservation.id,
    attendance_id: opts.attendance_id ?? null,
  });
  reservation.pass_transaction_id = txn.id;

  // 소진기준 매출: 누적 인식 목표의 차이로 계산(라운딩 잔차는 마지막 회차에 흡수, 차감/복구 대칭).
  if (pass.total_count !== null && pass.remaining_count !== null) {
    const purchase = scopedFind(ctx, ctx.db.purchases, (p) => p.id === pass.purchase_id);
    const final_amount = purchase?.final_amount ?? pass.unit_price_amount * pass.total_count;
    const remaining_after = pass.remaining_count;
    const remaining_before = remaining_after - ded.delta;
    const amount = consumptionAmount(final_amount, pass.total_count, remaining_before, remaining_after);
    if (amount !== 0) {
      writeRevenue(
        ctx,
        recognizeConsumption({
          member_id: reservation.member_id,
          pass_transaction_id: txn.id,
          product_id: pass.product_id,
          unit_price_amount: amount, // 차감>0(consumption) / 복구<0(refund 조정)
          class_type: session.class_type,
          // 대체 강사 배정 시 실제 진행 강사로 귀속(canon §14 §8.3)
          instructor_staff_id: session.substitute_staff_id ?? session.instructor_staff_id ?? null,
          recognized_at: isoKST(ctx.now),
          source_type: amount > 0 ? 'consumption' : 'refund',
        }),
      );
    }
  }
}

function transition(
  ctx: RequestContext,
  reservation_id: ID,
  event: 'attend' | 'no_show' | 'absent',
): Reservation {
  // 출결은 운영자 전용(회원 불가) + 매트릭스 권한
  if (ctx.role === 'member') throw new ForbiddenError('member', 'reservations', 'update');
  assertCan(ctx.role, 'reservations', 'update');
  const r = scoped(ctx, ctx.db.reservations).find((x) => x.id === reservation_id);
  if (!r) throw new Error('예약 없음');
  // 멱등성: 출결은 booked 예약에만(이미 처리/취소된 예약 재처리 차단). canon §9.1
  if (r.reservation_status !== 'booked') throw new Error('출결 처리 불가: 예약(booked) 상태가 아닙니다');
  const s = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === r.class_session_id)!;
  const pass = scopedFind(ctx, ctx.db.passes, (x) => x.id === r.pass_id);
  const at = isoKST(ctx.now);

  const statusMap = { attend: 'attended', no_show: 'no_show', absent: 'absent' } as const;
  const attStatusMap = { attend: 'attended', no_show: 'no_show', absent: 'absent' } as const;

  // 출석 기록
  const attendance: Attendance = {
    id: nextId(ctx.db.attendance, 'att'),
    ...baseFields(ctx),
    reservation_id: r.id,
    class_session_id: s.id,
    member_id: r.member_id,
    attendance_status: attStatusMap[event],
    checked_at: at,
    checked_by: ctx.user_id,
    deducted: false,
  };
  ctx.db.attendance.push(attendance);

  if (pass) {
    // 결석(absent)은 출석 계열 차감(canon §14 #6) — 취소마감 정책과 무관. attend/absent → 'attend'
    const dedEvent: DeductionEvent = event === 'no_show' ? 'no_show' : 'attend';
    deductAndRecognize(ctx, r, pass, s, dedEvent, { attendance_id: attendance.id });
    attendance.deducted = consumedFor(ctx, r.id);
  }

  const before = r.reservation_status;
  r.reservation_status = statusMap[event];
  touch(ctx, r);
  audit(ctx, { entity_type: 'reservations', entity_id: r.id, action: 'update', before: { status: before }, after: { status: r.reservation_status } });
  return r;
}

export function attend(ctx: RequestContext, reservation_id: ID): Reservation {
  return transition(ctx, reservation_id, 'attend');
}
export function markNoShow(ctx: RequestContext, reservation_id: ID): Reservation {
  return transition(ctx, reservation_id, 'no_show');
}
export function markAbsent(ctx: RequestContext, reservation_id: ID): Reservation {
  return transition(ctx, reservation_id, 'absent');
}

export function cancelReservation(ctx: RequestContext, reservation_id: ID): ID {
  assertCan(ctx.role, 'reservations', 'update');
  const r = scoped(ctx, ctx.db.reservations).find((x) => x.id === reservation_id);
  if (!r) throw new Error('예약 없음');
  assertOwnMember(ctx, r.member_id); // 회원은 본인 예약만 취소
  // 취소 가능 상태만(booked/waitlisted). 이미 출결/취소된 예약 재취소 차단. canon §9.1
  if (r.reservation_status !== 'booked' && r.reservation_status !== 'waitlisted') {
    throw new Error('취소 불가: 예약/대기 상태가 아닙니다');
  }
  const s = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === r.class_session_id)!;
  const pass = scopedFind(ctx, ctx.db.passes, (x) => x.id === r.pass_id);
  const minutesBefore = (new Date(s.start_at).getTime() - ctx.now.getTime()) / 60000;
  // "시작 N분 전까지 무차감"(canon §6.1) — 경계(정확히 N분 전)는 포함하여 무차감. 그보다 가까우면 지각취소.
  const is_late_cancel = minutesBefore < currentStudio(ctx).policy_json.booking.cancel_deadline_minutes;

  if (pass && r.reservation_status === 'booked') {
    deductAndRecognize(ctx, r, pass, s, 'cancel', { is_late_cancel });
  }
  // 대기 예약 취소 시 연결된 대기열 행도 정리
  if (r.reservation_status === 'waitlisted') {
    const wl = scoped(ctx, ctx.db.waitlists).find(
      (w) => w.class_session_id === s.id && w.member_id === r.member_id && w.status === 'waiting',
    );
    if (wl) {
      wl.status = 'canceled';
      touch(ctx, wl);
    }
  }
  const wasBooked = r.reservation_status === 'booked';
  r.reservation_status = 'canceled';
  r.canceled_at = isoKST(ctx.now);
  r.is_late_cancel = is_late_cancel;
  touch(ctx, r);
  audit(ctx, { entity_type: 'reservations', entity_id: r.id, action: 'update', after: { status: 'canceled', is_late_cancel } });

  // 확정 예약 취소로 결원 발생 시에만 자동전환
  if (wasBooked && currentStudio(ctx).policy_json.booking.waitlist_auto_promote) promoteWaitlist(ctx, s.id);
  return s.id;
}

/** 대기 후보가 확정 시점에도 여전히 유효한가(수강권 유효·잔여 + 1일 한도). canon §14 §6.2 */
function stillEligibleForPromotion(ctx: RequestContext, member_id: ID, pass_id: ID | null, session: ClassSession): boolean {
  const policy = currentStudio(ctx).policy_json.booking;
  const pass = pass_id ? scoped(ctx, ctx.db.passes).find((p) => p.id === pass_id) : null;
  if (!pass || pass.pass_status !== 'active') return false;
  const sessionDate = session.start_at.slice(0, 10);
  if (sessionDate > pass.expire_date) return false;
  if (pass.remaining_count !== null && pass.remaining_count <= 0) return false;
  if (policy.daily_booking_limit !== null) {
    const onDate = scoped(ctx, ctx.db.reservations).filter((r) => {
      if (r.member_id !== member_id || !DAILY_LIMIT_RES.has(r.reservation_status)) return false;
      const sess = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === r.class_session_id);
      return sess?.start_at.slice(0, 10) === sessionDate;
    }).length;
    if (onDate >= policy.daily_booking_limit) return false;
  }
  return true;
}

/** 결원 시 대기 1순위 자동 확정 — 확정 전 후보 자격 재검사(무효 후보는 건너뜀). canon §14 §6.2 */
export function promoteWaitlist(ctx: RequestContext, session_id: ID): Reservation | null {
  const s = sessionsScoped(ctx).find((x) => x.id === session_id);
  if (!s) return null;
  if (bookedCountOf(ctx, session_id) >= s.capacity) return null;

  const queue = scoped(ctx, ctx.db.waitlists)
    .filter((w) => w.class_session_id === session_id && w.status === 'waiting')
    .sort((a, b) => a.position - b.position);

  for (const next of queue) {
    if (!stillEligibleForPromotion(ctx, next.member_id, next.pass_id ?? null, s)) {
      // 자격 상실 후보는 대기 만료 처리하고 다음 순번 시도
      next.status = 'expired';
      touch(ctx, next);
      continue;
    }
    next.status = 'promoted';
    next.promoted_at = isoKST(ctx.now);
    touch(ctx, next);
    const res = scoped(ctx, ctx.db.reservations).find(
      (r) => r.class_session_id === session_id && r.member_id === next.member_id && r.reservation_status === 'waitlisted',
    );
    if (res) {
      res.reservation_status = 'booked';
      touch(ctx, res);
      const pass = scoped(ctx, ctx.db.passes).find((x) => x.id === res.pass_id);
      if (pass && currentStudio(ctx).policy_json.booking.deduct_timing === 'on_booking') {
        deductAndRecognize(ctx, res, pass, s, 'book');
      }
      audit(ctx, { entity_type: 'reservations', entity_id: res.id, action: 'update', after: { status: 'booked', promoted: true } });
      return res;
    }
  }
  return null;
}

/** 수업 폐강: 예약 전원 복구 + 세션 상태 변경 */
export function closeSession(ctx: RequestContext, session_id: ID): void {
  assertCan(ctx.role, 'reservations', 'update');
  if (ctx.role === 'member') throw new ForbiddenError('member', 'reservations', 'update');
  const s = sessionsScoped(ctx).find((x) => x.id === session_id);
  if (!s) throw new Error('수업 없음');
  if (s.session_status === 'canceled') throw new Error('이미 폐강된 수업입니다'); // 멱등

  for (const r of scoped(ctx, ctx.db.reservations).filter(
    (x) => x.class_session_id === session_id && (x.reservation_status === 'booked' || x.reservation_status === 'waitlisted'),
  )) {
    const pass = scopedFind(ctx, ctx.db.passes, (x) => x.id === r.pass_id);
    if (pass && r.reservation_status === 'booked') {
      deductAndRecognize(ctx, r, pass, s, 'session_closed');
    }
    r.reservation_status = 'canceled';
    r.canceled_at = isoKST(ctx.now);
    touch(ctx, r);
  }
  s.session_status = 'canceled';
  touch(ctx, s);
  audit(ctx, { entity_type: 'class_sessions', entity_id: s.id, action: 'update', after: { status: 'canceled' } });
}
