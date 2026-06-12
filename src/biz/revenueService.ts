/** 매출 인식 원장 기록 — rules/revenue.ts 의 draft 를 revenue_records 에 적재. canon §4 */
import type { RevenueRecord } from '../domain/index.js';
import type { RevenueDraft } from '../rules/revenue.js';
import { nextId } from '../lib/util.js';
import { baseFields, type RequestContext } from './context.js';

export function writeRevenue(ctx: RequestContext, draft: RevenueDraft): RevenueRecord {
  const row: RevenueRecord = {
    id: nextId(ctx.db.revenue_records, 'rev'),
    ...baseFields(ctx),
    ...draft,
  };
  ctx.db.revenue_records.push(row);
  return row;
}
