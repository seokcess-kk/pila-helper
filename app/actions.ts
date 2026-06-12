'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTOR_COOKIE, getContext, getMemberContext } from '@/server/db2.js';
import {
  assertCan,
  addExpense,
  advanceLead,
  addCounselingLog,
  attend,
  book,
  cancelReservation,
  categoryDefaultCost,
  classifyBankAsExpense,
  classifyCardAsExpense,
  closeSession,
  convertLead,
  createLead,
  createMember,
  createRoom,
  dateKST,
  deleteExpense,
  deleteRoom,
  excludeBankTxn,
  inviteUser,
  issuePass,
  markNoShow,
  matchBankToPayment,
  removeUser,
  promoteWaitlist,
  refundPass,
  updateExpenseCategory,
  updateMember,
  updateRoom,
  updateStudio,
  updateStudioPolicy,
  updateUser,
  type CostType,
  type DeductTiming,
  type EligibilityReason,
  type ExpenseCategory,
  type Gender,
  type LeadStatus,
  type MarketingSource,
  type MatchTarget,
  type MemberStatus,
  type PaymentMethod,
  type Role,
} from '@/biz/index.js';

const FIN = ['/finance', '/finance/matching', '/analysis', '/dashboard'];
function revalidate(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/** redirect 대상에 성공 토스트 파라미터를 부착(ToastBridge가 읽어 표시 후 URL 정리). */
function withToast(path: string, msg: string, type: 'success' | 'error' | 'info' = 'success') {
  const sep = path.includes('?') ? '&' : '?';
  const tt = type === 'success' ? '' : `&tt=${type}`;
  return `${path}${sep}toast=${encodeURIComponent(msg)}${tt}`;
}

// ── 입력 검증 헬퍼(신뢰경계: FormData) ──
/** 정수(원) 금액. 음수/비정수/NaN/Infinity → null */
function parseMoney(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
/** YYYY-MM-DD 형식만 허용, 아니면 fallback */
function parseDate(v: FormDataEntryValue | null, fallback: string): string {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

// ── 회원 ──
export async function addMemberAction(fd: FormData) {
  const name = String(fd.get('name') ?? '').trim();
  const phone = String(fd.get('phone') ?? '').trim();
  const g = String(fd.get('gender') ?? '');
  const gender = g === 'male' || g === 'female' || g === 'other' ? (g as Gender) : undefined;
  const ms = String(fd.get('marketing_source') ?? '') as MarketingSource;
  if (name && phone)
    createMember(getContext(), {
      name,
      phone,
      gender,
      marketing_source: ms || undefined,
      goal: String(fd.get('goal') ?? '') || undefined,
      medical_note: String(fd.get('medical_note') ?? '') || undefined,
      memo: String(fd.get('memo') ?? '') || undefined,
    });
  revalidatePath('/members');
  redirect(withToast('/members', '회원을 추가했습니다'));
}

export async function updateMemberAction(fd: FormData) {
  const id = String(fd.get('member_id'));
  const g = String(fd.get('gender') ?? '');
  const gender = g === 'male' || g === 'female' || g === 'other' ? (g as Gender) : undefined;
  const status = String(fd.get('member_status') ?? '') as MemberStatus;
  updateMember(getContext(), id, {
    name: String(fd.get('name') ?? '').trim() || undefined,
    phone: String(fd.get('phone') ?? '').trim() || undefined,
    gender,
    marketing_source: (String(fd.get('marketing_source') ?? '') as MarketingSource) || undefined,
    goal: String(fd.get('goal') ?? '') || undefined,
    medical_note: String(fd.get('medical_note') ?? '') || undefined,
    memo: String(fd.get('memo') ?? '') || undefined,
    member_status: status || undefined,
  });
  revalidatePath(`/members/${id}`);
  redirect(withToast(`/members/${id}`, '회원 정보를 저장했습니다'));
}

export async function addMemberCounselingAction(fd: FormData) {
  const member_id = String(fd.get('member_id'));
  const content = String(fd.get('content') ?? '').trim();
  if (content) addCounselingLog(getContext(), { member_id, channel: 'call', content });
  revalidatePath(`/members/${member_id}`);
}

export async function issuePassAction(fd: FormData) {
  const member_id = String(fd.get('member_id'));
  issuePass(getContext(), {
    member_id,
    product_id: String(fd.get('product_id')),
    payment_method: String(fd.get('payment_method') ?? 'card_onsite') as PaymentMethod,
    is_received: fd.get('is_received') === 'on',
    discount_amount: parseMoney(fd.get('discount_amount')) ?? 0,
  });
  revalidate([`/members/${member_id}`, ...FIN]);
  redirect(withToast(`/members/${member_id}`, '수강권을 발급했습니다'));
}

export async function refundPassAction(fd: FormData) {
  const member_id = String(fd.get('member_id'));
  refundPass(getContext(), String(fd.get('pass_id')), String(fd.get('reason') ?? '') || undefined);
  revalidate([`/members/${member_id}`, ...FIN]);
  redirect(withToast(`/members/${member_id}`, '수강권을 환불했습니다'));
}

// ── 예약/출결 ──
export async function attendanceAction(fd: FormData) {
  const reservation_id = String(fd.get('reservation_id'));
  const session_id = String(fd.get('session_id'));
  const event = String(fd.get('event'));
  // 이벤트 화이트리스트(폼 조작·오타가 attend 로 흘러 차감/매출 인식되는 것 차단)
  if (event === 'no_show') markNoShow(getContext(), reservation_id);
  else if (event === 'attend') attend(getContext(), reservation_id);
  else throw new Error('알 수 없는 출결 이벤트');
  revalidate([`/sessions/${session_id}`, '/timetable', ...FIN]);
}

export async function closeSessionAction(fd: FormData) {
  const session_id = String(fd.get('session_id'));
  closeSession(getContext(), session_id);
  revalidate([`/sessions/${session_id}`, '/timetable', '/dashboard']);
}

export async function bookAction(fd: FormData) {
  const session_id = String(fd.get('session_id'));
  const member_id = String(fd.get('member_id'));
  // 회원 모바일웹: 로그인한 회원(=member_id) 컨텍스트로 본인만 예약
  const r = book(getMemberContext(member_id), { session_id, member_id, is_self_booked: true });
  const msg = r.ok ? (r.waitlist ? 'waitlist' : 'ok') : r.reasons.length ? r.reasons.join(',') : 'error';
  revalidatePath('/m/booking');
  redirect(`/m/booking?member=${member_id}&msg=${encodeURIComponent(msg)}`);
}

export async function cancelAction(fd: FormData) {
  const member_id = String(fd.get('member_id'));
  const session_id = cancelReservation(getMemberContext(member_id), String(fd.get('reservation_id')));
  revalidate(['/m/mypage', '/m/booking', '/timetable', `/sessions/${session_id}`, '/dashboard']);
}

// ── 운영자(콘솔) 예약 ──
const BOOK_REASON: Record<EligibilityReason, string> = {
  no_pass: '유효한 수강권이 없습니다',
  no_remaining: '잔여 횟수가 없습니다',
  expired: '수강권이 만료됐습니다',
  scope_mismatch: '이 수업에 맞는 수강권이 아닙니다',
  not_open_yet: '아직 예약 오픈 전입니다',
  closed: '예약이 마감됐습니다',
  session_canceled: '폐강된 수업입니다',
  daily_limit: '하루 예약 한도를 초과했습니다',
  duplicate: '이미 같은 시간에 예약이 있습니다',
};

export type BookState = { status: 'idle' | 'ok' | 'waitlist' | 'error'; message?: string };

/** 운영자 대리예약 — useFormState 로 결과/사유를 폼에 반환. */
export async function adminBookAction(_prev: BookState, fd: FormData): Promise<BookState> {
  const session_id = String(fd.get('session_id'));
  const member_id = String(fd.get('member_id'));
  if (!member_id) return { status: 'error', message: '회원을 선택하세요' };
  const r = book(getContext(), { session_id, member_id, is_self_booked: false });
  revalidate([`/sessions/${session_id}`, '/timetable', '/dashboard', ...FIN]);
  if (r.ok) return { status: r.waitlist ? 'waitlist' : 'ok' };
  const msg = r.reasons.length ? r.reasons.map((x) => BOOK_REASON[x] ?? x).join(' · ') : '예약할 수 없습니다';
  return { status: 'error', message: msg };
}

/** 운영자 예약 취소(세션 상세 드로어). */
export async function cancelReservationAdminAction(fd: FormData) {
  const session_id = cancelReservation(getContext(), String(fd.get('reservation_id')));
  revalidate([`/sessions/${session_id}`, '/timetable', '/dashboard', ...FIN]);
}

/** 대기 1순위 승격. */
export async function promoteWaitlistAction(fd: FormData) {
  const session_id = String(fd.get('session_id'));
  promoteWaitlist(getContext(), session_id);
  revalidate([`/sessions/${session_id}`, '/timetable', '/dashboard', ...FIN]);
}

// ── 비용/매칭 ──
export async function addExpenseAction(fd: FormData) {
  const ctx = getContext();
  assertCan(ctx.role, 'expenses', 'create'); // 회계/오너만 비용 입력(canon §5)
  const amount = parseMoney(fd.get('amount'));
  const ct = String(fd.get('cost_type') ?? '');
  const category = String(fd.get('expense_category') ?? 'etc') as ExpenseCategory;
  if (amount && amount > 0)
    addExpense(ctx, {
      expense_category: category,
      amount,
      expense_date: parseDate(fd.get('expense_date'), dateKST(ctx.now)),
      vendor_name: String(fd.get('vendor_name') ?? '') || undefined,
      // 성격 자동 = 카테고리의 (편집 반영) 기본 성격
      cost_type: ct === 'fixed' || ct === 'variable' ? (ct as CostType) : categoryDefaultCost(ctx, category),
      is_recurring: fd.get('is_recurring') === 'on',
      doc_memo: String(fd.get('doc_memo') ?? '') || undefined,
      memo: String(fd.get('memo') ?? '') || undefined,
    });
  revalidate(FIN);
  redirect(withToast('/finance', '비용을 추가했습니다'));
}

export async function deleteExpenseAction(fd: FormData) {
  deleteExpense(getContext(), String(fd.get('expense_id')));
  revalidate(FIN);
  redirect(withToast('/finance', '비용을 삭제했습니다'));
}

export async function matchBankAction(fd: FormData) {
  matchBankToPayment(getContext(), String(fd.get('bank_txn_id')), String(fd.get('payment_id')));
  revalidate(FIN);
  redirect(withToast('/finance/matching', '입금을 매칭했습니다'));
}

export async function classifyBankAction(fd: FormData) {
  const target = String(fd.get('target') ?? 'expense');
  const ctx = getContext();
  if (target === 'expense') {
    classifyBankAsExpense(ctx, String(fd.get('bank_txn_id')), String(fd.get('expense_category') ?? 'etc') as ExpenseCategory, null, fd.get('learn') === 'on');
  } else {
    excludeBankTxn(ctx, String(fd.get('bank_txn_id')), target as 'transfer' | 'etc');
  }
  revalidate(FIN);
  redirect(withToast('/finance/matching', '거래를 분류했습니다'));
}

export async function classifyCardAction(fd: FormData) {
  classifyCardAsExpense(
    getContext(),
    String(fd.get('card_expense_id')),
    String(fd.get('expense_category') ?? 'etc') as ExpenseCategory,
    null,
    fd.get('learn') === 'on',
  );
  revalidate(FIN);
  redirect(withToast('/finance/matching', '카드 내역을 분류했습니다'));
}

// ── 상담 CRM ──
export async function createLeadAction(fd: FormData) {
  const name = String(fd.get('name') ?? '').trim();
  const phone = String(fd.get('phone') ?? '').trim();
  if (name && phone)
    createLead(getContext(), {
      name,
      phone,
      marketing_source: (String(fd.get('marketing_source') ?? '') as MarketingSource) || undefined,
      memo: String(fd.get('memo') ?? '') || undefined,
    });
  revalidatePath('/crm');
  redirect(withToast('/crm', '상담을 등록했습니다'));
}

export async function advanceLeadAction(fd: FormData) {
  advanceLead(getContext(), String(fd.get('lead_id')), String(fd.get('status')) as LeadStatus, {
    lost_reason: String(fd.get('lost_reason') ?? '') || undefined,
  });
  revalidatePath('/crm');
}

export async function convertLeadAction(fd: FormData) {
  const { member_id } = convertLead(getContext(), String(fd.get('lead_id')));
  revalidate(['/crm', '/members']);
  redirect(withToast(`/members/${member_id}`, '회원으로 전환했습니다'));
}

export async function addCounselingAction(fd: FormData) {
  addCounselingLog(getContext(), {
    lead_id: String(fd.get('lead_id') ?? '') || undefined,
    member_id: String(fd.get('member_id') ?? '') || undefined,
    channel: 'call',
    content: String(fd.get('content') ?? ''),
  });
  revalidatePath('/crm');
}

// ── 데모: 역할 전환(actor 쿠키) ──
export async function setActorAction(fd: FormData) {
  const v = String(fd.get('actor') ?? 'owner');
  cookies().set(ACTOR_COOKIE, v, { path: '/', sameSite: 'lax' });
  redirect('/dashboard');
}

// ── 설정 ──
function intOf(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? Math.trunc(n) : undefined;
}
function pctOf(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? '').trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n / 100 : undefined;
}

export async function updateStudioAction(fd: FormData) {
  updateStudio(getContext(), {
    name: String(fd.get('name') ?? ''),
    address: String(fd.get('address') ?? ''),
    phone: String(fd.get('phone') ?? ''),
    timezone: String(fd.get('timezone') ?? ''),
  });
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=studio', '스튜디오 정보를 저장했습니다'));
}

export async function updateStudioPolicyAction(fd: FormData) {
  const ctx = getContext();
  const section = String(fd.get('section') ?? '');
  if (section === 'booking') {
    const dl = String(fd.get('daily_booking_limit') ?? '').trim();
    updateStudioPolicy(ctx, {
      booking: {
        booking_open_days: intOf(fd.get('booking_open_days')),
        booking_close_minutes: intOf(fd.get('booking_close_minutes')),
        cancel_deadline_minutes: intOf(fd.get('cancel_deadline_minutes')),
        daily_booking_limit: dl === '' ? null : intOf(dl) ?? null,
        deduct_timing: String(fd.get('deduct_timing')) as DeductTiming,
        no_show_deduct: fd.get('no_show_deduct') === 'on',
        late_cancel_deduct: fd.get('late_cancel_deduct') === 'on',
        waitlist_auto_promote: fd.get('waitlist_auto_promote') === 'on',
      },
    });
  } else if (section === 'pass') {
    updateStudioPolicy(ctx, {
      pass: {
        expiring_alert_days: intOf(fd.get('expiring_alert_days')),
        low_count_threshold: intOf(fd.get('low_count_threshold')),
        holdable: fd.get('holdable') === 'on',
        max_hold_days: intOf(fd.get('max_hold_days')),
        extend_allowed: fd.get('extend_allowed') === 'on',
      },
    });
  } else if (section === 'finance') {
    updateStudioPolicy(ctx, {
      finance: {
        revenue_recognition: String(fd.get('revenue_recognition')) as 'on_paid' | 'on_deposit',
        allow_receivable: fd.get('allow_receivable') === 'on',
        refund_penalty_rate: pctOf(fd.get('refund_penalty_rate')),
        card_fee_rate: pctOf(fd.get('card_fee_rate')),
      },
    });
  } else if (section === 'notification') {
    updateStudioPolicy(ctx, {
      notification: {
        reminder_before_minutes: intOf(fd.get('reminder_before_minutes')),
        long_absence_days: intOf(fd.get('long_absence_days')),
        default_channel: String(fd.get('default_channel')) as 'sms' | 'kakao' | 'push' | 'email',
      },
    });
  }
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=policy', '정책을 저장했습니다'));
}

export async function createRoomAction(fd: FormData) {
  const name = String(fd.get('name') ?? '').trim();
  if (name) createRoom(getContext(), { name, capacity: intOf(fd.get('capacity')) ?? 1 });
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=rooms', '룸을 추가했습니다'));
}

export async function updateRoomAction(fd: FormData) {
  const status = String(fd.get('status') ?? '');
  updateRoom(getContext(), String(fd.get('room_id')), {
    name: String(fd.get('name') ?? ''),
    capacity: intOf(fd.get('capacity')),
    status: status === 'active' || status === 'inactive' ? status : undefined,
  });
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=rooms', '룸을 저장했습니다'));
}

export async function deleteRoomAction(fd: FormData) {
  deleteRoom(getContext(), String(fd.get('room_id')));
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=rooms', '룸을 삭제했습니다'));
}

// ── 사용자 · 권한 ──
const ASSIGNABLE_ROLES = ['owner', 'manager', 'info_staff', 'instructor', 'accountant'] as const;
function roleOf(v: FormDataEntryValue | null): Role | undefined {
  const s = String(v ?? '');
  return (ASSIGNABLE_ROLES as readonly string[]).includes(s) ? (s as Role) : undefined;
}
function statusOf(v: FormDataEntryValue | null): 'active' | 'invited' | 'suspended' | undefined {
  const s = String(v ?? '');
  return s === 'active' || s === 'invited' || s === 'suspended' ? s : undefined;
}

export async function inviteUserAction(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim();
  const role = roleOf(fd.get('role')) ?? 'manager';
  if (email.includes('@')) inviteUser(getContext(), { email, role });
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=users', '사용자를 초대했습니다'));
}

export async function updateUserAction(fd: FormData) {
  let msg = '사용자 정보를 저장했습니다';
  let type: 'success' | 'error' = 'success';
  try {
    updateUser(getContext(), String(fd.get('user_id')), {
      role: roleOf(fd.get('role')),
      status: statusOf(fd.get('status')),
    });
  } catch (e) {
    msg = e instanceof Error ? e.message : '변경할 수 없습니다';
    type = 'error';
  }
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=users', msg, type));
}

export async function removeUserAction(fd: FormData) {
  let msg = '사용자를 제거했습니다';
  let type: 'success' | 'error' = 'success';
  try {
    removeUser(getContext(), String(fd.get('user_id')));
  } catch (e) {
    msg = e instanceof Error ? e.message : '제거할 수 없습니다';
    type = 'error';
  }
  revalidatePath('/settings');
  redirect(withToast('/settings?tab=users', msg, type));
}

export async function updateExpenseCategoryAction(fd: FormData) {
  const ct = String(fd.get('default_cost_type') ?? '');
  let msg = '카테고리를 저장했습니다';
  let type: 'success' | 'error' = 'success';
  try {
    updateExpenseCategory(getContext(), String(fd.get('category_id')), {
      name_ko: String(fd.get('name_ko') ?? ''),
      default_cost_type: ct === 'fixed' || ct === 'variable' ? (ct as CostType) : undefined,
      is_active: fd.get('is_active') === 'on',
    });
  } catch (e) {
    msg = e instanceof Error ? e.message : '저장할 수 없습니다';
    type = 'error';
  }
  revalidate(['/settings', ...FIN]);
  redirect(withToast('/settings?tab=categories', msg, type));
}
