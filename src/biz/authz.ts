/**
 * RBAC 권한 엔진 — canon §5 매트릭스. 상세: docs/spec/13-rbac.md.
 * can(role, resource, action) 으로 접근 판정. 스코프(all/assigned/own)는 서비스가 추가 적용.
 */
import type { Role } from '../domain/index.js';

export type Resource =
  | 'studio'
  | 'users'
  | 'members'
  | 'classes'
  | 'reservations'
  | 'passes'
  | 'payments'
  | 'revenue'
  | 'expenses'
  | 'bank'
  | 'bank_balance'
  | 'comments'
  | 'notifications'
  | 'audit'
  | 'saas';

export type Action = 'read' | 'create' | 'update' | 'delete' | 'export';

const ALL: Action[] = ['read', 'create', 'update', 'delete', 'export'];
const R: Action[] = ['read'];
const CRU: Action[] = ['create', 'read', 'update'];
const CR: Action[] = ['create', 'read'];
const RU: Action[] = ['read', 'update'];

type Matrix = Record<Role, Partial<Record<Resource, Action[]>>>;

/** canon §5 매트릭스(셀의 스코프 한정은 서비스에서 적용). owner/saas_admin은 전권. */
const MATRIX: Matrix = {
  saas_admin: {
    studio: ALL, users: ALL, members: R, classes: R, reservations: R, passes: R,
    payments: R, revenue: R, expenses: R, bank: R, bank_balance: R, comments: R,
    notifications: R, audit: R, saas: ALL,
  },
  owner: {
    studio: RU, users: ALL, members: ALL, classes: ALL, reservations: ALL, passes: ALL,
    payments: ALL, revenue: R, expenses: ALL, bank: RU, bank_balance: R, comments: ALL,
    notifications: ALL, audit: R, saas: R,
  },
  manager: {
    studio: R, users: R, members: ALL, classes: ALL, reservations: ALL, passes: ALL,
    payments: CRU, revenue: R, comments: R, notifications: CRU,
  },
  info_staff: {
    members: ALL, classes: ALL, reservations: ALL, passes: CR, payments: CR,
    comments: R, notifications: CRU,
  },
  instructor: {
    members: R, classes: RU, reservations: RU, passes: R, revenue: R, comments: ALL,
  },
  accountant: {
    members: R, classes: R, reservations: R, passes: R, payments: R, revenue: ALL,
    expenses: ALL, bank: ALL, bank_balance: R, audit: R,
  },
  member: {
    // 회원은 본인 예약을 직접 생성·취소(MVP 모바일웹 셀프예약). 스코프(own)는 서비스에서 강제.
    members: R, classes: R, reservations: ['create', 'read', 'update'], passes: R, payments: R, comments: R, notifications: R,
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

export class ForbiddenError extends Error {
  constructor(role: Role, resource: Resource, action: Action) {
    super(`권한 없음: ${role} 는 ${resource} 에 ${action} 불가`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(role: Role, resource: Resource, action: Action): void {
  if (!can(role, resource, action)) throw new ForbiddenError(role, resource, action);
}
