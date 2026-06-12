/**
 * 엔티티 사전 — canon §2 의 42개 테이블을 TypeScript 인터페이스로 1:1 정의.
 * 필드명은 canon/ERD 와 동일한 snake_case(코드=스펙 추적성 우선).
 * 공통 컬럼(canon §1.2)은 BaseRow/TenantScoped 로 합성.
 */
import type {
  AttendanceStatus,
  BankDirection,
  ClassType,
  CostType,
  ExpenseCategory,
  Gender,
  LeadStatus,
  MarketingSource,
  MatchTarget,
  MemberStatus,
  MemberTag,
  NotificationType,
  PassKind,
  PassStatus,
  PassTxnReason,
  PaymentMethod,
  PaymentStatus,
  ReconciliationStage,
  ReservationStatus,
  RevenueBasis,
  RevenueSourceType,
  Role,
  SessionStatus,
} from './enums.js';
import type { StudioPolicy } from './policy.js';

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // ISO-8601
export type ID = string;

export interface BaseRow {
  id: ID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime | null;
  created_by?: ID | null;
}

/** 테넌트/스튜디오 격리 공통 컬럼 (canon §1.2) */
export interface TenantScoped extends BaseRow {
  tenant_id: ID;
  studio_id: ID;
}

// ── A. 테넌시 · 조직 ──────────────────────────────────────────
export interface Tenant extends BaseRow {
  name: string;
  business_no?: string;
  owner_user_id?: ID;
  status: 'active' | 'suspended' | 'closed';
}

export interface Studio extends BaseRow {
  tenant_id: ID;
  name: string;
  timezone: string; // 기본 'Asia/Seoul'
  address?: string;
  phone?: string;
  status: 'active' | 'inactive';
  policy_json: StudioPolicy;
}

export interface User extends BaseRow {
  tenant_id: ID | null; // saas_admin 은 null
  email: string;
  phone?: string;
  password_hash?: string;
  role: Role;
  member_id?: ID | null;
  staff_id?: ID | null;
  status: 'active' | 'invited' | 'suspended';
}

export interface RoleRow extends BaseRow {
  code: Role;
  name_ko: string;
  description?: string;
}

export interface Permission extends BaseRow {
  role_code: Role;
  resource: string;
  action: 'read' | 'create' | 'update' | 'delete' | 'export';
  scope: 'all' | 'assigned' | 'own';
}

// ── B. 사람 · CRM ─────────────────────────────────────────────
export interface Member extends TenantScoped {
  name: string;
  phone: string;
  gender?: Gender;
  birth_date?: ISODate;
  member_status: MemberStatus;
  marketing_source?: MarketingSource;
  goal?: string; // 운동 목적
  medical_note?: string; // 통증/주의
  memo?: string;
  assigned_staff_id?: ID | null;
  tags?: MemberTag[];
}

export interface Lead extends TenantScoped {
  member_id?: ID | null;
  name: string;
  phone: string;
  lead_status: LeadStatus;
  marketing_source?: MarketingSource;
  inquiry_date: ISODate;
  trial_booked_date?: ISODate;
  trial_done_date?: ISODate;
  enrolled_date?: ISODate;
  lost_reason?: string;
  assigned_staff_id?: ID | null;
}

export interface Staff extends TenantScoped {
  user_id?: ID | null;
  name: string;
  phone?: string;
  role: Exclude<Role, 'saas_admin' | 'member'>;
  employment_type: 'fulltime' | 'parttime' | 'freelance';
  status: 'active' | 'inactive';
  available_hours_json?: unknown;
  settlement_method?: string;
}

export interface CounselingLog extends TenantScoped {
  lead_id?: ID | null;
  member_id?: ID | null;
  staff_id?: ID | null;
  channel: 'call' | 'visit' | 'message' | 'etc';
  content: string;
  consulted_at: ISODateTime;
  next_action_at?: ISODateTime | null;
}

