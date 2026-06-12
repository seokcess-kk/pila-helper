/** 비용 서비스 — 카테고리·비용 입력·집계. canon §2(F) / docs/spec 18. */
import type { CostType, ExpenseCategory, ExpenseRecord, ID, ISODate } from '../domain/index.js';
import { EXPENSE_CATEGORY_DEFAULT_COST, EXPENSE_CATEGORY_LABEL } from '../domain/index.js';
import { isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, scoped, type RequestContext } from './context.js';

/** 17종 기본 카테고리 시드(스튜디오 생성 시 1회) */
export function seedExpenseCategories(ctx: RequestContext): void {
  let order = 0;
  for (const code of Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]) {
    ctx.db.expense_categories.push({
      id: nextId(ctx.db.expense_categories, 'ecat'),
      ...baseFields(ctx),
      code,
      name_ko: EXPENSE_CATEGORY_LABEL[code],
      default_cost_type: EXPENSE_CATEGORY_DEFAULT_COST[code],
      is_active: true,
      sort_order: order++,
    });
  }
}

export interface AddExpenseInput {
  expense_category: ExpenseCategory;
  amount: number;
  expense_date: ISODate;
  vendor_name?: string;
  cost_type?: CostType;
  source?: ExpenseRecord['source'];
  is_recurring?: boolean;
  staff_id?: ID | null;
  bank_transaction_id?: ID | null;
  card_expense_id?: ID | null;
  doc_memo?: string;
  memo?: string;
}

export function addExpense(ctx: RequestContext, input: AddExpenseInput): ExpenseRecord {
  // 성격 미지정 시 기본값 = 카테고리 테이블의 (편집 반영) default_cost_type 단일 출처.
  // 폼 입력·통장/카드 매칭 분류가 동일한 기준을 쓰도록 보장(enum 상수는 최종 폴백).
  const defaultCost =
    scoped(ctx, ctx.db.expense_categories).find((c) => c.code === input.expense_category)?.default_cost_type ??
    EXPENSE_CATEGORY_DEFAULT_COST[input.expense_category] ??
    'variable';
  const row: ExpenseRecord = {
    id: nextId(ctx.db.expense_records, 'exp'),
    ...baseFields(ctx),
    expense_category: input.expense_category,
    cost_type: input.cost_type ?? defaultCost,
    amount: input.amount,
    vendor_name: input.vendor_name,
    expense_date: input.expense_date,
    source: input.source ?? 'manual',
    bank_transaction_id: input.bank_transaction_id ?? null,
    card_expense_id: input.card_expense_id ?? null,
    is_recurring: input.is_recurring ?? false,
    doc_memo: input.doc_memo,
    staff_id: input.staff_id ?? null,
    memo: input.memo,
  };
  ctx.db.expense_records.push(row);
  audit(ctx, { entity_type: 'expense_records', entity_id: row.id, action: 'create', after: row });
  return row;
}

/** 비용 삭제(소프트) — 오입력 정정용. 통장/카드 매칭으로 생성된 건도 제거 가능. */
export function deleteExpense(ctx: RequestContext, id: ID): void {
  assertCan(ctx.role, 'expenses', 'delete');
  const e = scoped(ctx, ctx.db.expense_records).find((x) => x.id === id);
  if (!e) return;
  const before = { ...e };
  e.deleted_at = isoKST(ctx.now);
  audit(ctx, { entity_type: 'expense_records', entity_id: id, action: 'delete', before });
}

export function listExpenses(ctx: RequestContext, range?: { start: ISODate; end: ISODate }): ExpenseRecord[] {
  return scoped(ctx, ctx.db.expense_records)
    .filter((e) => !range || (e.expense_date >= range.start && e.expense_date <= range.end))
    .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
}
