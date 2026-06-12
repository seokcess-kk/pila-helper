import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import {
  ATTENDANCE_STATUS_LABEL,
  CLASS_TYPE_LABEL,
  GENDER_LABEL,
  MARKETING_SOURCE_LABEL,
  MEMBER_STATUS_LABEL,
  PASS_STATUS_LABEL,
  PASS_TXN_REASON_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
  getMember360,
  scoped,
  won,
  type Gender,
  type MarketingSource,
  type MemberStatus,
  type PassTxnReason,
} from '@/biz/index.js';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  TR,
  Tabs,
  buttonVariants,
} from '../../../components/ui';
import { Icons } from '../../../components/icons';
import { EditMemberDialog } from '../../../components/EditMemberDialog';
import { MemberNoteForm } from '../../../components/MemberNoteForm';
import { issuePassAction, refundPassAction } from '../../../actions';

export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<string, 'warning' | 'info' | 'brand'> = { personal: 'warning', group: 'info', trial: 'brand' };

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-24 shrink-0 text-sm text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{children || <span className="text-slate-300">—</span>}</dd>
    </div>
  );
}

export default function MemberDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const ctx = getContext();
  const m = getMember360(ctx, params.id);
  if (!m) notFound();
  const mem = m.member;
  const tab = searchParams.tab ?? 'profile';
  const products = ctx.db.products.filter((p) => p.is_active && p.studio_id === ctx.studio_id);
  const staffName = mem.assigned_staff_id
    ? ctx.db.staff.find((s) => s.id === mem.assigned_staff_id)?.name ?? null
    : null;

  // 수강권 차감·복구 내역(이 회원)
  const passTxns = scoped(ctx, ctx.db.pass_transactions)
    .filter((t) => t.member_id === mem.id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const sessByResv = new Map(scoped(ctx, ctx.db.reservations).map((r) => [r.id, r.class_session_id]));
  const sessByAtt = new Map(scoped(ctx, ctx.db.attendance).map((a) => [a.id, a.class_session_id]));
  const sessNameMap = new Map(scoped(ctx, ctx.db.class_sessions).map((s) => [s.id, s.name]));
  const txnClass = (t: { reservation_id?: string | null; attendance_id?: string | null }) => {
    const sid = (t.reservation_id && sessByResv.get(t.reservation_id)) || (t.attendance_id && sessByAtt.get(t.attendance_id)) || null;
    return sid ? sessNameMap.get(sid) ?? null : null;
  };

  const base = `/members/${mem.id}`;
  const tabs = [
    { value: 'profile', label: '기본정보', href: `${base}?tab=profile` },
    { value: 'reservations', label: '예약', href: `${base}?tab=reservations`, count: m.reservations.length },
    { value: 'payments', label: '결제', href: `${base}?tab=payments`, count: m.payments.length },
    { value: 'passes', label: '수강권', href: `${base}?tab=passes`, count: m.passes.length },
    { value: 'attendance', label: '출석', href: `${base}?tab=attendance`, count: m.attendance_log.length },
    { value: 'notes', label: '메모·상담', href: `${base}?tab=notes`, count: m.counseling.length },
  ];

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {mem.name}
            <Badge value={mem.member_status} label={MEMBER_STATUS_LABEL[mem.member_status]} />
          </span>
        }
        sub={`${mem.phone} · 가입 ${mem.created_at.slice(0, 10)}`}
        actions={
          <>
            <Link href="/members" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <Icons.chevronLeft className="h-4 w-4" /> 목록
            </Link>
            <EditMemberDialog
              member={{
                id: mem.id,
                name: mem.name,
                phone: mem.phone,
                gender: mem.gender,
                member_status: mem.member_status,
                marketing_source: mem.marketing_source,
                goal: mem.goal,
                medical_note: mem.medical_note,
                memo: mem.memo,
              }}
            />
          </>
        }
      />

      {/* 요약 지표 */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="출석" value={`${m.attendance.attended}회`} sub={`노쇼 ${m.attendance.no_show} · 출석률 ${m.attendance.rate}%`} />
        <Stat label="누적 결제" value={won(m.finance.total_paid)} />
        <Stat label="미수금" value={won(m.finance.receivable)} tone={m.finance.receivable > 0 ? 'warn' : 'default'} />
        <Stat label="다가오는 예약" value={`${m.upcoming.length}건`} href={`${base}?tab=reservations`} />
      </div>

      <Tabs items={tabs} active={tab} className="mb-4" />

      {tab === 'profile' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="기본 정보">
            <dl className="divide-y divide-line">
              <InfoRow label="이름">{mem.name}</InfoRow>
              <InfoRow label="연락처"><span className="tnum">{mem.phone}</span></InfoRow>
              <InfoRow label="성별">{mem.gender ? GENDER_LABEL[mem.gender as Gender] : ''}</InfoRow>
              <InfoRow label="생년월일">{mem.birth_date}</InfoRow>
              <InfoRow label="상태"><Badge value={mem.member_status} label={MEMBER_STATUS_LABEL[mem.member_status]} /></InfoRow>
              <InfoRow label="유입경로">{mem.marketing_source ? MARKETING_SOURCE_LABEL[mem.marketing_source as MarketingSource] : ''}</InfoRow>
              <InfoRow label="운동 목적">{mem.goal}</InfoRow>
              <InfoRow label="담당 강사">{staffName}</InfoRow>
            </dl>
          </Card>
          <Card title="주의사항 · 메모">
            {mem.medical_note ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-fg">
                <Icons.alert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{mem.medical_note}</span>
              </div>
            ) : null}
            {mem.memo ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{mem.memo}</p>
            ) : !mem.medical_note ? (
              <EmptyState compact icon={<Icons.pencil className="h-5 w-5" />} title="등록된 메모가 없습니다" />
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === 'reservations' ? (
        <Card bodyClassName="p-0">
          {m.reservations.length > 0 ? (
            <Table>
              <THead>
                <Th>일시</Th>
                <Th>수업</Th>
                <Th>유형</Th>
                <Th>상태</Th>
              </THead>
              <TBody>
                {m.reservations.map((r) => (
                  <TR key={r.reservation_id}>
                    <Td className="tnum text-slate-500">{r.start_at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td className="font-medium text-slate-800">{r.class_name}</Td>
                    <Td>{r.class_type ? <Badge value={r.class_type} tone={TYPE_TONE[r.class_type]} label={CLASS_TYPE_LABEL[r.class_type as keyof typeof CLASS_TYPE_LABEL]} dot /> : '-'}</Td>
                    <Td><Badge value={r.status} label={RESERVATION_STATUS_LABEL[r.status as keyof typeof RESERVATION_STATUS_LABEL]} dot /></Td>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={<Icons.calendar className="h-6 w-6" />} title="예약 이력이 없습니다" description="타임테이블에서 이 회원을 수업에 예약할 수 있습니다." action={<Link href="/timetable" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>타임테이블로</Link>} />
          )}
        </Card>
      ) : null}

      {tab === 'payments' ? (
        <Card bodyClassName="p-0" title="결제 이력" action={<span className="text-sm text-slate-500">누적 {won(m.finance.total_paid)}</span>}>
          {m.payments.length > 0 ? (
            <Table>
              <THead>
                <Th>날짜</Th>
                <Th>상품</Th>
                <Th className="text-right">금액</Th>
                <Th>수단</Th>
                <Th>상태</Th>
                <Th className="text-right">미수금</Th>
              </THead>
              <TBody>
                {m.payments.map((p) => (
                  <TR key={p.id}>
                    <Td className="tnum text-slate-500">{p.date}</Td>
                    <Td className="font-medium text-slate-800">{p.product_name}</Td>
                    <Td className="tnum text-right">{won(p.amount)}</Td>
                    <Td className="text-slate-500">{PAYMENT_METHOD_LABEL[p.method as keyof typeof PAYMENT_METHOD_LABEL]}</Td>
                    <Td><Badge value={p.status} label={PAYMENT_STATUS_LABEL[p.status as keyof typeof PAYMENT_STATUS_LABEL]} dot /></Td>
                    <Td className={`tnum text-right ${p.receivable_amount > 0 ? 'text-warning-fg' : 'text-slate-300'}`}>{p.receivable_amount > 0 ? won(p.receivable_amount) : '-'}</Td>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-4"><EmptyState icon={<Icons.card className="h-6 w-6" />} title="결제 이력이 없습니다" /></div>
          )}
        </Card>
      ) : null}

      {tab === 'passes' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="보유 수강권">
            <ul className="space-y-2">
              {m.passes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-800">{p.product_name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {p.remaining_count != null ? `${p.remaining_count}${p.total_count != null ? `/${p.total_count}` : ''}회 남음` : '무제한'} · ~{p.expire_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge value={p.pass_status} label={PASS_STATUS_LABEL[p.pass_status as keyof typeof PASS_STATUS_LABEL]} dot />
                    {p.pass_status === 'active' ? (
                      <form action={refundPassAction}>
                        <input type="hidden" name="member_id" value={mem.id} />
                        <input type="hidden" name="pass_id" value={p.id} />
                        <button className="rounded-md border border-line-strong px-2 py-1 text-xs text-slate-500 hover:bg-muted">환불</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
              {m.passes.length === 0 ? <li><EmptyState compact icon={<Icons.ticket className="h-5 w-5" />} title="보유 수강권이 없습니다" /></li> : null}
            </ul>
          </Card>
          <Card title="수강권 발급">
            <form action={issuePassAction} className="space-y-3">
              <input type="hidden" name="member_id" value={mem.id} />
              <select name="product_id" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({won(p.price_amount)})</option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <select name="payment_method" className="rounded-lg border border-line-strong bg-surface px-3 py-2">
                  <option value="card_onsite">현장카드</option>
                  <option value="transfer">계좌이체</option>
                  <option value="cash">현금</option>
                </select>
                <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" name="is_received" defaultChecked className="accent-brand-600" /> 실입금</label>
                <button className={`${buttonVariants({ variant: 'primary', size: 'sm' })} ml-auto`}>발급</button>
              </div>
            </form>
          </Card>
          </div>
          <Card title="차감 · 복구 내역" bodyClassName="p-0">
            {passTxns.length > 0 ? (
              <Table>
                <THead>
                  <Th>일시</Th>
                  <Th>사유</Th>
                  <Th>관련 수업</Th>
                  <Th className="text-right">증감</Th>
                  <Th className="text-right">잔여</Th>
                </THead>
                <TBody>
                  {passTxns.map((t) => {
                    const isDeduct = t.delta < 0;
                    return (
                      <TR key={t.id}>
                        <Td className="tnum text-slate-500">{t.created_at.slice(0, 16).replace('T', ' ')}</Td>
                        <Td><Badge tone={isDeduct ? 'warning' : 'success'} label={PASS_TXN_REASON_LABEL[t.reason as PassTxnReason]} dot /></Td>
                        <Td className="text-slate-500">{txnClass(t) ?? <span className="text-slate-300">—</span>}</Td>
                        <Td className={`tnum text-right font-semibold ${isDeduct ? 'text-danger-fg' : 'text-success-fg'}`}>{t.delta > 0 ? `+${t.delta}` : t.delta}</Td>
                        <Td className="tnum text-right text-slate-500">{t.balance_after != null ? t.balance_after : '∞'}</Td>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <div className="p-4"><EmptyState compact icon={<Icons.ticket className="h-5 w-5" />} title="차감·복구 내역이 없습니다" /></div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'attendance' ? (
        <Card bodyClassName="p-0" title="출석 이력" action={<span className="text-sm text-slate-500">출석 {m.attendance.attended} · 노쇼 {m.attendance.no_show} · 출석률 {m.attendance.rate}%</span>}>
          {m.attendance_log.length > 0 ? (
            <Table>
              <THead>
                <Th>일시</Th>
                <Th>수업</Th>
                <Th>상태</Th>
              </THead>
              <TBody>
                {m.attendance_log.map((a) => (
                  <TR key={a.id}>
                    <Td className="tnum text-slate-500">{a.checked_at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td className="font-medium text-slate-800">{a.class_name}</Td>
                    <Td><Badge value={a.status} label={ATTENDANCE_STATUS_LABEL[a.status as keyof typeof ATTENDANCE_STATUS_LABEL]} dot /></Td>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-4"><EmptyState icon={<Icons.check className="h-6 w-6" />} title="출석 이력이 없습니다" /></div>
          )}
        </Card>
      ) : null}

      {tab === 'notes' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="메모 추가">
            <MemberNoteForm memberId={mem.id} />
          </Card>
          <Card title="상담·운영 메모 이력">
            {m.counseling.length > 0 ? (
              <ul className="space-y-2.5">
                {m.counseling.map((c) => (
                  <li key={c.id} className="border-l-2 border-line pl-3">
                    <div className="text-xs text-slate-400">{c.consulted_at.slice(0, 10)}</div>
                    <div className="text-sm text-slate-700">{c.content}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Icons.headset className="h-5 w-5" />} title="상담 이력이 없습니다" />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
