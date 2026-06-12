/**
 * RBAC 시행 테스트 — canon §5. 엔진(authz) + 서비스 게이트 + 회원 본인 격리.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDb } from '../../src/data/seed.js';
import { DEMO_NOW, type DB } from '../../src/data/db.js';
import type { RequestContext } from '../../src/biz/context.js';
import { can } from '../../src/biz/authz.js';
import { refundPass, issuePass } from '../../src/biz/passService.js';
import { matchBankToPayment, unmatchedBank } from '../../src/biz/matchingService.js';
import { adminDashboard } from '../../src/biz/dashboardService.js';
import { book, attend } from '../../src/biz/reservationService.js';
import { getMember360 } from '../../src/biz/memberService.js';

let db: DB;
let owner: RequestContext;
let m1Id: string;
let m2Id: string;
let memberCtx: RequestContext;
let instructorCtx: RequestContext;

beforeEach(() => {
  db = seedDb();
  owner = { db, tenant_id: 'tenant_1', studio_id: 'studio_1', user_id: 'user_owner', role: 'owner', now: DEMO_NOW };
  m1Id = db.members.find((m) => m.name === '김지은')!.id;
  m2Id = db.members.find((m) => m.name === '박서연')!.id;
  memberCtx = { ...owner, role: 'member', user_id: 'u_m1', member_id: m1Id };
  instructorCtx = { ...owner, role: 'instructor', user_id: 'user_kim', member_id: null };
});

describe('권한 매트릭스 (can)', () => {
  it('canon §5 핵심 규칙', () => {
    expect(can('owner', 'payments', 'update')).toBe(true);
    expect(can('member', 'payments', 'update')).toBe(false);
    expect(can('instructor', 'bank_balance', 'read')).toBe(false); // 강사 통장잔액 불가
    expect(can('owner', 'bank_balance', 'read')).toBe(true);
    expect(can('member', 'revenue', 'read')).toBe(false);
    expect(can('accountant', 'expenses', 'create')).toBe(true);
    expect(can('instructor', 'payments', 'update')).toBe(false); // 강사 환불 불가
  });
});

describe('서비스 게이트 — 비권한 역할 차단', () => {
  it('회원은 환불/발급/통장매칭/매출조회 불가(ForbiddenError)', () => {
    const pass = db.passes.find((p) => p.member_id === m1Id)!;
    expect(() => refundPass(memberCtx, pass.id)).toThrow();
    expect(() => issuePass(memberCtx, { member_id: m1Id, product_id: 'prod_g10', payment_method: 'cash', is_received: true })).toThrow();
    const dep = unmatchedBank(owner).find((t) => t.direction === 'deposit')!;
    const pay = db.payments.find((p) => p.payment_status === 'receivable')!;
    expect(() => matchBankToPayment(memberCtx, dep.id, pay.id)).toThrow();
    expect(() => adminDashboard(memberCtx)).toThrow();
  });

  it('강사는 매출 대시보드는 보되 통장잔액은 마스킹(0)', () => {
    const d = instructorCanSeeDashboard();
    expect(d.profit.bank_balance).toBe(0); // 강사 마스킹
    expect(adminDashboard(owner).profit.bank_balance).toBeGreaterThan(0); // 오너는 노출
  });
});

function instructorCanSeeDashboard() {
  return adminDashboard(instructorCtx);
}

describe('회원 본인 격리', () => {
  it('회원은 본인 예약만 — 타인 명의 예약 차단', () => {
    const groupSession = db.class_sessions.find((s) => s.class_type === 'group' && s.start_at.slice(0, 10) === '2026-06-12' && s.start_at.includes('18:00'))!;
    // 타인(m2) 명의로 예약 시도 → 차단
    expect(() => book(memberCtx, { session_id: groupSession.id, member_id: m2Id })).toThrow();
    // 본인(m1)은 정상
    const r = book(memberCtx, { session_id: groupSession.id, member_id: m1Id });
    expect(r.ok).toBe(true);
  });

  it('회원은 본인 360만 조회', () => {
    expect(() => getMember360(memberCtx, m2Id)).toThrow(); // 타인
    expect(getMember360(memberCtx, m1Id)).not.toBeNull(); // 본인
  });

  it('회원은 출결 처리 불가(운영자 전용)', () => {
    const res = db.reservations.find((r) => r.member_id === m1Id && r.reservation_status === 'booked')!;
    expect(() => attend(memberCtx, res.id)).toThrow();
  });
});
