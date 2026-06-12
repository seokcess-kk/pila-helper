/**
 * v2 인메모리 데이터베이스 — canon 42 테이블을 배열 컬렉션으로.
 * 프로덕션은 동일 형태를 Prisma/Postgres 구현으로 교체(서비스 인터페이스 유지).
 * 모든 테넌트 데이터 접근은 서비스 레이어의 RequestContext(tenant_id/studio_id)로 격리한다.
 */
import type {
  Attendance,
  AuditLog,
  BankAccount,
  BankTransaction,
  CardExpense,
  CardSale,
  ClassSession,
  ClassTemplate,
  CounselingLog,
  ExerciseLog,
  ExpenseCategoryRow,
  ExpenseRecord,
  ExternalIntegration,
  FinancialReport,
  InstructorComment,
  Lead,
  MarketingSourceRow,
  Member,
  Notification,
  NotificationTemplate,
  Pass,
  PassTransaction,
  Payment,
  Permission,
  Product,
  Purchase,
  Reservation,
  RevenueRecord,
  Refund,
  Room,
  RoleRow,
  Settlement,
  Staff,
  Studio,
  SubscriptionPlan,
  SyncLog,
  Tenant,
  TenantSubscription,
  TransactionMatchingRule,
  TransactionReconciliationLog,
  User,
  Waitlist,
} from '../domain/index.js';

export interface DB {
  // A. 테넌시·조직
  tenants: Tenant[];
  studios: Studio[];
  users: User[];
  roles: RoleRow[];
  permissions: Permission[];
  // B. 사람·CRM
  members: Member[];
  leads: Lead[];
  staff: Staff[];
  counseling_logs: CounselingLog[];
  marketing_sources: MarketingSourceRow[];
  // C. 수업·예약·출석
  rooms: Room[];
  class_templates: ClassTemplate[];
  class_sessions: ClassSession[];
  reservations: Reservation[];
  waitlists: Waitlist[];
  attendance: Attendance[];
  // D. 상품·수강권
  products: Product[];
  passes: Pass[];
  pass_transactions: PassTransaction[];
  // E. 결제·환불·매출
  purchases: Purchase[];
  payments: Payment[];
  refunds: Refund[];
  revenue_records: RevenueRecord[];
  // F. 비용·정산
  expense_records: ExpenseRecord[];
  expense_categories: ExpenseCategoryRow[];
  settlements: Settlement[];
  // G. 금융연동·매칭
  bank_accounts: BankAccount[];
  bank_transactions: BankTransaction[];
  card_sales: CardSale[];
  card_expenses: CardExpense[];
  transaction_matching_rules: TransactionMatchingRule[];
  transaction_reconciliation_logs: TransactionReconciliationLog[];
  // H. 알림·운동기록·코멘트
  notification_templates: NotificationTemplate[];
  notifications: Notification[];
  instructor_comments: InstructorComment[];
  exercise_logs: ExerciseLog[];
  // I. 리포트·감사·외부연동
  financial_reports: FinancialReport[];
  audit_logs: AuditLog[];
  external_integrations: ExternalIntegration[];
  sync_logs: SyncLog[];
  // J. SaaS 과금
  subscription_plans: SubscriptionPlan[];
  tenant_subscriptions: TenantSubscription[];
}

export function emptyDb(): DB {
  return {
    tenants: [],
    studios: [],
    users: [],
    roles: [],
    permissions: [],
    members: [],
    leads: [],
    staff: [],
    counseling_logs: [],
    marketing_sources: [],
    rooms: [],
    class_templates: [],
    class_sessions: [],
    reservations: [],
    waitlists: [],
    attendance: [],
    products: [],
    passes: [],
    pass_transactions: [],
    purchases: [],
    payments: [],
    refunds: [],
    revenue_records: [],
    expense_records: [],
    expense_categories: [],
    settlements: [],
    bank_accounts: [],
    bank_transactions: [],
    card_sales: [],
    card_expenses: [],
    transaction_matching_rules: [],
    transaction_reconciliation_logs: [],
    notification_templates: [],
    notifications: [],
    instructor_comments: [],
    exercise_logs: [],
    financial_reports: [],
    audit_logs: [],
    external_integrations: [],
    sync_logs: [],
    subscription_plans: [],
    tenant_subscriptions: [],
  };
}

/** 접두사_N 단조 증가 ID 생성기 */
export function makeIdGen() {
  const counters = new Map<string, number>();
  return (prefix: string): string => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${n}`;
  };
}

/** 데모 고정 기준시각 — 시드 데이터가 날짜와 무관하게 일관되게 보이도록 */
export const DEMO_NOW = new Date('2026-06-12T09:00:00+09:00');
