/** 수업 서비스 — 세션/템플릿 생성·관리. canon §2(C) / docs/spec 14. */
import type { ClassSession, ClassTemplate, ClassType, ID } from '../domain/index.js';
import { addMinutesISO, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, scoped, touch, type RequestContext } from './context.js';

export interface CreateSessionInput {
  class_type: ClassType;
  name: string;
  instructor_staff_id?: ID | null;
  room_id?: ID | null;
  start_at: string;
  duration_minutes?: number;
  capacity: number;
  waitlist_capacity?: number;
  is_public?: boolean;
  class_template_id?: ID | null;
}

export function createSession(ctx: RequestContext, input: CreateSessionInput): ClassSession {
  assertCan(ctx.role, 'classes', 'create');
  const dur = input.duration_minutes ?? 50;
  const session: ClassSession = {
    id: nextId(ctx.db.class_sessions, 'sess'),
    ...baseFields(ctx),
    class_template_id: input.class_template_id ?? null,
    class_type: input.class_type,
    name: input.name,
    instructor_staff_id: input.instructor_staff_id ?? null,
    room_id: input.room_id ?? null,
    start_at: input.start_at,
    end_at: addMinutesISO(input.start_at, dur),
    capacity: input.capacity,
    waitlist_capacity: input.waitlist_capacity ?? 3,
    session_status: 'open',
    is_public: input.is_public ?? true,
    substitute_staff_id: null,
  };
  ctx.db.class_sessions.push(session);
  audit(ctx, { entity_type: 'class_sessions', entity_id: session.id, action: 'create', after: session });
  return session;
}

export function createTemplate(
  ctx: RequestContext,
  input: Omit<ClassTemplate, keyof import('../domain/index.js').TenantScoped>,
): ClassTemplate {
  const tpl: ClassTemplate = { id: nextId(ctx.db.class_templates, 'ctpl'), ...baseFields(ctx), ...input };
  ctx.db.class_templates.push(tpl);
  return tpl;
}

/** 강사 대체 배정 */
export function assignSubstitute(ctx: RequestContext, session_id: ID, staff_id: ID): void {
  assertCan(ctx.role, 'classes', 'update');
  const s = scoped(ctx, ctx.db.class_sessions).find((x) => x.id === session_id);
  if (!s) throw new Error('수업 없음');
  s.substitute_staff_id = staff_id;
  touch(ctx, s);
  audit(ctx, { entity_type: 'class_sessions', entity_id: session_id, action: 'update', after: { substitute_staff_id: staff_id } });
}
