import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import {
  assertCan,
  dateKST,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  receivableTotal,
  scoped,
  undepositedCardSales,
  won,
  ymOf,
} from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat, Table, TBody, Td, Th, THead, TR } from '../../components/ui';
import { Icons } from '../../components/icons';

export const dynamic = 'force-dynamic';

export default function PaymentsPage() {
  const ctx = getContext();
  assertCan(ctx.role, 'payments', 'read');
  const ym = ymOf(dateKST(ctx.now));
  const payments = scoped(ctx, ctx.db.payments);
  const productName = (purchaseId: string) => {
    const pur = scoped(ctx, ctx.db.purchases).find((x) => x.id === purchaseId);
    return pur ? scoped(ctx, ctx.db.products).find((p) => p.id === pur.product_id)?.name ?? '결제' : '결제';
  };
  const memberName = (id: string) => scoped(ctx, ctx.db.members).find((m) => m.id === id)?.name ?? '-';

  const rows = [...payments]
    .map((p) => ({ p, date: (p.paid_at ?? p.created_at).slice(0, 10) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const receivableRows = rows.filter(({ p }) => p.payment_status === 'receivable' || p.payment_status === 'partial');

  const paidThisMonth = payments.filter((p) => (p.paid_at ?? '').slice(0, 7) === ym).reduce((s, p) => s + p.paid_amount, 0);

  return (
    <div>
      <PageHeader title="결제 · 미수금" sub={`${ym.replace('-', '년 ')}월`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="이번 달 결제" value={won(paidThisMonth)} tone="pos" />
        <Stat label="미수금" value={won(receivableTotal(ctx))} tone={receivableTotal(ctx) ? 'warn' : 'default'} />
        <Stat label="미입금 카드매출" value={won(undepositedCardSales(ctx))} tone={undepositedCardSales(ctx) ? 'warn' : 'default'} href="/finance/matching" />
        <Stat label="결제 건수" value={`${payments.length}건`} />
      </div>

      {/* 미수금 큐 */}
      {receivableRows.length > 0 ? (
        <Card title={<span className="flex items-center gap-1.5"><Icons.alert className="h-4 w-4 text-warning-fg" /> 미수금 처리 대기 ({receivableRows.length})</span>} className="mb-4" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {receivableRows.map(({ p, date }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/members/${p.member_id}`} className="font-medium text-brand-700 hover:underline">{memberName(p.member_id)}</Link>
                  <span className="ml-2 text-xs text-slate-400">{productName(p.purchase_id)} · {date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tnum font-semibold text-warning-fg">미수 {won(p.receivable_amount)}</span>
                  <Link href="/finance/matching" className="rounded-md border border-line-strong px-2 py-1 text-xs text-slate-600 hover:bg-muted">입금 매칭</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 전체 결제 목록 */}
      <Card title="결제 내역" bodyClassName="p-0">
        {rows.length > 0 ? (
          <Table>
            <THead>
              <Th>날짜</Th>
              <Th>회원</Th>
              <Th>상품</Th>
              <Th className="text-right">금액</Th>
              <Th>수단</Th>
              <Th>상태</Th>
              <Th className="text-right">미수금</Th>
            </THead>
            <TBody>
              {rows.map(({ p, date }) => (
                <TR key={p.id}>
                  <Td className="tnum text-slate-500">{date}</Td>
                  <Td>
                    <Link href={`/members/${p.member_id}`} className="font-medium text-brand-700 hover:underline">{memberName(p.member_id)}</Link>
                  </Td>
                  <Td className="text-slate-700">{productName(p.purchase_id)}</Td>
                  <Td className="tnum text-right">{won(p.amount)}</Td>
                  <Td className="text-slate-500">{PAYMENT_METHOD_LABEL[p.payment_method]}</Td>
                  <Td><Badge value={p.payment_status} label={PAYMENT_STATUS_LABEL[p.payment_status]} dot /></Td>
                  <Td className={`tnum text-right ${p.receivable_amount > 0 ? 'text-warning-fg' : 'text-slate-300'}`}>{p.receivable_amount > 0 ? won(p.receivable_amount) : '-'}</Td>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <div className="p-4"><EmptyState icon={<Icons.card className="h-6 w-6" />} title="결제 내역이 없습니다" /></div>
        )}
      </Card>
    </div>
  );
}