export interface MarketingSourceRow extends TenantScoped {
  code: MarketingSource;
  name_ko: string;
  is_paid: boolean;
  is_active: boolean;
}

// ── C. 수업 · 공간 · 예약 · 출석 ──────────────────────────────
export interface Room extends TenantScoped {
  name: string;
  capacity: number;
  status: 'active' | 'inactive';
}

export interface ClassTemplate extends TenantScoped {
  class_type: ClassType;
  name: string;
  instructor_staff_id?: ID | null;
  room_id?: ID | null;
  capacity: number;
  duration_minutes: number;
  recurrence_rule?: string; // RRULE
  is_public: boolean;
}

export interface ClassSession extends TenantScoped {
  class_template_id?: ID | null;
  class_type: ClassType;
  name: string;
  instructor_staff_id?: ID | null;
  room_id?: ID | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  capacity: number;
  waitlist_capacity: number;
  session_status: SessionStatus;
  is_public: boolean;
  substitute_staff_id?: ID | null;
}

export interface Reservation extends TenantScoped {
  class_session_id: ID;
  member_id: ID;
  pass_id?: ID | null;
  reservation_status: ReservationStatus;
  booked_at: ISODateTime;
  canceled_at?: ISODateTime | null;
  cancel_reason?: string;
  is_self_booked: boolean;
  is_late_cancel?: boolean;
  pass_transaction_id?: ID | null;
}

export interface Waitlist extends TenantScoped {
  class_session_id: ID;
  member_id: ID;
  pass_id?: ID | null;
  position: number;
  status: 'waiting' | 'promoted' | 'canceled' | 'expired';
  requested_at: ISODateTime;
  promoted_at?: ISODateTime | null;
}

export interface Attendance extends TenantScoped {
  reservation_id: ID;
  class_session_id: ID;
  member_id: ID;
  attendance_status: AttendanceStatus;
  checked_at: ISODateTime;
  checked_by?: ID | null;
  deducted: boolean;
}

// ── D. 상품 · 수강권 · 차감 ───────────────────────────────────
export interface Product extends TenantScoped {
  name: string;
  pass_kind: PassKind;
  total_count: number | null;
  valid_days: number | null;
  price_amount: number;
  allowed_class_types: ClassType[];
  holdable: boolean;
  max_hold_days?: number | null;
  is_active: boolean;
}

export interface Pass extends TenantScoped {
  member_id: ID;
  product_id: ID;
  purchase_id?: ID | null;
  pass_kind: PassKind;
  total_count: number | null;
  remaining_count: number | null;
  start_date: ISODate;
  expire_date: ISODate;
  pass_status: PassStatus;
  paused_at?: ISODateTime | null;
  paused_days_used: number;
  /** 소진기준 단가 = round(final_amount / total_count) */
  unit_price_amount: number;
}

export interface PassTransaction extends TenantScoped {
  pass_id: ID;
  member_id: ID;
  reason: PassTxnReason;
  delta: number; // 음수=차감, 양수=복구
  balance_after: number | null;
  reservation_id?: ID | null;
  attendance_id?: ID | null;
  memo?: string;
}

// ── E. 결제 · 환불 · 매출 ─────────────────────────────────────
export interface Purchase extends TenantScoped {
  member_id: ID;
  product_id: ID;
  pass_id?: ID | null;
  list_amount: number;
  discount_amount: number;
  final_amount: number;
  purchased_at: ISODateTime;
  seller_staff_id?: ID | null;
}

export interface Payment extends TenantScoped {
  purchase_id: ID;
  member_id: ID;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  amount: number;
  paid_amount: number;
  paid_at?: ISODateTime | null;
  card_approval_no?: string;
  depositor_name?: string;
  payment_provider?: string | null;
  external_payment_id?: string | null;
  receivable_amount: number;
  staff_id?: ID | null;
  memo?: string;
  /** 매출 귀속 스냅샷(입금 지연 인식 시 원래 상태 보존) — 결제기준 매출의 신규/재등록 분류용 */
  is_new_member?: boolean;
  is_re_enroll?: boolean;
}

