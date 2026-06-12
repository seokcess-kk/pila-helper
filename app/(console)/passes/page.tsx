import Link from 'next/link';
import { getContext } from '@/server/db2.js';
import {
  assertCan,
  CLASS_TYPE_LABEL,
  PASS_KIND_LABEL,
  PASS_STATUS_LABEL,
  PASS_TXN_REASON_LABEL,
  scoped,
  won,
  type ClassType,
  type PassTxnReason,
} from '@/biz/index.js';
import { Badge, Card, EmptyState, PageHeader, Stat, Table, TBody, Td, Th, THead, TR, Tabs, SegmentedNav } from '../../components/ui';
import { Icons } from '../../components/icons';

export const dynamic = 'force-dynamic';

export default function PassesPage({ searchParams }: { searchParams: { tab?: string; f?: string } }) {
  const ctx = getContext();
  assertCan(ctx.role, 'passes', 'create'); // 메뉴 클로킹 일치(조회전용 역할 차단)
  const tab = searchParams.tab ?? 'catalog';
  const filter = searchParams.f ?? 'all'; // all | deduct | restore
  const products = scoped(ctx, ctx.db.products).sort((a, b) => (a.is_active === b.is_active ? a.price_amount - b.price_amount : a.is_active ? -1 : 1));
  const passes = scoped(ctx, ctx.db.passes);
  const memberName = (id: string) => scoped(ctx, ctx.db.members).find((m) => m.id === id)?.name ?? '-';
  const productByPass = (passId: string) => {
    const pass = passes.find((p) => p.id === passId);
    return pass ? scoped(ctx, ctx.db.products).find((x) => x.id === pass.product_id)?.name ?? '수강권' : '수강권';
  };

  // 차감 원장 — 연결된 수업명 해석용 룩업
  const sessName = new Map(scoped(ctx, ctx.db.class_sessions).map((s) => [s.id, s.name]));
  const resvSession = new Map(scoped(ctx, ctx.db.reservations).map((r) => [r.id, r.class_session_id]));
  const attSession = new Map(scoped(ctx, ctx.db.attendance).map((a) => [a.id, a.class_session_id]));
  const linkedClass = (t: { reservation_id?: string | null; attendance_id?: string | null }) => {
    const sid = (t.reservation_id && resvSession.get(t.reservation_id)) || (t.attendance_id && attSession.get(t.attendance_id)) || null;
    return sid ? sessName.get(sid) ?? null : null;
  };

  const ledgerAll = [...scoped(ctx, ctx.db.pass_transactions)].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const ledger = ledgerAll.filter((t) => (filter === 'deduct' ? t.delta < 0 : filter === 'restore' ? t.delta > 0 : true));

  const order: Record<string, number> = { active: 0, paused: 1, expired: 2, used_up: 3, refunded: 4 };
  const issued = [...passes].sort((a, b) => (order[a.pass_status] ?? 9) - (order[b.pass_status] ?? 9) || (a.expire_date < b.expire_date ? -1 : 1));

  const today = ctx.now.toISOString().slice(0, 10);
  const summary = {
    products: products.filter((p) => p.is_active).length,
    active: passes.filter((p) => p.pass_status === 'active').length,
    expiring: passes.filter((p) => p.pass_status === 'active' && (Date.parse(p.expire_date) - Date.parse(today)) / 86400000 <= 7 && Date.parse(p.expire_date) >= Date.parse(today)).length,
    used_up: passes.filter((p) => p.pass_status === 'used_up' || p.pass_status === 'expired').length,
  };

  const tabs = [
    { value: 'catalog', label: '상품 카탈로그', href: '/passes?tab=catalog', count: products.length },
    { value: 'issued', label: '발급 현황', href: '/passes?tab=issued', count: passes.length },
    { value: 'ledger', label: '차감 원장', href: '/passes?tab=ledger', count: ledgerAll.length },
  ];

  return (
    <div>
      <PageHeader title="수강권 · 상품" sub="상품 카탈로그 · 발급 현황 · 차감 원장" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="판매 상품" value={`${summary.products}개`} />
        <Stat label="사용중 수강권" value={`${summary.active}개`} tone="pos" />
        <Stat label="만료 임박(7일)" value={`${summary.expiring}개`} tone={summary.expiring ? 'warn' : 'default'} />
        <Stat label="만료·소진" value={`${summary.used_up}개`} />
      </div>

      <Tabs items={tabs} active={tab} className="mb-4" />

      {tab === 'catalog' ? (
        <Card bodyClassName="p-0">
          <Table>
            <THead>
              <Th>상품명</Th>
              <Th>종류</Th>
              <Th className="text-right">횟수</Th>
              <Th className="text-right">유효기간</Th>
              <Th>이용 가능 수업</Th>
              <Th className="text-right">가격</Th>
              <Th>상태</Th>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR key={p.id}>
                  <Td className="font-medium text-slate-800">{p.name}</Td>
                  <Td><Badge value={p.pass_kind} label={PASS_KIND_LABEL[p.pass_kind]} /></Td>
                  <Td className="tnum text-right">{p.total_count != null ? `${p.total_count}회` : '무제한'}</Td>
                  <Td className="tnum text-right text-slate-500">{p.valid_days != null ? `${p.valid_days}일` : '-'}</Td>
                  <Td className="text-xs text-slate-500">{p.allowed_class_types.map((t) => CLASS_TYPE_LABEL[t as ClassType]).join(', ')}</Td>
                  <Td className="tnum text-right font-medium">{won(p.price_amount)}</Td>
                  <Td>{p.is_active ? <Badge tone="success" label="판매중" dot /> : <Badge tone="muted" label="중지" />}</Td>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      {tab === 'issued' ? (
        <Card bodyClassName="p-0">
          {issued.length > 0 ? (
            <Table>
              <THead>
                <Th>회원</Th>
                <Th>상품</Th>
                <Th className="text-right">잔여</Th>
                <Th className="text-right">만료일</Th>
                <Th>상태</Th>
              </THead>
              <TBody>
                {issued.map((p) => (
                  <TR key={p.id}>
                    <Td><Link href={`/members/${p.member_id}`} className="font-medium text-brand-700 hover:underline">{memberName(p.member_id)}</Link></Td>
                    <Td className="text-slate-700">{productByPass(p.id)}</Td>
                    <Td className="tnum text-right">{p.remaining_count != null ? `${p.remaining_count}${p.total_count != null ? `/${p.total_count}` : ''}` : '무제한'}</Td>
                    <Td className="tnum text-right text-slate-500">{p.expire_date}</Td>
                    <Td><Badge value={p.pass_status} label={PASS_STATUS_LABEL[p.pass_status]} dot /></Td>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="p-4"><EmptyState icon={<Icons.ticket className="h-6 w-6" />} title="발급된 수강권이 없습니다" /></div>
          )}
        </Card>
      ) : null}

      {tab === 'ledger' ? (
        <Card
          bodyClassName="p-0"
          title="차감 · 복구 원장"
          action={
            <SegmentedNav
              size="sm"
              current={filter}
              hrefFor={(v) => `/passes?tab=ledger${v === 'all' ? '' : `&f=${v}`}`}
              options={[
                { value: 'all', label: '전체' },
                { value: 'deduct', label: '차감' },
                { value: 'restore', label: '복구' },
              ]}
            />
          }
        >
          {ledger.length > 0 ? (
            <Table>
              <THead>
                <Th>일시</Th>
                <Th>회원</Th>
                <Th>수강권</Th>
                <Th>사유</Th>
                <Th>관련 수업</Th>
                <Th className="text-right">증감</Th>
                <Th className="text-right">잔여</Th>
              </THead>
              <TBody>
                {ledger.map((t) => {
                  const isDeduct = t.delta < 0;
                  return (
                    <TR key={t.id}>
                      <Td className="tnum text-slate-500">{t.created_at.slice(0, 16).replace('T', ' ')}</Td>
                      <Td><Link href={`/members/${t.member_id}`} className="font-medium text-brand-700 hover:underline">{memberName(t.member_id)}</Link></Td>
                      <Td className="text-slate-700">{productByPass(t.pass_id)}</Td>
                      <Td><Badge tone={isDeduct ? 'warning' : 'success'} label={PASS_TXN_REASON_LABEL[t.reason as PassTxnReason]} dot /></Td>
                      <Td className="text-slate-500">{linkedClass(t) ?? <span className="text-slate-300">—</span>}</Td>
                      <Td className={`tnum text-right font-semibold ${isDeduct ? 'text-danger-fg' : 'text-success-fg'}`}>{t.delta > 0 ? `+${t.delta}` : t.delta}</Td>
                      <Td className="tnum text-right text-slate-500">{t.balance_after != null ? t.balance_after : '∞'}</Td>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <div className="p-4"><EmptyState icon={<Icons.ticket className="h-6 w-6" />} title="차감·복구 내역이 없습니다" description="예약 차감·출석 차감·취소 복구가 발생하면 여기에 기록됩니다." /></div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
