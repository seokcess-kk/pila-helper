/**
 * 통장/카드 거래 매칭 — canon §2(G)·§3.19·§3.21 / docs/spec 17 (핵심 차별화).
 * CSV 인입 → 규칙 자동분류 → 입금 매칭(미수 확정·매출 인식) → 미매칭 큐 → 수동분류(규칙 학습).
 */
import type {
  BankTransaction,
  CardExpense,
  ExpenseCategory,
  ID,
  ISODate,
  MatchTarget,
  Payment,
  TransactionMatchingRule,
} from '../domain/index.js';
import { recognizePayment } from '../rules/revenue.js';
import { isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, scoped, scopedFind, touch, type RequestContext } from './context.js';
import { addExpense } from './expenseService.js';
import { writeRevenue } from './revenueService.js';

// ── CSV 인입 ──────────────────────────────────────────────────
export interface BankCsvRow {
  txn_date: ISODate;
  amount: number; // 입금+ / 출금-
  counterparty_name?: string;
  balance_after_amount?: number;
}

export function importBankTransactions(
  ctx: RequestContext,
  bank_account_id: ID,
  rows: BankCsvRow[],
): BankTransaction[] {
  assertCan(ctx.role, 'bank', 'update');
  const batch = nextId(ctx.db.bank_transactions, 'batch');
  const created = rows.map((r) => {
    const tx: BankTransaction = {
      id: nextId(ctx.db.bank_transactions, 'btx'),
      ...baseFields(ctx),
      bank_account_id,
      txn_date: r.txn_date,
      amount: r.amount,
      direction: r.amount >= 0 ? 'deposit' : 'withdraw',
      counterparty_name: r.counterparty_name,
      balance_after_amount: r.balance_after_amount ?? null,
      match_target: null,
      matched_ref_type: null,
      matched_ref_id: null,
      reconciliation_stage: null,
      is_matched: false,
      import_batch_id: batch,
    };
    ctx.db.bank_transactions.push(tx);
    return tx;
  });
  autoClassify(ctx);
  return created;
}

export interface CardCsvRow {
  card_no_masked: string;
  vendor_name: string;
  amount: number;
  used_at: string;
}

export function importCardExpenses(ctx: RequestContext, rows: CardCsvRow[]): CardExpense[] {
  assertCan(ctx.role, 'bank', 'update');
  const batch = nextId(ctx.db.card_expenses, 'batch');
  const created = rows.map((r) => {
    const ce: CardExpense = {
      id: nextId(ctx.db.card_expenses, 'ce'),
      ...baseFields(ctx),
      card_no_masked: r.card_no_masked,
      vendor_name: r.vendor_name,
      amount: r.amount,
      used_at: r.used_at,
      match_target: null,
      expense_record_id: null,
      is_matched: false,
      import_batch_id: batch,
    };
    ctx.db.card_expenses.push(ce);
    return ce;
  });
  autoClassify(ctx);
  return created;
}

// ── 분류 규칙 ─────────────────────────────────────────────────
/** 정규식 패턴 최대 길이(ReDoS 완화 — 복잡도 상한) */
const MAX_PATTERN_LEN = 100;
function matchesRule(rule: TransactionMatchingRule, value: string): boolean {
  if (rule.match_type === 'exact') return value === rule.pattern;
  if (rule.match_type === 'contains') return value.includes(rule.pattern);
  // regex: 사용자 입력 패턴 — 길이 제한으로 ReDoS 완화(프로덕션은 re2 등 안전엔진 권장)
  if (rule.pattern.length > MAX_PATTERN_LEN) return false;
  try {
    return new RegExp(rule.pattern).test(value);
  } catch {
    return false;
  }
}

/** 거래값에 적용되는 1순위 규칙 — 우선순위 asc(작을수록 우선), 동점 시 구체성(exact>contains>regex)·패턴길이 (spec 17 §6.3) */
const MATCH_TYPE_RANK: Record<TransactionMatchingRule['match_type'], number> = { exact: 0, contains: 1, regex: 2 };
export function findRule(
  ctx: RequestContext,
  field: TransactionMatchingRule['match_field'],
  value: string,
): TransactionMatchingRule | null {
  return (
    scoped(ctx, ctx.db.transaction_matching_rules)
      .filter((r) => r.is_active && r.match_field === field && matchesRule(r, value))
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          MATCH_TYPE_RANK[a.match_type] - MATCH_TYPE_RANK[b.match_type] ||
          b.pattern.length - a.pattern.length,
      )[0] ?? null
  );
}

