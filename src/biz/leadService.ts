/** 상담 CRM 서비스 — 리드 파이프라인/상담로그/전환율. canon §2(B) / docs/spec 03·10. */
import type { CounselingLog, ID, Lead, LeadStatus, MarketingSource } from '../domain/index.js';
import { MARKETING_SOURCE_LABEL } from '../domain/index.js';
import { dateKST, isoKST, nextId } from '../lib/util.js';
import { audit } from './audit.js';
import { assertCan } from './authz.js';
import { baseFields, scoped, touch, type RequestContext } from './context.js';
import { createMember } from './memberService.js';

export interface CreateLeadInput {
  name: string;
  phone: string;
  marketing_source?: MarketingSource;
  assigned_staff_id?: ID | null;
  memo?: string;
}

export function createLead(ctx: RequestContext, input: CreateLeadInput): Lead {
  assertCan(ctx.role, 'members', 'create');
  const lead: Lead = {
    id: nextId(ctx.db.leads, 'lead'),
    ...baseFields(ctx),
    member_id: null,
    name: input.name,
    phone: input.phone,
    lead_status: 'new_inquiry',
    marketing_source: input.marketing_source,
    inquiry_date: dateKST(ctx.now),
    assigned_staff_id: input.assigned_staff_id ?? null,
  };
  ctx.db.leads.push(lead);
  if (input.memo) addCounselingLog(ctx, { lead_id: lead.id, channel: 'message', content: input.memo });
  audit(ctx, { entity_type: 'leads', entity_id: lead.id, action: 'create', after: lead });
  return lead;
}

/** 상담 단계 진행 — 단계별 날짜 자동 기록 */
export function advanceLead(ctx: RequestContext, lead_id: ID, status: LeadStatus, opts: { lost_reason?: string } = {}): Lead {
  assertCan(ctx.role, 'members', 'update');
  const lead = scoped(ctx, ctx.db.leads).find((l) => l.id === lead_id);
  if (!lead) throw new Error('리드 없음');
  const before = { ...lead };
  lead.lead_status = status;
  const today = dateKST(ctx.now);
  if (status === 'trial_booked') lead.trial_booked_date = today;
  if (status === 'trial_done') lead.trial_done_date = today;
  if (status === 'enrolled') lead.enrolled_date = today;
  if (status === 'lost') lead.lost_reason = opts.lost_reason;
  touch(ctx, lead);
  audit(ctx, { entity_type: 'leads', entity_id: lead_id, action: 'update', before, after: lead });
  return lead;
}

/** 리드 → 회원 전환(회원 생성/연결 + 상태 등록완료) */
export function convertLead(ctx: RequestContext, lead_id: ID): { lead: Lead; member_id: ID } {
  const lead = scoped(ctx, ctx.db.leads).find((l) => l.id === lead_id);
  if (!lead) throw new Error('리드 없음');
  let member = scoped(ctx, ctx.db.members).find((m) => m.phone === lead.phone);
  if (!member) {
    member = createMember(ctx, {
      name: lead.name,
      phone: lead.phone,
      marketing_source: lead.marketing_source,
      member_status: 'trial_done',
      assigned_staff_id: lead.assigned_staff_id,
    });
  }
  lead.member_id = member.id;
  advanceLead(ctx, lead_id, 'enrolled');
  return { lead, member_id: member.id };
}

export function addCounselingLog(
  ctx: RequestContext,
  input: { lead_id?: ID | null; member_id?: ID | null; channel: CounselingLog['channel']; content: string; next_action_at?: string | null },
): CounselingLog {
  assertCan(ctx.role, 'members', 'update');
  const log: CounselingLog = {
    id: nextId(ctx.db.counseling_logs, 'cl'),
    ...baseFields(ctx),
    lead_id: input.lead_id ?? null,
    member_id: input.member_id ?? null,
    staff_id: ctx.user_id,
    channel: input.channel,
    content: input.content,
    consulted_at: isoKST(ctx.now),
    next_action_at: input.next_action_at ?? null,
  };
  ctx.db.counseling_logs.push(log);
  return log;
}

export interface LeadFilter {
  status?: LeadStatus;
  source?: MarketingSource;
}

export function listLeads(ctx: RequestContext, filter: LeadFilter = {}): Lead[] {
  return scoped(ctx, ctx.db.leads)
    .filter((l) => (!filter.status || l.lead_status === filter.status) && (!filter.source || l.marketing_source === filter.source))
    .sort((a, b) => (a.inquiry_date < b.inquiry_date ? 1 : -1));
}

/** 칸반: 상태별 그룹 */
export const LEAD_PIPELINE: LeadStatus[] = ['new_inquiry', 'contacted', 'trial_booked', 'trial_done', 'enrolled', 'on_hold', 'lost'];

export function leadBoard(ctx: RequestContext): Record<LeadStatus, Lead[]> {
  const board = {} as Record<LeadStatus, Lead[]>;
  for (const s of LEAD_PIPELINE) board[s] = [];
  for (const l of scoped(ctx, ctx.db.leads)) board[l.lead_status].push(l);
  return board;
}

export interface CrmStats {
  total: number;
  trial: number;
  enrolled: number;
  trial_conversion_rate: number; // 체험 → 등록
  by_source: Array<{ source: MarketingSource; label: string; count: number; enrolled: number; rate: number }>;
}

export function crmStats(ctx: RequestContext): CrmStats {
  const leads = scoped(ctx, ctx.db.leads);
  const trialDone = leads.filter((l) => l.trial_done_date).length;
  const enrolled = leads.filter((l) => l.lead_status === 'enrolled').length;
  // 체험전환율 분자: 체험완료(trial_done) 선행 후 등록한 건만 (canon/19 §7.2)
  const enrolledFromTrial = leads.filter((l) => l.trial_done_date && l.lead_status === 'enrolled').length;
  const sources = [...new Set(leads.map((l) => l.marketing_source).filter(Boolean))] as MarketingSource[];
  const by_source = sources.map((src) => {
    const group = leads.filter((l) => l.marketing_source === src);
    const enr = group.filter((l) => l.lead_status === 'enrolled').length;
    return {
      source: src,
      label: MARKETING_SOURCE_LABEL[src],
      count: group.length,
      enrolled: enr,
      rate: group.length ? Math.round((enr / group.length) * 100) : 0,
    };
  });
  return {
    total: leads.length,
    trial: trialDone,
    enrolled,
    trial_conversion_rate: trialDone ? Math.round((enrolledFromTrial / trialDone) * 100) : 0,
    by_source,
  };
}
