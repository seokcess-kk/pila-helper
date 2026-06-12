/** v2 서비스 배럴 — 컨텍스트·도메인·규칙·서비스 일괄 export. */
export * from '../domain/index.js';
export * from '../lib/util.js';
export * from './context.js';
export * from './audit.js';
export * from './authz.js';
export { writeRevenue } from './revenueService.js';
export * from './passService.js';
export * from './reservationService.js';
export * from './memberService.js';
export * from './leadService.js';
export * from './classService.js';
export * from './expenseService.js';
export * from './matchingService.js';
export * from './dashboardService.js';
export * from './notificationService.js';
export * from './settingsService.js';
// 규칙(필요 시 직접 사용)
export { checkEligibility, type EligibilityReason, type PassCandidate } from '../rules/booking.js';
export { computeDeduction } from '../rules/deduction.js';
export { computeRefund } from '../rules/refund.js';
export { computeUnitPrice } from '../rules/revenue.js';
