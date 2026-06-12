/** 회원 서비스 — 등록/목록·필터/360°/태그. canon §2(B) / docs/spec 07 회원관리. */
import type { Gender, ID, MarketingSource, Member, MemberStatus, MemberTag } from '../domain/index.js';
import { dateKST, isoKST, nextId, won } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { assertOwnMember, baseFields, scoped, scopedFind, touch, type RequestContext } from './context.js';

export interface CreateMemberInput {
  name: string;
  phone: string;
  gender?: Gender;
  birth_date?: string;
  marketing_source?: MarketingSource;
  goal?: string;
  medical_note?: string;
  memo?: string;
  member_status?: MemberStatus;
  assigned_staff_id?: ID | null;
}

export function createMember(ctx: RequestContext, input: CreateMemberInput): Member {
  assertCan(ctx.role, 'members', 'create');
  const existing = scoped(ctx, ctx.db.members).find((m) => m.phone === input.phone);
  if (existing) return existing;
  const member: Member = {
    id: nextId(ctx.db.members, 'mbr'),
    ...baseFields(ctx),
    name: input.name,
    phone: input.phone,
    gender: input.gender,
    birth_date: input.birth_date,
    member_status: input.member_status ?? 'new_inquiry',
    marketing_source: input.marketing_source,
    goal: input.goal,
    medical_note: input.medical_note,
    memo: input.memo,
    assigned_staff_id: input.assigned_staff_id ?? null,
    tags: [],
  };
  ctx.db.members.push(member);
  audit(ctx, { entity_type: 'members', entity_id: member.id, action: 'create', after: member });
  return member;
}

export function updateMember(ctx: RequestContext, id: ID, patch: Partial<CreateMemberInput>): Member {
  assertCan(ctx.role, 'members', 'update');
  const m = scoped(ctx, ctx.db.members).find((x) => x.id === id);
  if (!m) throw new Error('회원 없음');
  const before = { ...m };
  Object.assign(m, patch);
  touch(ctx, m);
  audit(ctx, { entity_type: 'members', entity_id: id, action: 'update', before, after: m });
  return m;
}

export function setTag(ctx: RequestContext, id: ID, tag: MemberTag, on: boolean): void {
  assertCan(ctx.role, 'members', 'update');
  const m = scoped(ctx, ctx.db.members).find((x) => x.id === id);
  if (!m) throw new Error('회원 없음');
  const before = m.tags ? [...m.tags] : [];
  const tags = new Set(before);
  if (on) tags.add(tag);
  else tags.delete(tag);
  m.tags = [...tags];
  touch(ctx, m);
  audit(ctx, { entity_type: 'members', entity_id: id, action: 'update', before: { tags: before }, after: { tags: m.tags } });
}

export interface MemberSummary {
  member: Member;
  pass_label: string;
  has_pass: boolean;
  remaining: number | null;
  last_visit: string | null;
  receivable: number;
}

function currentPass(ctx: RequestContext, member_id: ID) {
  const actives = scoped(ctx, ctx.db.passes).filter(
    (p) => p.member_id === member_id && p.pass_status === 'active',
  );
  return [...actives].sort((a, b) => (a.expire_date < b.expire_date ? -1 : 1))[0] ?? null;
}

function lastVisit(ctx: RequestContext, member_id: ID): string | null {
  const visits = scoped(ctx, ctx.db.attendance)
    .filter((a) => a.member_id === member_id && a.attendance_status === 'attended')
    .map((a) => a.checked_at)
    .sort();
  return visits.length ? visits[visits.length - 1]!.slice(0, 10) : null;
}

function receivableOf(ctx: RequestContext, member_id: ID): number {
  // 미수금 = receivable + partial (canon §4.4)
  return scoped(ctx, ctx.db.payments)
    .filter((p) => p.member_id === member_id && (p.payment_status === 'receivable' || p.payment_status === 'partial'))
    .reduce((s, p) => s + p.receivable_amount, 0);
}

export interface MemberFilter {
  q?: string;
  status?: MemberStatus;
  pass_state?: 'has' | 'none';
  tag?: MemberTag;
}

export function listMembers(ctx: RequestContext, filter: MemberFilter = {}): MemberSummary[] {
  return scoped(ctx, ctx.db.members)
    .map((m) => ({ m, cur: currentPass(ctx, m.id) })) // 수강권 1회만 계산
    .filter(({ m, cur }) => {
      if (filter.q) {
        const q = filter.q.trim();
        if (!m.name.includes(q) && !m.phone.includes(q)) return false;
      }
      if (filter.status && m.member_status !== filter.status) return false;
      if (filter.tag && !(m.tags ?? []).includes(filter.tag)) return false;
      if (filter.pass_state === 'has' && !cur) return false;
      if (filter.pass_state === 'none' && cur) return false;
      return true;
    })
    .map(({ m, cur }) => {
      const prod = cur ? scopedFind(ctx, ctx.db.products, (p) => p.id === cur.product_id)?.name : undefined;
      const pass_label = cur
        ? cur.remaining_count != null
          ? `${prod} (${cur.remaining_count})`
          : `${prod} (~${cur.expire_date})`
        : '— 없음 —';
      return {
        member: m,
        pass_label,
        has_pass: !!cur,
        remaining: cur?.remaining_count ?? null,
        last_visit: lastVisit(ctx, m.id),
        receivable: receivableOf(ctx, m.id),
      };
    });
}

