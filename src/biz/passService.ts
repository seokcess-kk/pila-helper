/**
 * 수강권/판매 서비스 — 발급(purchase+payment+pass+결제기준 매출), 차감원장(pass_transactions),
 * 홀딩/재개, 환불(rules/refund). canon §4·§6.2·§6.3 / docs/spec 15·16.
 */
import type { ID, Pass, PassTransaction, PassTxnReason, Payment, Purchase } from '../domain/index.js';
import { computeRefund } from '../rules/refund.js';
import { computeUnitPrice, recognizePayment, recognizeRefund } from '../rules/revenue.js';
import { addDays, dateKST, isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, currentStudio, scoped, touch, type RequestContext } from './context.js';
import { writeRevenue } from './revenueService.js';

export interface IssuePassInput {
  member_id: ID;
  product_id: ID;
  payment_method: Payment['payment_method'];
  is_received: boolean;
  start_date?: string;
  discount_amount?: number;
  seller_staff_id?: ID | null;
}

export interface IssuePassResult {
  purchase: Purchase;
  payment: Payment;
  pass: Pass;
}

/** 수강권 발급: 구매·결제·수강권 생성 + 결제기준 매출 인식(+현장카드면 card_sale). */
export function issuePass(ctx: RequestContext, input: IssuePassInput): IssuePassResult {
  assertCan(ctx.role, 'payments', 'create');
  const product = scoped(ctx, ctx.db.products).find((p) => p.id === input.product_id);
  if (!product) throw new Error('수강권 상품 없음');
  const member = scoped(ctx, ctx.db.members).find((m) => m.id === input.member_id);
  if (!member) throw new Error('회원 없음');

  const start_date = input.start_date ?? dateKST(ctx.now);
  const discount = input.discount_amount ?? 0;
  // 할인 검증(ERD CHECK discount>=0, final>=0 / QA-PAY-07 음수불가)
  if (!Number.isInteger(discount) || discount < 0 || discount > product.price_amount) {
    throw new Error('할인 금액이 유효하지 않습니다(0 이상, 정가 이하 정수)');
  }
  const final_amount = product.price_amount - discount;
  const at = isoKST(ctx.now);

  // 구매
  const purchase: Purchase = {
    id: nextId(ctx.db.purchases, 'pur'),
    ...baseFields(ctx),
    member_id: member.id,
    product_id: product.id,
    pass_id: null,
    list_amount: product.price_amount,
    discount_amount: discount,
    final_amount,
    purchased_at: at,
    seller_staff_id: input.seller_staff_id ?? null,
  };
  ctx.db.purchases.push(purchase);

  // 결제 (미수 처리 반영)
  const paid_amount = input.is_received ? final_amount : 0;
  const receivable_amount = final_amount - paid_amount;
  // 신규/재등록 귀속은 발급(승격) 직전 상태로 판정해 결제에 스냅샷(입금 지연 인식 대비)
  const is_re_enroll = member.member_status === 'expired';
  const is_new_member = ['new_inquiry', 'consulting', 'trial_booked', 'trial_done'].includes(member.member_status);

  // 미결제 등록은 미수금(canon §4.4). 입금대기는 별도 흐름.
  const payment_status: Payment['payment_status'] = input.is_received ? 'paid' : 'receivable';
  const payment: Payment = {
    id: nextId(ctx.db.payments, 'pay'),
    ...baseFields(ctx),
    purchase_id: purchase.id,
    member_id: member.id,
    payment_status,
    payment_method: input.payment_method,
    amount: final_amount,
    paid_amount,
    paid_at: input.is_received ? at : null,
    receivable_amount,
    staff_id: input.seller_staff_id ?? ctx.user_id,
    is_new_member,
    is_re_enroll,
  };
  ctx.db.payments.push(payment);

  // 수강권 인스턴스
  const pass: Pass = {
    id: nextId(ctx.db.passes, 'pass'),
    ...baseFields(ctx),
    member_id: member.id,
    product_id: product.id,
    purchase_id: purchase.id,
    pass_kind: product.pass_kind,
    total_count: product.total_count,
    remaining_count: product.total_count,
    start_date,
    expire_date: product.valid_days ? addDays(start_date, product.valid_days) : addDays(start_date, 365),
    pass_status: 'active',
    paused_at: null,
    paused_days_used: 0,
    unit_price_amount: computeUnitPrice(final_amount, product.total_count),
  };
  ctx.db.passes.push(pass);
  purchase.pass_id = pass.id;

  // 결제기준 매출 인식(실수령분만). 미수는 입금 시 인식. 인식 시점은 정책(on_paid/on_deposit).
  // on_deposit 라도 발급 시 이미 전액 수령(현금·현장카드 등 paid)된 건은 즉시 인식(통장 입금 매칭 경로가 없으므로).
  const recognizeAtIssue =
    currentStudio(ctx).policy_json.finance.revenue_recognition === 'on_paid' || payment_status === 'paid';
  if (paid_amount > 0 && recognizeAtIssue) {
    writeRevenue(
      ctx,
      recognizePayment({
        member_id: member.id,
        payment_id: payment.id,
        product_id: product.id,
        paid_amount,
        recognized_at: at,
        marketing_source: member.marketing_source,
        is_new_member,
        is_re_enroll,
      }),
    );
  }

  // 회원 상태 승격
  const beforeStatus = member.member_status;
  member.member_status = is_re_enroll ? 're_enrolled' : 'enrolled';
  touch(ctx, member);

  // 현장카드 → 카드매출(승인) 기록
  if (input.payment_method === 'card_onsite') {
    const csId = nextId(ctx.db.card_sales, 'cs');
    const fee = Math.round(final_amount * currentStudio(ctx).policy_json.finance.card_fee_rate);
    ctx.db.card_sales.push({
      id: csId,
      ...baseFields(ctx),
      payment_id: payment.id,
      approval_no: `APP-${csId}`,
      amount: final_amount,
      approved_at: at,
      captured_at: null,
      deposited_at: null,
      reconciliation_stage: 'approved',
      fee_amount: fee,
      net_deposit_amount: final_amount - fee,
      bank_transaction_id: null,
    });
  }

  audit(ctx, { entity_type: 'passes', entity_id: pass.id, action: 'create', after: { pass, beforeStatus } });
  return { purchase, payment, pass };
}