export interface Refund extends TenantScoped {
  payment_id: ID;
  purchase_id: ID;
  member_id: ID;
  refund_amount: number;
  refund_reason?: string;
  refunded_at: ISODateTime;
  restored_count: number;
  status: 'requested' | 'completed' | 'canceled';
  refund_method: PaymentMethod;
  staff_id?: ID | null;
}

export interface RevenueRecord extends TenantScoped {
  member_id: ID;
  revenue_basis: RevenueBasis;
  source_type: RevenueSourceType;
  payment_id?: ID | null;
  pass_transaction_id?: ID | null;
  product_id?: ID | null;
  class_type?: ClassType | null;
  instructor_staff_id?: ID | null;
  marketing_source?: MarketingSource;
  amount: number; // 환불·차감은 음수 가능
  recognized_at: ISODateTime;
  recognized_date: ISODate;
  is_new_member: boolean;
  is_re_enroll: boolean;
}

// ── F. 비용 · 정산 ────────────────────────────────────────────
export interface ExpenseRecord extends TenantScoped {
  expense_category: ExpenseCategory;
  cost_type: CostType;
  amount: number;
  vendor_name?: string;
  expense_date: ISODate;
  source: 'bank' | 'card' | 'manual';
  bank_transaction_id?: ID | null;
  card_expense_id?: ID | null;
  is_recurring: boolean;
  receipt_file_url?: string;
  doc_memo?: string;
  staff_id?: ID | null;
  memo?: string;
}

export interface ExpenseCategoryRow extends TenantScoped {
  code: ExpenseCategory;
  name_ko: string;
  default_cost_type: CostType;
  is_active: boolean;
  sort_order: number;
}

export interface Settlement extends TenantScoped {
  staff_id: ID;
  period_start_date: ISODate;
  period_end_date: ISODate;
  session_count: number;
  base_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  total_amount: number;
  status: 'draft' | 'confirmed' | 'paid';
  confirmed_at?: ISODateTime | null;
  paid_at?: ISODateTime | null;
}

// ── G. 금융 연동 · 거래 매칭 ──────────────────────────────────
export interface BankAccount extends TenantScoped {
  bank_code: string;
  account_no_masked: string;
  account_holder: string;
  balance_amount: number;
  last_synced_at?: ISODateTime | null;
  status: 'active' | 'inactive';
  is_open_banking_linked: boolean;
}

export interface BankTransaction extends TenantScoped {
  bank_account_id: ID;
  txn_date: ISODate;
  amount: number; // 입금+ / 출금-
  direction: BankDirection;
  counterparty_name?: string;
  balance_after_amount?: number | null;
  match_target?: MatchTarget | null;
  matched_ref_type?: 'payment' | 'expense' | 'transfer' | null;
  matched_ref_id?: ID | null;
  reconciliation_stage?: ReconciliationStage | null;
  is_matched: boolean;
  import_batch_id?: string;
}

export interface CardSale extends TenantScoped {
  payment_id?: ID | null;
  approval_no: string;
  amount: number;
  approved_at: ISODateTime;
  captured_at?: ISODateTime | null;
  deposited_at?: ISODateTime | null;
  reconciliation_stage: ReconciliationStage;
  fee_amount: number;
  net_deposit_amount: number;
  bank_transaction_id?: ID | null;
}

export interface CardExpense extends TenantScoped {
  card_no_masked: string;
  vendor_name: string;
  amount: number;
  used_at: ISODateTime;
  billed_at?: ISODate | null;
  match_target?: MatchTarget | null;
  expense_record_id?: ID | null;
  is_matched: boolean;
  import_batch_id?: string;
}

