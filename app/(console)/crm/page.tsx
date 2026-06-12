import type { ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import {
  assertCan,
  crmStats,
  dateKST,
  leadBoard,
  LEAD_STATUS_LABEL,
  MARKETING_SOURCE_LABEL,
  type Lead,
  type LeadStatus,
} from '@/biz/index.js';
import { Card, EmptyState, EmptyRow, PageHeader, Stat, Table, TBody, Td, Th, THead, TR, buttonVariants } from '../../components/ui';
import { Icons } from '../../components/icons';
import { advanceLeadAction, convertLeadAction, createLeadAction } from '../../actions';

export const dynamic = 'force-dynamic';

const PIPELINE: LeadStatus[] = ['new_inquiry', 'contacted', 'trial_booked', 'trial_done', 'enrolled'];
const NEXT: Partial<Record<LeadStatus, LeadStatus>> = {
  new_inquiry: 'contacted',
  contacted: 'trial_booked',
  trial_booked: 'trial_done',
  trial_done: 'enrolled',
};
const COL_TONE: Record<string, string> = {
  new_inquiry: 'bg-info',
  contacted: 'bg-info',
  trial_booked: 'bg-brand-400',
  trial_done: 'bg-brand-500',
  enrolled: 'bg-success',
  on_hold: 'bg-slate-400',
  lost: 'bg-danger',
};

function MiniBtn({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'primary' | 'success' | 'muted' }) {
  const cls =
    tone === 'primary'
      ? 'bg-brand-600 text-white hover:bg-brand-700'
      : tone === 'success'
        ? 'bg-success-soft text-success-fg hover:bg-success/20'
        : tone === 'muted'
          ? 'text-slate-400 hover:bg-muted'
          : 'bg-muted text-slate-600 hover:bg-slate-200';
  return <button className={`rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${cls}`}>{children}</button>;
}

export default function CrmPage() {
  const ctx = getContext();
  assertCan(ctx.role, 'members', 'create');
  const board = leadBoard(ctx);
  const stats = crmStats(ctx);
  const today = dateKST(ctx.now);
  const elapsed = (d: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86400000));

  function LeadCard({ lead }: { lead: Lead }) {
    const days = elapsed(lead.inquiry_date);
    return (
      <div className="rounded-lg border border-line bg-surface p-2.5 shadow-sm">
        <div className="text-sm font-semibold text-slate-800">{lead.name}</div>
        <div className="mt-0.5 truncate text-xs text-slate-400">
          <span className="tnum">{lead.phone}</span> · {lead.marketing_source ? MARKETING_SOURCE_LABEL[lead.marketing_source] : '경로 미상'}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">문의 {days === 0 ? '오늘' : `${days}일 전`}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {NEXT[lead.lead_status] ? (
            <form action={advanceLeadAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="status" value={NEXT[lead.lead_status]} />
              <MiniBtn tone="primary">다음 단계 →</MiniBtn>
            </form>
          ) : null}
          {lead.lead_status === 'trial_done' ? (
            <form action={convertLeadAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <MiniBtn tone="success">회원 전환</MiniBtn>
            </form>
          ) : null}
          {lead.lead_status !== 'enrolled' && lead.lead_status !== 'on_hold' && lead.lead_status !== 'lost' ? (
            <>
              <form action={advanceLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="status" value="on_hold" />
                <MiniBtn>보류</MiniBtn>
              </form>
              <form action={advanceLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="status" value="lost" />
                <MiniBtn tone="muted">실패</MiniBtn>
              </form>
            </>
          ) : null}
          {lead.lead_status === 'on_hold' || lead.lead_status === 'lost' ? (
            <form action={advanceLeadAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="status" value="contacted" />
              <MiniBtn>재개</MiniBtn>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  const onHoldLost = [...board.on_hold, ...board.lost];

  return (
    <div>
      <PageHeader title="상담 CRM" sub={`상담 ${stats.total}건 · 체험→등록 전환율 ${stats.trial_conversion_rate}%`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="전체 상담" value={`${stats.total}건`} />
        <Stat label="체험 완료" value={`${stats.trial}명`} />
        <Stat label="등록 전환" value={`${stats.enrolled}명`} tone="pos" />
        <Stat label="체험→등록 전환율" value={`${stats.trial_conversion_rate}%`} />
      </div>

      <Card title="신규 상담 등록" className="mb-4">
        <form action={createLeadAction} className="flex flex-wrap items-end gap-2">
          <input name="name" required placeholder="이름" className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm" />
          <input name="phone" required placeholder="010-0000-0000" inputMode="tel" className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm" />
          <select name="marketing_source" className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm">
            {Object.entries(MARKETING_SOURCE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <input name="memo" placeholder="상담 메모" className="h-9 min-w-[10rem] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm" />
          <button className={buttonVariants({ variant: 'primary', size: 'md' })}>등록</button>
        </form>
      </Card>

      {/* 칸반 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE.map((status) => (
          <div key={status} className="rounded-card border border-line bg-muted/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${COL_TONE[status]}`} />
                {LEAD_STATUS_LABEL[status]}
              </span>
              <span className="rounded-full bg-surface px-1.5 text-slate-500">{board[status].length}</span>
            </div>
            <div className="space-y-1.5">
              {board[status].map((l) => (
                <LeadCard key={l.id} lead={l} />
              ))}
              {board[status].length === 0 ? <div className="px-1 py-4 text-center text-xs text-slate-300">없음</div> : null}
            </div>
          </div>
        ))}
      </div>

      {/* 보류 · 실패 */}
      {onHoldLost.length > 0 ? (
        <Card title="보류 · 실패" className="mt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {onHoldLost.map((l) => (
              <LeadCard key={l.id} lead={l} />
            ))}
          </div>
        </Card>
      ) : null}

      {/* 유입경로 전환 */}
      <Card title="유입경로별 전환" className="mt-4" bodyClassName="p-0">
        <Table>
          <THead>
            <Th>유입경로</Th>
            <Th className="text-right">상담</Th>
            <Th className="text-right">등록</Th>
            <Th className="text-right">전환율</Th>
          </THead>
          <TBody>
            {stats.by_source.map((s) => (
              <TR key={s.source}>
                <Td className="font-medium text-slate-700">{s.label}</Td>
                <Td className="tnum text-right">{s.count}</Td>
                <Td className="tnum text-right">{s.enrolled}</Td>
                <Td className="tnum text-right">{s.rate}%</Td>
              </TR>
            ))}
            {stats.by_source.length === 0 ? <EmptyRow colSpan={4}><EmptyState compact icon={<Icons.chart className="h-5 w-5" />} title="유입경로 데이터가 없습니다" /></EmptyRow> : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