export function addMatchingRule(
  ctx: RequestContext,
  input: {
    match_field: TransactionMatchingRule['match_field'];
    pattern: string;
    match_type?: TransactionMatchingRule['match_type'];
    target_match: MatchTarget;
    expense_category?: ExpenseCategory | null;
    cost_type?: TransactionMatchingRule['cost_type'];
    priority?: number;
  },
): TransactionMatchingRule {
  const match_type = input.match_type ?? 'contains';
  if (!input.pattern || input.pattern.length > MAX_PATTERN_LEN) throw new Error('매칭 패턴이 유효하지 않습니다');
  // 업서트: 같은 (field, pattern, match_type) 규칙이 있으면 갱신(중복 학습 방지). spec 17 §6.2
  const existing = scoped(ctx, ctx.db.transaction_matching_rules).find(
    (r) => r.match_field === input.match_field && r.pattern === input.pattern && r.match_type === match_type,
  );
  if (existing) {
    existing.target_match = input.target_match;
    existing.expense_category = input.expense_category ?? null;
    existing.cost_type = input.cost_type ?? null;
    existing.is_active = true;
    touch(ctx, existing);
    return existing;
  }
  const rule: TransactionMatchingRule = {
    id: nextId(ctx.db.transaction_matching_rules, 'rule'),
    ...baseFields(ctx),
    match_field: input.match_field,
    pattern: input.pattern,
    match_type,
    target_match: input.target_match,
    expense_category: input.expense_category ?? null,
    cost_type: input.cost_type ?? null,
    priority: input.priority ?? 10,
    is_active: true,
  };
  ctx.db.transaction_matching_rules.push(rule);
  return rule;
}

/** 미매칭 거래에 규칙 자동 적용(분류만; 회계 반영은 확정 단계에서) */
export function autoClassify(ctx: RequestContext): void {
  for (const tx of scoped(ctx, ctx.db.bank_transactions).filter((t) => !t.is_matched && !t.match_target)) {
    const rule = tx.counterparty_name ? findRule(ctx, 'counterparty_name', tx.counterparty_name) : null;
    if (rule) {
      tx.match_target = rule.target_match;
      touch(ctx, tx);
      if (rule.target_match === 'expense' && tx.direction === 'withdraw' && rule.expense_category) {
        classifyBankAsExpense(ctx, tx.id, rule.expense_category, rule.id);
      }
    }
  }
  for (const ce of scoped(ctx, ctx.db.card_expenses).filter((c) => !c.is_matched && !c.match_target)) {
    const rule = findRule(ctx, 'vendor_name', ce.vendor_name);
    if (rule && rule.expense_category) {
      classifyCardAsExpense(ctx, ce.id, rule.expense_category, rule.id);
    }
  }
}

// ── 입금 매칭(미수 확정 → 결제기준 매출 인식) ────────────────
export interface MatchSuggestion {
  payment: Payment;
  member_name: string;
  score: number;
  reasons: string[];
}

