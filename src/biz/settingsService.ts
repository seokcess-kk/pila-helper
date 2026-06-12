/** 설정 서비스 — 스튜디오 정보·운영 정책·룸·사용자·비용 카테고리 관리. canon §6. */
import type { CostType, ExpenseCategory, ExpenseCategoryRow, ID, Role, Room, Studio, User } from '../domain/index.js';
import type { BookingPolicy, FinancePolicy, NotificationPolicy, PassPolicy } from '../domain/policy.js';
import { EXPENSE_CATEGORY_DEFAULT_COST } from '../domain/index.js';
import { isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, currentStudio, scoped, touch, type RequestContext } from './context.js';

// ── 스튜디오 정보 ──
export function updateStudio(
  ctx: RequestContext,
  patch: Partial<Pick<Studio, 'name' | 'address' | 'phone' | 'timezone'>>,
): Studio {
  assertCan(ctx.role, 'studio', 'update');
  const s = currentStudio(ctx);
  const before = { name: s.name, address: s.address, phone: s.phone, timezone: s.timezone };
  if (patch.name !== undefined && patch.name.trim()) s.name = patch.name.trim();
  if (patch.address !== undefined) s.address = patch.address || undefined;
  if (patch.phone !== undefined) s.phone = patch.phone || undefined;
  if (patch.timezone !== undefined && patch.timezone) s.timezone = patch.timezone;
  touch(ctx, s);
  audit(ctx, { entity_type: 'studios', entity_id: s.id, action: 'update', before, after: s });
  return s;
}

// ── 운영 정책 ──
export interface PolicyPatch {
  booking?: Partial<BookingPolicy>;
  pass?: Partial<PassPolicy>;
  finance?: Partial<FinancePolicy>;
  notification?: Partial<NotificationPolicy>;
}

/** undefined 키는 건너뛰어 기존 값 보존(부분 수정). null·false·0 은 유효값으로 반영. */
function mergeDefined<T extends object>(target: T, src: Partial<T>): void {
  for (const k in src) {
    const v = src[k as keyof T];
    if (v !== undefined) target[k as keyof T] = v as T[keyof T];
  }
}

export function updateStudioPolicy(ctx: RequestContext, patch: PolicyPatch): Studio {
  assertCan(ctx.role, 'studio', 'update');
  const s = currentStudio(ctx);
  const p = s.policy_json;
  if (patch.booking) mergeDefined(p.booking, patch.booking);
  if (patch.pass) mergeDefined(p.pass, patch.pass);
  if (patch.finance) mergeDefined(p.finance, patch.finance);
  if (patch.notification) mergeDefined(p.notification, patch.notification);
  touch(ctx, s);
  audit(ctx, { entity_type: 'studios', entity_id: s.id, action: 'update', after: { policy_json: p } });
  return s;
}

// ── 룸 ──
export function createRoom(ctx: RequestContext, input: { name: string; capacity: number }): Room {
  assertCan(ctx.role, 'classes', 'create');
  const room: Room = {
    id: nextId(ctx.db.rooms, 'room'),
    ...baseFields(ctx),
    name: input.name,
    capacity: input.capacity,
    status: 'active',
  };
  ctx.db.rooms.push(room);
  audit(ctx, { entity_type: 'rooms', entity_id: room.id, action: 'create', after: room });
  return room;
}

export function updateRoom(
  ctx: RequestContext,
  id: ID,
  patch: Partial<Pick<Room, 'name' | 'capacity' | 'status'>>,
): Room {
  assertCan(ctx.role, 'classes', 'update');
  const room = scoped(ctx, ctx.db.rooms).find((r) => r.id === id);
  if (!room) throw new Error('룸 없음');
  const before = { ...room };
  if (patch.name !== undefined && patch.name.trim()) room.name = patch.name.trim();
  if (patch.capacity !== undefined && patch.capacity > 0) room.capacity = patch.capacity;
  if (patch.status !== undefined) room.status = patch.status;
  touch(ctx, room);
  audit(ctx, { entity_type: 'rooms', entity_id: id, action: 'update', before, after: room });
  return room;
}

export function deleteRoom(ctx: RequestContext, id: ID): void {
  assertCan(ctx.role, 'classes', 'delete');
  const room = scoped(ctx, ctx.db.rooms).find((r) => r.id === id);
  if (!room) return;
  // 사용 중인 수업이 있으면 비활성만(소프트삭제로 데이터 정합 보존)
  room.deleted_at = isoKST(ctx.now);
  audit(ctx, { entity_type: 'rooms', entity_id: id, action: 'delete', before: room });
}

// ── 사용자 · 권한 ──
/** 테넌트 사용자 목록(User 는 studio 스코프가 아니라 tenant 스코프). */
export function listUsers(ctx: RequestContext): User[] {
  return ctx.db.users.filter((u) => u.tenant_id === ctx.tenant_id && !u.deleted_at);
}

function activeOwnerCount(ctx: RequestContext): number {
  return listUsers(ctx).filter((u) => u.role === 'owner' && u.status !== 'suspended').length;
}

