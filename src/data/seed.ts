/**
 * v2 시드 — 단일 테넌트/스튜디오를 서비스로 구성(거래 데이터는 비즈 로직으로 생성해 정합 보장).
 * 데모 기준시각 DEMO_NOW(2026-06-12) 기준 이번 주 운영/이번 달 손익이 일관되게 보이도록.
 */
import type { ISODateTime, Member, Product, Room, Staff, Studio, Tenant, User } from '../domain/index.js';
import { DEFAULT_POLICY } from '../domain/index.js';
import { isoKST } from '../lib/util.js';
import type { RequestContext } from '../biz/context.js';
import { createMember } from '../biz/memberService.js';
import { advanceLead, addCounselingLog, createLead } from '../biz/leadService.js';
import { createSession } from '../biz/classService.js';
import { issuePass } from '../biz/passService.js';
import { addExpense, seedExpenseCategories } from '../biz/expenseService.js';
import { importBankTransactions, importCardExpenses } from '../biz/matchingService.js';
import { attend, book } from '../biz/reservationService.js';
import { DEMO_NOW, emptyDb, type DB } from './db.js';

const TENANT = 'tenant_1';
const STUDIO = 'studio_1';

function baseAt(at: ISODateTime) {
  return { tenant_id: TENANT, studio_id: STUDIO, created_at: at, updated_at: at, deleted_at: null, created_by: 'user_owner' };
}

function withNow(ctx: RequestContext, iso: string): RequestContext {
  return { ...ctx, now: new Date(iso) };
}