/** 입금 통장거래에 대한 결제 후보 추천(이름·금액·날짜 스코어링) */
export function suggestPaymentMatches(ctx: RequestContext, bank_txn_id: ID): MatchSuggestion[] {
  const tx = scoped(ctx, ctx.db.bank_transactions).find((t) => t.id === bank_txn_id);
  if (!tx || tx.direction !== 'deposit') return [];
  const pending = scoped(ctx, ctx.db.payments).filter(
    (p) => p.payment_status === 'awaiting_deposit' || p.payment_status === 'receivable' || p.payment_status === 'partial',
  );
  const name = (tx.counterparty_name ?? '').trim();
  return pending
    .map((p) => {
      const member = scopedFind(ctx, ctx.db.members, (m) => m.id === p.member_id);
      const reasons: string[] = [];
      let score = 0;
      const depositor = (p.depositor_name ?? '').trim();
      const nameHit =
        !!member && !!name &&
        (name.includes(member.name) || member.name.includes(name) ||
          (!!depositor && (name.includes(depositor) || depositor.includes(name))));
      if (nameHit) {
        score += 0.5; // 이름 (spec 17 §5.2~5.3, depositor_name 양방향 포함)
        reasons.push('입금자명 일치');
      }
      // 금액: 정확 일치 0.4, 근접(5% 이내) 0.2 (graduated, spec 17 §5.3)
      const tgt = p.receivable_amount > 0 ? p.receivable_amount : p.amount;
      const diff = Math.abs(tx.amount - tgt);
      if (diff === 0) {
        score += 0.4;
        reasons.push('금액 일치');
      } else if (tgt > 0 && diff <= tgt * 0.05) {
        score += 0.2;
        reasons.push('금액 근접');
      }
      const days = Math.abs((new Date(tx.txn_date).getTime() - new Date(p.created_at).getTime()) / 86400000);
      if (days <= 3) {
        score += 0.1;
        reasons.push('날짜 근접');
      }
      return { payment: p, member_name: member?.name ?? '?', score: Math.round(score * 100) / 100, reasons };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** 입금 통장거래 ↔ 결제 매칭: 미수 확정 + (미인식분) 결제기준 매출 인식 */
export function matchBankToPayment(ctx: RequestContext, bank_txn_id: ID, payment_id: ID): void {
  assertCan(ctx.role, 'bank', 'update');
  const tx = scoped(ctx, ctx.db.bank_transactions).find((t) => t.id === bank_txn_id);
  const payment = scoped(ctx, ctx.db.payments).find((p) => p.id === payment_id);
  if (!tx || !payment) throw new Error('거래/결제 없음');
  // 멱등성: 이미 매칭된 거래 재적용 차단(매출 이중 인식 방지). 입금 거래만 허용.
  if (tx.is_matched) throw new Error('이미 매칭된 거래입니다');
  if (tx.direction !== 'deposit') throw new Error('입금 거래만 결제에 매칭할 수 있습니다');
  if (payment.payment_status === 'refunded') throw new Error('환불된 결제에는 매칭할 수 없습니다');
  const before = { ...payment };

  // 이미 인식된 결제기준 매출(분할 입금 정확히 1회 인식 보장)
  const alreadyRecognized = scoped(ctx, ctx.db.revenue_records)
    .filter((r) => r.payment_id === payment.id && r.revenue_basis === 'payment' && r.source_type === 'payment')
    .reduce((s, r) => s + r.amount, 0);

  payment.paid_amount = Math.min(payment.amount, payment.paid_amount + tx.amount);
  payment.receivable_amount = Math.max(0, payment.amount - payment.paid_amount);
  payment.payment_status = payment.receivable_amount === 0 ? 'paid' : 'partial';
  if (!payment.paid_at) payment.paid_at = isoKST(ctx.now);
  touch(ctx, payment);

  tx.match_target = 'revenue';
  tx.matched_ref_type = 'payment';
  tx.matched_ref_id = payment.id;
  tx.is_matched = true;
  tx.reconciliation_stage = 'deposited';
  touch(ctx, tx);

  // 입금 누적분 중 아직 미인식된 만큼만 결제기준 매출 인식(정확히 1회·합계=paid_amount)
  const recognizeNow = Math.max(0, payment.paid_amount - alreadyRecognized);
  if (recognizeNow > 0) {
    const purchase = scopedFind(ctx, ctx.db.purchases, (p) => p.id === payment.purchase_id);
    const member = scopedFind(ctx, ctx.db.members, (m) => m.id === payment.member_id);
    writeRevenue(
      ctx,
      recognizePayment({
        member_id: payment.member_id,
        payment_id: payment.id,
        product_id: purchase?.product_id ?? null,
        paid_amount: recognizeNow,
        recognized_at: isoKST(ctx.now),
        marketing_source: member?.marketing_source,
        is_new_member: payment.is_new_member ?? false, // 발급 시 스냅샷 재사용
        is_re_enroll: payment.is_re_enroll ?? false,
      }),
    );
  }

  logReconciliation(ctx, 'bank', tx.id, 'manual_matched', before, payment, null);
  audit(ctx, { entity_type: 'payments', entity_id: payment.id, action: 'match', before, after: payment });
}

// ── 비용 분류(통장 출금 / 카드 사용) ──────────────────────────
export function classifyBankAsExpense(
  ctx: RequestContext,
  bank_txn_id: ID,
  category: ExpenseCategory,
  rule_id: ID | null = null,
  learn = false,
): void {
  assertCan(ctx.role, 'bank', 'update');
  const tx = scoped(ctx, ctx.db.bank_transactions).find((t) => t.id === bank_txn_id);
  if (!tx) throw new Error('거래 없음');
  const before = { ...tx };
  const exp = addExpense(ctx, {
    expense_category: category,
    amount: Math.abs(tx.amount),
    expense_date: tx.txn_date,
    vendor_name: tx.counterparty_name,
    source: 'bank',
    bank_transaction_id: tx.id,
  });
  tx.match_target = 'expense';
  tx.matched_ref_type = 'expense';
  tx.matched_ref_id = exp.id;
  tx.is_matched = true;
  touch(ctx, tx);
  if (learn && tx.counterparty_name) {
    addMatchingRule(ctx, { match_field: 'counterparty_name', pattern: tx.counterparty_name, target_match: 'expense', expense_category: category });
  }
  logReconciliation(ctx, 'bank', tx.id, rule_id ? 'auto_matched' : 'manual_matched', before, tx, rule_id);
  audit(ctx, { entity_type: 'bank_transactions', entity_id: tx.id, action: 'match', before, after: tx });
}

export function classifyCardAsExpense(
  ctx: RequestContext,
  card_expense_id: ID,
  category: ExpenseCategory,
  rule_id: ID | null = null,
  learn = false,
): void {
  assertCan(ctx.role, 'bank', 'update');
  const ce = scoped(ctx, ctx.db.card_expenses).find((c) => c.id === card_expense_id);
  if (!ce) throw new Error('카드내역 없음');
  const before = { ...ce };
  const exp = addExpense(ctx, {
    expense_category: category,
    amount: ce.amount,
    expense_date: ce.used_at.slice(0, 10),
    vendor_name: ce.vendor_name,
    source: 'card',
    card_expense_id: ce.id,
  });
  ce.match_target = 'expense';
  ce.expense_record_id = exp.id;
  ce.is_matched = true;
  touch(ctx, ce);
  if (learn) {
    addMatchingRule(ctx, { match_field: 'vendor_name', pattern: ce.vendor_name, target_match: 'expense', expense_category: category });
  }
  logReconciliation(ctx, 'card_expense', ce.id, rule_id ? 'auto_matched' : 'manual_matched', before, ce, rule_id);
  audit(ctx, { entity_type: 'card_expenses', entity_id: ce.id, action: 'match', before, after: ce });
}

export function excludeBankTxn(ctx: RequestContext, bank_txn_id: ID, target: 'transfer' | 'etc'): void {
  assertCan(ctx.role, 'bank', 'update');
  const tx = scoped(ctx, ctx.db.bank_transactions).find((t) => t.id === bank_txn_id);
  if (!tx) throw new Error('거래 없음');
  const before = { ...tx };
  tx.match_target = target;
  tx.is_matched = true;
  touch(ctx, tx);
  logReconciliation(ctx, 'bank', tx.id, 'manual_matched', before, tx, null);
  audit(ctx, { entity_type: 'bank_transactions', entity_id: tx.id, action: 'match', before, after: tx });
}

function logReconciliation(
  ctx: RequestContext,
  txn_type: 'bank' | 'card_sale' | 'card_expense',
  txn_id: ID,
  action: 'auto_matched' | 'manual_matched' | 'unmatched' | 'reclassified',
  before: unknown,
  after: unknown,
  rule_id: ID | null,
): void {
  ctx.db.transaction_reconciliation_logs.push({
    id: nextId(ctx.db.transaction_reconciliation_logs, 'rlog'),
    ...baseFields(ctx),
    txn_type,
    txn_id,
    action,
    before_json: before,
    after_json: after,
    rule_id,
    // user_id → staff_id 해석(로그 필드는 staff 참조). 매칭되는 staff 없으면 null.
    staff_id: ctx.db.users.find((u) => u.id === ctx.user_id)?.staff_id ?? null,
    processed_at: isoKST(ctx.now),
  });
}

// ── 미매칭 큐 ─────────────────────────────────────────────────
export function unmatchedBank(ctx: RequestContext): BankTransaction[] {
  return scoped(ctx, ctx.db.bank_transactions).filter((t) => !t.is_matched).sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1));
}
export function unmatchedCard(ctx: RequestContext): CardExpense[] {
  return scoped(ctx, ctx.db.card_expenses).filter((c) => !c.is_matched).sort((a, b) => (a.used_at < b.used_at ? 1 : -1));
}