/** 사용자 초대 — status='invited'. 실서비스는 초대 메일 발송 후 비밀번호 설정. */
export function inviteUser(ctx: RequestContext, input: { email: string; role: Role }): User {
  assertCan(ctx.role, 'users', 'create');
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('올바른 이메일이 아닙니다');
  const existing = listUsers(ctx).find((u) => u.email === email);
  if (existing) return existing; // 멱등
  const at = isoKST(ctx.now);
  const user: User = {
    id: nextId(ctx.db.users, 'user'),
    created_at: at,
    updated_at: at,
    deleted_at: null,
    created_by: ctx.user_id,
    tenant_id: ctx.tenant_id,
    email,
    role: input.role,
    status: 'invited',
  };
  ctx.db.users.push(user);
  audit(ctx, { entity_type: 'users', entity_id: user.id, action: 'create', after: user });
  return user;
}

/** 역할/상태 변경 — 마지막 활성 오너 보호. */
export function updateUser(ctx: RequestContext, id: ID, patch: { role?: Role; status?: User['status'] }): User {
  assertCan(ctx.role, 'users', 'update');
  const u = listUsers(ctx).find((x) => x.id === id);
  if (!u) throw new Error('사용자 없음');
  const willLoseOwner =
    u.role === 'owner' &&
    u.status !== 'suspended' &&
    ((patch.role !== undefined && patch.role !== 'owner') || patch.status === 'suspended');
  if (willLoseOwner && activeOwnerCount(ctx) <= 1) {
    throw new Error('마지막 활성 오너의 권한/상태는 변경할 수 없습니다');
  }
  const before = { role: u.role, status: u.status };
  if (patch.role !== undefined) u.role = patch.role;
  if (patch.status !== undefined) u.status = patch.status;
  u.updated_at = isoKST(ctx.now);
  audit(ctx, { entity_type: 'users', entity_id: id, action: 'update', before, after: { role: u.role, status: u.status } });
  return u;
}

// ── 비용 카테고리 ──
/** 활성 카테고리(정렬) — 비용 입력·거래 분류 폼 옵션의 단일 출처. */
export function activeExpenseCategories(ctx: RequestContext): ExpenseCategoryRow[] {
  return scoped(ctx, ctx.db.expense_categories)
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** 카테고리 코드의 기본 성격(편집 반영) — 폼에서 성격 미지정 시 사용. enum-외 code도 안전(최종 폴백). */
export function categoryDefaultCost(ctx: RequestContext, code: ExpenseCategory): CostType {
  return scoped(ctx, ctx.db.expense_categories).find((c) => c.code === code)?.default_cost_type ?? EXPENSE_CATEGORY_DEFAULT_COST[code] ?? 'variable';
}

/** code → 표시명 맵(편집된 name_ko 반영, 비활성 포함 — 과거 내역 라벨용). */
export function expenseCategoryNames(ctx: RequestContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of scoped(ctx, ctx.db.expense_categories)) out[c.code] = c.name_ko;
  return out;
}

export function updateExpenseCategory(
  ctx: RequestContext,
  id: ID,
  patch: { name_ko?: string; default_cost_type?: CostType; is_active?: boolean },
): ExpenseCategoryRow {
  assertCan(ctx.role, 'expenses', 'update');
  const c = scoped(ctx, ctx.db.expense_categories).find((x) => x.id === id);
  if (!c) throw new Error('카테고리 없음');
  // 입력·분류 폼은 활성 카테고리만 노출하므로, 마지막 활성 카테고리는 비활성화 불가(빈 셀렉트 방지).
  if (patch.is_active === false && c.is_active && activeExpenseCategories(ctx).length <= 1) {
    throw new Error('최소 한 개의 활성 카테고리가 필요합니다');
  }
  const before = { name_ko: c.name_ko, default_cost_type: c.default_cost_type, is_active: c.is_active };
  if (patch.name_ko !== undefined && patch.name_ko.trim()) c.name_ko = patch.name_ko.trim();
  if (patch.default_cost_type !== undefined) c.default_cost_type = patch.default_cost_type;
  if (patch.is_active !== undefined) c.is_active = patch.is_active;
  touch(ctx, c);
  audit(ctx, { entity_type: 'expense_categories', entity_id: id, action: 'update', before, after: c });
  return c;
}

/** 사용자 제거(소프트) — 본인·마지막 오너는 불가. */
export function removeUser(ctx: RequestContext, id: ID): void {
  assertCan(ctx.role, 'users', 'delete');
  const u = listUsers(ctx).find((x) => x.id === id);
  if (!u) return;
  if (u.id === ctx.user_id) throw new Error('본인 계정은 삭제할 수 없습니다');
  if (u.role === 'owner' && u.status !== 'suspended' && activeOwnerCount(ctx) <= 1) {
    throw new Error('마지막 활성 오너는 삭제할 수 없습니다');
  }
  u.deleted_at = isoKST(ctx.now);
  audit(ctx, { entity_type: 'users', entity_id: id, action: 'delete', before: u });
}