export interface TransactionMatchingRule extends TenantScoped {
  match_field: 'counterparty_name' | 'vendor_name';
  pattern: string;
  match_type: 'exact' | 'contains' | 'regex';
  target_match: MatchTarget;
  expense_category?: ExpenseCategory | null;
  cost_type?: CostType | null;
  priority: number;
  is_active: boolean;
}

export interface TransactionReconciliationLog extends TenantScoped {
  txn_type: 'bank' | 'card_sale' | 'card_expense';
  txn_id: ID;
  action: 'auto_matched' | 'manual_matched' | 'unmatched' | 'reclassified';
  before_json?: unknown;
  after_json?: unknown;
  rule_id?: ID | null;
  staff_id?: ID | null;
  processed_at: ISODateTime;
}

// ── H. 알림 · 운동기록 · 강사코멘트 ──────────────────────────
export interface NotificationTemplate extends TenantScoped {
  notification_type: NotificationType;
  channel: 'sms' | 'kakao' | 'push' | 'email';
  title: string;
  body_template: string;
  is_active: boolean;
}

export interface Notification extends TenantScoped {
  member_id?: ID | null;
  template_id?: ID | null;
  notification_type: NotificationType;
  channel: 'sms' | 'kakao' | 'push' | 'email';
  status: 'scheduled' | 'sent' | 'failed' | 'canceled';
  scheduled_at?: ISODateTime | null;
  sent_at?: ISODateTime | null;
  payload_json?: unknown;
  error_message?: string;
}

export interface InstructorComment extends TenantScoped {
  member_id: ID;
  staff_id: ID;
  class_session_id?: ID | null;
  content: string;
  commented_at: ISODateTime;
}

export interface ExerciseLog extends TenantScoped {
  member_id: ID;
  class_session_id: ID;
  staff_id?: ID | null;
  content: string;
  metrics_json?: unknown;
  logged_at: ISODateTime;
}

// ── I. 리포트 · 감사 · 외부연동 ──────────────────────────────
export interface FinancialReport extends TenantScoped {
  report_type: 'monthly_pl' | 'cashflow' | 'tax_export' | string;
  revenue_basis: RevenueBasis;
  period_start_date: ISODate;
  period_end_date: ISODate;
  data_json: unknown;
  generated_at: ISODateTime;
  generated_by?: ID | null;
  export_file_url?: string;
}

export interface AuditLog extends BaseRow {
  tenant_id: ID;
  studio_id: ID;
  actor_user_id?: ID | null;
  actor_role: Role;
  entity_type: string;
  entity_id: ID;
  action: 'create' | 'update' | 'delete' | 'refund' | 'pass_adjust' | 'match' | 'login' | 'export';
  before_json?: unknown;
  after_json?: unknown;
  ip_address?: string;
  occurred_at: ISODateTime;
}

export interface ExternalIntegration extends TenantScoped {
  provider: string;
  credential_ref?: string;
  status: 'connected' | 'disconnected' | 'error';
  connected_at?: ISODateTime | null;
  config_json?: unknown;
}

export interface SyncLog extends TenantScoped {
  external_integration_id: ID;
  sync_type: 'bank' | 'card_sale' | 'card_expense' | 'notification';
  status: 'success' | 'partial' | 'failed';
  started_at: ISODateTime;
  finished_at?: ISODateTime | null;
  record_count?: number;
  error_message?: string;
}

// ── J. SaaS 과금 ──────────────────────────────────────────────
export interface SubscriptionPlan extends BaseRow {
  code: string;
  name: string;
  price_amount: number;
  billing_cycle: 'monthly' | 'yearly';
  feature_limits_json: unknown;
  is_active: boolean;
}

export interface TenantSubscription extends BaseRow {
  tenant_id: ID;
  subscription_plan_id: ID;
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended';
  started_at: ISODateTime;
  current_period_end_at?: ISODateTime | null;
  amount: number;
  usage_json?: unknown;
  next_billing_at?: ISODateTime | null;
}
