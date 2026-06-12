/**
 * 요청 컨텍스트 — 테넌트/스튜디오 격리 + 행위자(역할)·기준시각.
 * 모든 v2 서비스는 ctx 를 첫 인자로 받아 studio_id 범위 안에서만 동작한다(canon §5).
 */
import type { DB } from '../data/db.js';
import type { Role, Studio, TenantScoped } from '../domain/index.js';
import { isoKST } from '../lib/util.js';

export interface RequestContext {
  db: DB;
  tenant_id: string;
  studio_id: string;
  user_id: string | null;
  role: Role;
  /** role==='member' 일 때 행위 주체 회원(본인 데이터 격리용). canon §5 member=own */
  member_id?: string | null;
  /** 직원 행위자(강사 등) 본인 staff_id — 본인 수업/담당 회원 범위 한정용. */
  staff_id?: string | null;
  now: Date;
}

/** 회원 컨텍스트에서 본인 member_id 강제(타인 데이터 접근 차단) */
export function assertOwnMember(ctx: RequestContext, target_member_id: string): void {
  if (ctx.role === 'member' && ctx.member_id && ctx.member_id !== target_member_id) {
    throw new Error('권한 없음: 회원은 본인 데이터만 접근할 수 있습니다');
  }
}

/** 현재 컨텍스트의 스튜디오(정책 보유) */
export function currentStudio(ctx: RequestContext): Studio {
  const s = ctx.db.studios.find(
    (x) => x.id === ctx.studio_id && x.tenant_id === ctx.tenant_id && !x.deleted_at,
  );
  if (!s) throw new Error('스튜디오 없음');
  return s;
}

/** 소프트삭제 제외 */
export function active<T extends { deleted_at?: string | null }>(arr: T[]): T[] {
  return arr.filter((r) => !r.deleted_at);
}

/** 테넌트+스튜디오 스코프 + 소프트삭제 제외 */
export function scoped<T extends { tenant_id: string; studio_id: string; deleted_at?: string | null }>(
  ctx: RequestContext,
  arr: T[],
): T[] {
  return arr.filter(
    (r) => r.tenant_id === ctx.tenant_id && r.studio_id === ctx.studio_id && !r.deleted_at,
  );
}

/** 스코프 내 단건 조회(조인) — 전역 .find 대신 테넌트 격리 보장 */
export function scopedFind<T extends { tenant_id: string; studio_id: string; deleted_at?: string | null }>(
  ctx: RequestContext,
  arr: T[],
  pred: (r: T) => boolean,
): T | undefined {
  return arr.find(
    (r) => r.tenant_id === ctx.tenant_id && r.studio_id === ctx.studio_id && !r.deleted_at && pred(r),
  );
}

/** 신규 행의 공통 컬럼(canon §1.2) */
export function baseFields(ctx: RequestContext): Omit<TenantScoped, 'id'> {
  const at = isoKST(ctx.now);
  return {
    tenant_id: ctx.tenant_id,
    studio_id: ctx.studio_id,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    created_by: ctx.user_id,
  };
}

/** 수정 시각 갱신 */
export function touch<T extends { updated_at: string }>(ctx: RequestContext, row: T): T {
  row.updated_at = isoKST(ctx.now);
  return row;
}