export interface Member360 {
  member: Member;
  passes: Array<{ id: ID; product_name: string; remaining_count: number | null; total_count: number | null; expire_date: string; pass_status: string }>;
  upcoming: Array<{ reservation_id: ID; start_at: string; class_name: string }>;
  reservations: Array<{ reservation_id: ID; start_at: string; class_name: string; class_type: string; status: string }>;
  payments: Array<{
    id: ID;
    date: string;
    product_name: string;
    amount: number;
    paid_amount: number;
    receivable_amount: number;
    method: string;
    status: string;
  }>;
  attendance_log: Array<{ id: ID; checked_at: string; class_name: string; status: string }>;
  attendance: { attended: number; no_show: number; rate: number };
  finance: { total_paid: number; receivable: number; receivable_label: string };
  counseling: Array<{ id: ID; consulted_at: string; channel: string; content: string }>;
}

export function getMember360(ctx: RequestContext, member_id: ID): Member360 | null {
  assertOwnMember(ctx, member_id); // 회원은 본인 360만
  const member = scoped(ctx, ctx.db.members).find((m) => m.id === member_id);
  if (!member) return null;
  // 강사는 담당 회원만 360° 열람(canon §5 members=assigned). 비담당은 차단.
  if (ctx.role === 'instructor' && ctx.staff_id && member.assigned_staff_id !== ctx.staff_id) {
    throw new Error('권한 없음: 담당 회원만 열람할 수 있습니다');
  }

  const passes = scoped(ctx, ctx.db.passes)
    .filter((p) => p.member_id === member_id)
    .map((p) => ({
      id: p.id,
      product_name: scopedFind(ctx, ctx.db.products, (pp) => pp.id === p.product_id)?.name ?? '수강권',
      remaining_count: p.remaining_count,
      total_count: p.total_count,
      expire_date: p.expire_date,
      pass_status: p.pass_status,
    }));

  const upcoming = scoped(ctx, ctx.db.reservations)
    .filter((r) => r.member_id === member_id && r.reservation_status === 'booked')
    .map((r) => {
      const s = scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === r.class_session_id)!;
      return { reservation_id: r.id, start_at: s.start_at, class_name: s.name };
    })
    .filter((x) => new Date(x.start_at) >= ctx.now)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1));

  const mine = scoped(ctx, ctx.db.attendance).filter((a) => a.member_id === member_id);
  const attended = mine.filter((a) => a.attendance_status === 'attended' || a.attendance_status === 'late').length;
  const no_show = mine.filter((a) => a.attendance_status === 'no_show').length;
  const total = attended + no_show;
  const rate = total ? Math.round((attended / total) * 100) : 0;
  const sessName = (id: ID) => scopedFind(ctx, ctx.db.class_sessions, (x) => x.id === id);
  const attendance_log = mine
    .map((a) => {
      const s = sessName(a.class_session_id);
      return { id: a.id, checked_at: a.checked_at, class_name: s?.name ?? '-', status: a.attendance_status };
    })
    .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1));

  // 예약 전체 이력(상태 무관)
  const reservations = scoped(ctx, ctx.db.reservations)
    .filter((r) => r.member_id === member_id)
    .map((r) => {
      const s = sessName(r.class_session_id);
      return {
        reservation_id: r.id,
        start_at: s?.start_at ?? r.booked_at,
        class_name: s?.name ?? '-',
        class_type: s?.class_type ?? '',
        status: r.reservation_status,
      };
    })
    .sort((a, b) => (a.start_at < b.start_at ? 1 : -1));

  const myPayments = scoped(ctx, ctx.db.payments).filter((p) => p.member_id === member_id);
  const total_paid = myPayments.reduce((s, p) => s + p.paid_amount, 0);
  const receivable = receivableOf(ctx, member_id);
  const payments = myPayments
    .map((p) => {
      const pur = scopedFind(ctx, ctx.db.purchases, (x) => x.id === p.purchase_id);
      const prod = pur ? scopedFind(ctx, ctx.db.products, (x) => x.id === pur.product_id)?.name : undefined;
      return {
        id: p.id,
        date: (p.paid_at ?? p.created_at).slice(0, 10),
        product_name: prod ?? '결제',
        amount: p.amount,
        paid_amount: p.paid_amount,
        receivable_amount: p.receivable_amount,
        method: p.payment_method,
        status: p.payment_status,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const counseling = scoped(ctx, ctx.db.counseling_logs)
    .filter((c) => c.member_id === member_id)
    .sort((a, b) => (a.consulted_at < b.consulted_at ? 1 : -1))
    .map((c) => ({ id: c.id, consulted_at: c.consulted_at, channel: c.channel, content: c.content }));

  return {
    member,
    passes,
    upcoming,
    reservations,
    payments,
    attendance_log,
    attendance: { attended, no_show, rate },
    finance: { total_paid, receivable, receivable_label: won(receivable) },
    counseling,
  };
}
