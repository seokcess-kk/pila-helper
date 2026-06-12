/**
 * 입력 검증/보안 테스트 (3회차) — 할인 경계, 패턴 길이(ReDoS 완화), 폐강 복구.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDb } from '../../src/data/seed.js';
import { DEMO_NOW, type DB } from '../../src/data/db.js';
import type { RequestContext } from '../../src/biz/context.js';
import { issuePass } from '../../src/biz/passService.js';
import { addMatchingRule } from '../../src/biz/matchingService.js';
import { book, attend, closeSession } from '../../src/biz/reservationService.js';
import { createSession } from '../../src/biz/classService.js';
import { netRevenue } from '../../src/biz/dashboardService.js';
import { monthRange } from '../../src/lib/util.js';

let db: DB;
let ctx: RequestContext;
let m4: string; // 정해나(무수강권)

beforeEach(() => {
  db = seedDb();
  ctx = { db, tenant_id: 'tenant_1', studio_id: 'studio_1', user_id: 'user_owner', role: 'owner', now: DEMO_NOW };
  m4 = db.members.find((m) => m.name === '정해나')!.id;
});

describe('할인 금액 검증 (ERD CHECK / QA-PAY-07)', () => {
  it('음수 할인 → 거부', () => {
    expect(() => issuePass(ctx, { member_id: m4, product_id: 'prod_g10', payment_method: 'cash', is_received: true, discount_amount: -50000 })).toThrow();
  });
  it('정가 초과 할인 → 거부(음수 매출 방지)', () => {
    const price = db.products.find((p) => p.id === 'prod_g10')!.price_amount;
    expect(() => issuePass(ctx, { member_id: m4, product_id: 'prod_g10', payment_method: 'cash', is_received: true, discount_amount: price + 1 })).toThrow();
  });
  it('정상 할인 → 실판매가 반영 + 음수 결제기준 매출 없음', () => {
    const { pass } = issuePass(ctx, { member_id: m4, product_id: 'prod_g10', payment_method: 'cash', is_received: true, discount_amount: 50000 });
    expect(db.purchases.find((p) => p.pass_id === pass.id)!.final_amount).toBe(250000);
    expect(db.revenue_records.every((r) => r.revenue_basis !== 'payment' || r.amount >= 0 || r.source_type === 'refund')).toBe(true);
  });
});

describe('매칭 규칙 패턴 길이 제한 (ReDoS 완화)', () => {
  it('과도하게 긴 패턴 → 거부', () => {
    expect(() => addMatchingRule(ctx, { match_field: 'vendor_name', pattern: 'a'.repeat(101), match_type: 'regex', target_match: 'expense' })).toThrow();
  });
});

describe('수업 폐강 — 예약 복구 + 소진 매출 상쇄', () => {
  it('폐강 시 booked 예약 취소·차감 복구(on_booking 시 소진 상쇄)', () => {
    const JUNE = monthRange('2026-06');
    const m1 = db.members.find((m) => m.name === '김지은')!.id;
    // on_booking 정책으로 임시 변경해 예약 시 차감·소진 인식 → 폐강 복구 검증
    db.studios[0]!.policy_json.booking.deduct_timing = 'on_booking';
    const sess = createSession(ctx, { class_type: 'group', name: '폐강테스트', instructor_staff_id: 'staff_kim', room_id: 'room_a', start_at: '2026-06-13T16:00:00+09:00', capacity: 6 });
    const r = book(ctx, { session_id: sess.id, member_id: m1 });
    expect(r.ok).toBe(true);
    const pass = db.passes.find((p) => p.member_id === m1 && p.pass_kind === 'group')!;
    const afterBook = pass.remaining_count!;
    const consAfterBook = netRevenue(ctx, 'consumption', JUNE);
    closeSession(ctx, sess.id);
    expect(db.passes.find((p) => p.id === pass.id)!.remaining_count).toBe(afterBook + 1); // 복구
    expect(netRevenue(ctx, 'consumption', JUNE)).toBe(consAfterBook - 30000); // 소진 상쇄
    expect(db.class_sessions.find((s) => s.id === sess.id)!.session_status).toBe('canceled');
  });
});