/** 차감/복구 원장 1건 적재 + 잔여·상태 갱신(순수 인벤토리). 매출 인식은 호출측에서. */
export function applyPassTxn(
  ctx: RequestContext,
  pass: Pass,
  reason: PassTxnReason,
  delta: number,
  links: { reservation_id?: ID | null; attendance_id?: ID | null; memo?: string } = {},
): PassTransaction {
  if (pass.remaining_count !== null) {
    pass.remaining_count += delta;
    if (pass.remaining_count <= 0 && pass.pass_status === 'active') pass.pass_status = 'used_up';
    if (pass.remaining_count > 0 && pass.pass_status === 'used_up') pass.pass_status = 'active';
  }
  touch(ctx, pass);
  const txn: PassTransaction = {
    id: nextId(ctx.db.pass_transactions, 'pt'),
    ...baseFields(ctx),
    pass_id: pass.id,
    member_id: pass.member_id,
    reason,
    delta,
    balance_after: pass.remaining_count,
    reservation_id: links.reservation_id ?? null,
    attendance_id: links.attendance_id ?? null,
    memo: links.memo,
  };
  ctx.db.pass_transactions.push(txn);
  if (reason === 'manual_deduct' || reason === 'manual_restore') {
    audit(ctx, { entity_type: 'pass_transactions', entity_id: txn.id, action: 'pass_adjust', after: txn });
  }
  return txn;
}

