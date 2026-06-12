/**
 * 감사 로그 — canon §1, §5: 모든 수정/삭제/환불/수강권 차감/매칭 변경을 append-only 기록.
 */
import type { AuditLog } from '../domain/index.js';
import { isoKST, nextId } from '../lib/util.js';
import type { RequestContext } from './context.js';

export type AuditAction = AuditLog['action'];

/** 감사 스냅샷에서 비밀 필드 마스킹(평문 영구 저장 방지). */
const SECRET_KEY = /password|secret|credential|token|password_hash/i;
function sanitize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '***' : sanitize(val);
    }
    return out;
  }
  return v;
}

export function audit(
  ctx: RequestContext,
  args: {
    entity_type: string;
    entity_id: string;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
  },
): void {
  const at = isoKST(ctx.now);
  ctx.db.audit_logs.push({
    id: nextId(ctx.db.audit_logs, 'audit'),
    tenant_id: ctx.tenant_id,
    studio_id: ctx.studio_id,
    created_at: at,
    updated_at: at,
    actor_user_id: ctx.user_id,
    actor_role: ctx.role,
    entity_type: args.entity_type,
    entity_id: args.entity_id,
    action: args.action,
    before_json: args.before === undefined ? null : sanitize(args.before),
    after_json: args.after === undefined ? null : sanitize(args.after),
    occurred_at: at,
  });
}