export function seedDb(): DB {
  const db = emptyDb();
  const at = isoKST(DEMO_NOW);

  // ── 테넌시/조직 (master 직접 생성) ──
  const tenant: Tenant = { id: TENANT, created_at: at, updated_at: at, deleted_at: null, name: '모던필라테스(본점)', business_no: '123-45-67890', owner_user_id: 'user_owner', status: 'active' };
  const studio: Studio = { id: STUDIO, created_at: at, updated_at: at, deleted_at: null, tenant_id: TENANT, name: '모던필라테스', timezone: 'Asia/Seoul', address: '서울 강남구', phone: '02-123-4567', status: 'active', policy_json: structuredClone(DEFAULT_POLICY) };
  // 데모: 같은 날 복수 예약 시연을 위해 1일 한도 상향(기본 1 → 3)
  studio.policy_json.booking.daily_booking_limit = 3;
  db.tenants.push(tenant);
  db.studios.push(studio);

  const staff: Staff[] = [
    { id: 'staff_owner', ...baseAt(at), name: '박원장', role: 'owner', employment_type: 'fulltime', status: 'active' },
    { id: 'staff_kim', ...baseAt(at), name: '김강사', role: 'instructor', employment_type: 'parttime', status: 'active' },
    { id: 'staff_lee', ...baseAt(at), name: '이매니저', role: 'manager', employment_type: 'fulltime', status: 'active' },
  ];
  db.staff.push(...staff);

  const users: User[] = [
    { id: 'user_owner', created_at: at, updated_at: at, deleted_at: null, tenant_id: TENANT, email: 'owner@modern.kr', role: 'owner', staff_id: 'staff_owner', status: 'active' },
    { id: 'user_kim', created_at: at, updated_at: at, deleted_at: null, tenant_id: TENANT, email: 'kim@modern.kr', role: 'instructor', staff_id: 'staff_kim', status: 'active' },
    { id: 'user_lee', created_at: at, updated_at: at, deleted_at: null, tenant_id: TENANT, email: 'lee@modern.kr', role: 'manager', staff_id: 'staff_lee', status: 'active' },
    { id: 'user_acc', created_at: at, updated_at: at, deleted_at: null, tenant_id: TENANT, email: 'acc@modern.kr', role: 'accountant', status: 'active' },
  ];
  db.users.push(...users);

  const rooms: Room[] = [
    { id: 'room_a', ...baseAt(at), name: 'A룸(그룹)', capacity: 6, status: 'active' },
    { id: 'room_b', ...baseAt(at), name: 'B룸(기구)', capacity: 2, status: 'active' },
  ];
  db.rooms.push(...rooms);

  const products: Product[] = [
    { id: 'prod_p10', ...baseAt(at), name: '개인 10회권', pass_kind: 'personal', total_count: 10, valid_days: 90, price_amount: 800000, allowed_class_types: ['personal'], holdable: true, max_hold_days: 30, is_active: true },
    { id: 'prod_g10', ...baseAt(at), name: '그룹 10회권', pass_kind: 'group', total_count: 10, valid_days: 60, price_amount: 300000, allowed_class_types: ['group'], holdable: true, max_hold_days: 30, is_active: true },
    { id: 'prod_gunlim', ...baseAt(at), name: '그룹 무제한(1개월)', pass_kind: 'group', total_count: null, valid_days: 30, price_amount: 350000, allowed_class_types: ['group'], holdable: false, max_hold_days: 0, is_active: true },
    { id: 'prod_trial', ...baseAt(at), name: '체험 1회', pass_kind: 'trial', total_count: 1, valid_days: 14, price_amount: 30000, allowed_class_types: ['trial', 'group'], holdable: false, max_hold_days: 0, is_active: true },
  ];
  db.products.push(...products);

  // owner 컨텍스트
  const ctx: RequestContext = { db, tenant_id: TENANT, studio_id: STUDIO, user_id: 'user_owner', role: 'owner', now: DEMO_NOW };
  seedExpenseCategories(ctx);

  // ── 회원 ──
  const mk = (over: Partial<Member> & { name: string; phone: string }): Member =>
    createMember(ctx, { name: over.name, phone: over.phone, gender: over.gender, marketing_source: over.marketing_source, member_status: over.member_status, memo: over.memo, medical_note: over.medical_note });
  // m1·m2 는 이번 달 신규 등록(발급 직전 trial_done → issuePass 가 is_new_member 로 인식)
  const m1 = mk({ name: '김지은', phone: '010-1234-5678', gender: 'female', marketing_source: 'naver_place', member_status: 'trial_done', medical_note: '오른쪽 어깨 통증 주의' });
  const m2 = mk({ name: '박서연', phone: '010-2345-6789', gender: 'female', marketing_source: 'instagram', member_status: 'trial_done' });
  const m3 = mk({ name: '이수민', phone: '010-3456-7890', gender: 'female', marketing_source: 'referral', member_status: 'enrolled' });
  const m4 = mk({ name: '정해나', phone: '010-4567-8901', gender: 'female', marketing_source: 'offline', member_status: 'dormant' });
  const m5 = mk({ name: '최민', phone: '010-5678-9012', gender: 'male', marketing_source: 'ad', member_status: 'enrolled' });

  // ── 상담 CRM 리드 파이프라인 ──
  const l1 = createLead(ctx, { name: '한지민', phone: '010-7001-0001', marketing_source: 'naver_place', memo: '주 2회 그룹 희망' });
  const l2 = createLead(ctx, { name: '오세영', phone: '010-7001-0002', marketing_source: 'instagram' });
  advanceLead(ctx, l2.id, 'contacted');
  const l3 = createLead(ctx, { name: '윤가은', phone: '010-7001-0003', marketing_source: 'ad' });
  advanceLead(ctx, l3.id, 'trial_booked');
  const l4 = createLead(ctx, { name: '서준호', phone: '010-7001-0004', marketing_source: 'referral' });
  advanceLead(ctx, l4.id, 'trial_done');
  addCounselingLog(ctx, { lead_id: l4.id, channel: 'call', content: '체험 만족, 개인레슨 가격 문의 → 재연락 예정', next_action_at: '2026-06-14T10:00:00+09:00' });
  void l1;

  // ── 수강권 발급(결제) ──
  // 카드 결제(현장) → card_sales 자동 생성, 결제기준 매출
  issuePass(ctx, { member_id: m1.id, product_id: 'prod_g10', payment_method: 'card_onsite', is_received: true, start_date: '2026-06-01', seller_staff_id: 'staff_lee' });
  issuePass(ctx, { member_id: m2.id, product_id: 'prod_gunlim', payment_method: 'transfer', is_received: true, start_date: '2026-06-03', seller_staff_id: 'staff_lee' });
  issuePass(ctx, { member_id: m3.id, product_id: 'prod_p10', payment_method: 'card_onsite', is_received: true, start_date: '2026-03-20', seller_staff_id: 'staff_owner' });
  // 미수금: 선등록 후 미결제
  issuePass(ctx, { member_id: m5.id, product_id: 'prod_g10', payment_method: 'transfer', is_received: false, start_date: '2026-06-05', seller_staff_id: 'staff_lee' });

  // ── 수업(이번 주) ──
  const S = (id: string, type: 'personal' | 'group' | 'trial', name: string, staffId: string, roomId: string, start: string, cap: number) =>
    createSession({ ...ctx, now: new Date('2026-06-01T00:00:00+09:00') }, { class_type: type, name, instructor_staff_id: staffId, room_id: roomId, start_at: start, capacity: cap });
  const past1 = S('', 'personal', '개인 기구', 'staff_kim', 'room_b', '2026-06-10T10:00:00+09:00', 1);
  const past2 = S('', 'group', '그룹 매트', 'staff_kim', 'room_a', '2026-06-11T11:00:00+09:00', 6);
  const sNow1 = S('', 'personal', '개인 기구', 'staff_kim', 'room_b', '2026-06-12T10:00:00+09:00', 1);
  const sNow2 = S('', 'group', '그룹 매트', 'staff_kim', 'room_a', '2026-06-12T11:00:00+09:00', 6);
  const sNow3 = S('', 'group', '그룹 리포머', 'staff_owner', 'room_a', '2026-06-12T18:00:00+09:00', 6);
  const sTrial = S('', 'trial', '체험 수업', 'staff_kim', 'room_a', '2026-06-12T13:00:00+09:00', 2);
  const sTomorrow = S('', 'group', '그룹 매트', 'staff_kim', 'room_a', '2026-06-13T11:00:00+09:00', 6);
  void sTrial;

  // ── 과거 출석(소진기준 매출 발생) ── 예약→출석을 과거 시각으로
  const bookAttend = (memberId: string, sessionId: string, bookIso: string, attendIso: string) => {
    const r = book(withNow(ctx, bookIso), { session_id: sessionId, member_id: memberId, is_self_booked: false });
    if (r.ok) attend(withNow(ctx, attendIso), r.reservation.id);
  };
  bookAttend(m3.id, past1.id, '2026-06-09T10:00:00+09:00', '2026-06-10T10:05:00+09:00'); // 개인 1회 소진
  bookAttend(m1.id, past2.id, '2026-06-10T10:00:00+09:00', '2026-06-11T11:05:00+09:00'); // 그룹 1회
  bookAttend(m2.id, past2.id, '2026-06-10T10:00:00+09:00', '2026-06-11T11:05:00+09:00'); // 무제한(차감X)

  // ── 다가오는 예약(현재 시각 기준) ──
  book(ctx, { session_id: sNow2.id, member_id: m1.id });
  book(ctx, { session_id: sNow2.id, member_id: m2.id });
  book(ctx, { session_id: sNow3.id, member_id: m2.id });
  book(ctx, { session_id: sTomorrow.id, member_id: m1.id });
  void sNow1;

  // ── 비용(이번 달) ──
  addExpense(ctx, { expense_category: 'rent', amount: 1500000, expense_date: '2026-06-10', vendor_name: 'OO부동산', is_recurring: true });
  addExpense(ctx, { expense_category: 'instructor_fee', amount: 700000, expense_date: '2026-06-10', vendor_name: '김강사', staff_id: 'staff_kim' });
  addExpense(ctx, { expense_category: 'utilities', amount: 120000, expense_date: '2026-06-11', vendor_name: '한국전력' });
  addExpense(ctx, { expense_category: 'advertising', amount: 200000, expense_date: '2026-06-05', vendor_name: '메타광고' });

  // ── 금융 연동(통장/카드) ──
  db.bank_accounts.push({ id: 'bank_1', ...baseAt(at), bank_code: '088', account_no_masked: '***-**-**1234', account_holder: '모던필라테스', balance_amount: 8200000, last_synced_at: at, status: 'active', is_open_banking_linked: false });
  // 통장 거래: 매출 입금(매칭 대기), 비용 출금(매칭 대기), 이체
  importBankTransactions(ctx, 'bank_1', [
    { txn_date: '2026-06-05', amount: 300000, counterparty_name: '최민', balance_after_amount: 8500000 }, // 미수 회원 입금 → 매칭 대기
    { txn_date: '2026-06-11', amount: -88000, counterparty_name: 'KT', balance_after_amount: 8112000 }, // 통신비 → 분류 대기
    { txn_date: '2026-06-09', amount: -50000, counterparty_name: '스타벅스', balance_after_amount: 8450000 }, // 식대 → 분류 대기
  ]);
  // 카드 사용내역(분류 대기)
  importCardExpenses(ctx, [
    { card_no_masked: '****-1111', vendor_name: 'OO마트', amount: 80000, used_at: '2026-06-09T15:00:00+09:00' },
    { card_no_masked: '****-1111', vendor_name: '쿠팡', amount: 45000, used_at: '2026-06-11T09:00:00+09:00' },
  ]);

  return db;
}