/** 홀딩(일시정지): 만료일을 정지일수만큼 연장 */
export function holdPass(ctx: RequestContext, pass_id: ID, days: number): void {
  const p = scoped(ctx, ctx.db.passes).find((x) => x.id === pass_id);
  if (!p) throw new Error('수강권 없음');
  const before = { ...p };
  p.pass_status = 'paused';
  p.paused_at = isoKST(ctx.now);
  p.paused_days_used += days;
  p.expire_date = addDays(p.expire_date, days);
  touch(ctx, p);
  audit(ctx, { entity_type: 'passes', entity_id: p.id, action: 'update', before, after: p });
}

export function resumePass(ctx: RequestContext, pass_id: ID): void {
  const p = scoped(ctx, ctx.db.passes).find((x) => x.id === pass_id);
  if (!p) throw new Error('수강권 없음');
  p.pass_status = 'active';
  p.paused_at = null;
  touch(ctx, p);
  audit(ctx, { entity_type: 'passes', entity_id: p.id, action: 'update', after: p });
}

/** 환불: 환불 계산 + refunds 기록 + 결제 상태/수강권 환불 + 결제기준 음수 매출. */
export function refundPass(ctx: RequestContext, pass_id: ID, reason?: string): import('../domain/index.js').Refund {
  assertCan(ctx.role, 'payments', 'update');
  const p = scoped(ctx, ctx.db.passes).find((x) => x.id === pass_id);
  if (!p) throw new Error('수강권 없음');
  if (p.pass_status === 'refunded') throw new Error('이미 환불된 수강권입니다'); // 멱등
  const purchase = scoped(ctx, ctx.db.purchases).find((x) => x.id === p.purchase_id);
  const payment = scoped(ctx, ctx.db.payments).find((x) => x.purchase_id === p.purchase_id);
  if (!purchase || !payment) throw new Error('구매/결제 없음');

  const calc = computeRefund({
    list_amount: purchase.list_amount,
    final_amount: purchase.final_amount,
    total_count: p.total_count,
    remaining_count: p.remaining_count,
    policy: currentStudio(ctx).policy_json.finance,
  });
  // 환불액은 실수령액을 넘을 수 없다(미수분은 환불 대상 아님 — 받지 않은 돈은 돌려줄 수 없음).
  const refund_amount = Math.min(calc.refund_amount, payment.paid_amount);
  const at = isoKST(ctx.now);

  const refund: import('../domain/index.js').Refund = {
    id: nextId(ctx.db.refunds, 'ref'),
    ...baseFields(ctx),
    payment_id: payment.id,
    purchase_id: purchase.id,
    member_id: p.member_id,
    refund_amount,
    refund_reason: reason,
    refunded_at: at,
    restored_count: calc.restored_count,
    status: 'completed',
    refund_method: payment.payment_method,
    staff_id: ctx.user_id,
  };
  ctx.db.refunds.push(refund);

  // 잔여 회수는 append-only 원장에 기록(횟수권만). 기간권(total_count=null)은 remaining 유지.
  const beforePass = { ...p };
  if (p.total_count !== null && p.remaining_count !== null && p.remaining_count > 0) {
    applyPassTxn(ctx, p, 'manual_deduct', -p.remaining_count, { memo: '환불 회수' });
  }
  p.pass_status = 'refunded';
  touch(ctx, p);
  payment.payment_status = 'refunded';
  payment.receivable_amount = 0; // 환불 시 미수 정리
  touch(ctx, payment);

  // 결제기준 음수 매출(실제 환불분만, 인식 초과 방지)
  if (refund_amount > 0) {
    writeRevenue(
      ctx,
      recognizeRefund({
        member_id: p.member_id,
        payment_id: payment.id,
        product_id: p.product_id,
        refund_amount,
        recognized_at: at,
      }),
    );
  }

  audit(ctx, { entity_type: 'refunds', entity_id: refund.id, action: 'refund', before: beforePass, after: refund });
  return refund;
}
