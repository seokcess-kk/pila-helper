/**
 * v2 인메모리 싱글톤 + 요청 컨텍스트 팩토리(데모). 프로덕션은 Prisma/Postgres + 세션 인증으로 교체.
 * Next dev/HMR 에서도 단일 인스턴스를 유지하도록 globalThis 에 보관.
 */
import { cookies } from 'next/headers';
import type { Role } from '../domain/index.js';
import type { RequestContext } from '../biz/context.js';
import { DEMO_NOW, type DB } from '../data/db.js';
import { seedDb } from '../data/seed.js';

const KEY = '__pila_v2_db__';
type G = typeof globalThis & { [KEY]?: DB };

export const ACTOR_COOKIE = 'pila_actor';

export function getDb(): DB {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = seedDb();
  return g[KEY]!;
}

export function resetDb(): void {
  (globalThis as G)[KEY] = seedDb();
}

/**
 * 데모 actor 해석 — 쿠키 `pila_actor`(staff_id 또는 'owner')로 행위 역할을 주입.
 * 실서비스는 세션/인증에서 role·user_id·staff_id 도출. 쿠키 없음/오류 시 오너.
 */
function resolveActor(): { role: Role; user_id: string; staff_id: string | null } {
  try {
    const v = cookies().get(ACTOR_COOKIE)?.value;
    if (!v || v === 'owner') return { role: 'owner', user_id: 'user_owner', staff_id: null };
    const db = getDb();
    const staff = db.staff.find((s) => s.id === v && !s.deleted_at);
    if (!staff) return { role: 'owner', user_id: 'user_owner', staff_id: null };
    const user = db.users.find((u) => u.staff_id === staff.id && !u.deleted_at);
    return { role: staff.role, user_id: user?.id ?? `staff:${staff.id}`, staff_id: staff.id };
  } catch {
    return { role: 'owner', user_id: 'user_owner', staff_id: null };
  }
}

/**
 * 콘솔 컨텍스트. 인자를 명시하면 그대로(서비스/특수경로), 없으면 actor 쿠키로 역할 주입(데모).
 */
export function getContext(role?: Role, user_id?: string): RequestContext {
  const actor = role ? { role, user_id: user_id ?? 'user_owner', staff_id: null } : resolveActor();
  return {
    db: getDb(),
    tenant_id: 'tenant_1',
    studio_id: 'studio_1',
    user_id: actor.user_id,
    role: actor.role,
    staff_id: actor.staff_id,
    now: DEMO_NOW,
  };
}

/**
 * 회원(모바일웹) 컨텍스트 — role='member' + 본인 member_id 고정.
 * 데모는 ?member= 를 '로그인한 회원'으로 취급. 서비스가 본인 데이터만 접근하도록 강제.
 */
export function getMemberContext(member_id: string): RequestContext {
  const db = getDb();
  const user = db.users.find((u) => u.member_id === member_id);
  return {
    db,
    tenant_id: 'tenant_1',
    studio_id: 'studio_1',
    user_id: user?.id ?? `member_user:${member_id}`,
    role: 'member',
    member_id,
    now: DEMO_NOW,
  };
}
