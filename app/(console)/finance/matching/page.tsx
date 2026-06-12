import { getContext } from '@/server/db2.js';
import { activeExpenseCategories, assertCan, suggestPaymentMatches, unmatchedBank, unmatchedCard, won } from '@/biz/index.js';
import { Card, EmptyState, PageHeader, buttonVariants } from '../../../components/ui';
import { Icons } from '../../../components/icons';
import { classifyBankAction, classifyCardAction, matchBankAction } from '../../../actions';

export const dynamic = 'force-dynamic';

function CategorySelect({ options }: { options: Array<{ code: string; name: string }> }) {
  return (
    <select name="expense_category" aria-label="비용 카테고리" className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs">
      {options.map((o) => (
        <option key={o.code} value={o.code}>{o.name}</option>
      ))}
    </select>
  );
}

export default function MatchingPage() {
  const ctx = getContext();
  assertCan(ctx.role, 'bank', 'read');
  const cats = activeExpenseCategories(ctx).map((c) => ({ code: c.code as string, name: c.name_ko }));
  const bank = unmatchedBank(ctx);
  const cards = unmatchedCard(ctx);
  const deposits = bank.filter((t) => t.direction === 'deposit');
  const withdraws = bank.filter((t) => t.direction === 'withdraw');
  const empty = deposits.length === 0 && withdraws.length === 0 && cards.length === 0;

  return (
    <div>
      <PageHeader title="통장 · 카드 매칭" sub={`분류 대기 ${bank.length + cards.length}건`} />
      <p className="mb-4 text-sm text-slate-500">
        통장·카드 내역을 회원 결제·비용에 매칭합니다. 입금은 미수 회원과 자동 추천하고, 출금·카드는 비용으로 분류하며{' '}
        <b className="text-slate-700">한 번 분류한 거래처는 다음부터 자동 적용</b>됩니다.
      </p>

      {empty ? (
        <Card>
          <EmptyState icon={<Icons.check className="h-6 w-6" />} title="분류 대기 거래가 없습니다" description="통장·카드 내역이 모두 매칭·분류되었습니다." />
        </Card>
      ) : null}

      {/* 입금 매칭 */}
      {deposits.length > 0 ? (
        <Card title={<span className="flex items-center gap-1.5"><Icons.wallet className="h-4 w-4 text-success-fg" /> 입금 매칭 — 미수 회원 입금 ({deposits.length})</span>} className="mb-4" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {deposits.map((t) => {
              const sugg = suggestPaymentMatches(ctx, t.id);
              return (
                <li key={t.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span><b className="text-slate-800">{t.counterparty_name}</b> <span className="tnum text-xs text-slate-400">{t.txn_date}</span></span>
                    <span className="tnum font-semibold text-success-fg">+{won(t.amount)}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {sugg.map((s) => (
                      <form key={s.payment.id} action={matchBankAction} className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
                        <input type="hidden" name="bank_txn_id" value={t.id} />
                        <input type="hidden" name="payment_id" value={s.payment.id} />
                        <span className="text-xs text-slate-500">
                          추천: <b className="text-slate-700">{s.member_name}</b> 미수 {won(s.payment.receivable_amount)} · {s.reasons.join('/')} (확신 {Math.round(s.score * 100)}%)
                        </span>
                        <button className={`${buttonVariants({ variant: 'primary', size: 'sm' })} ml-auto`}>이 결제와 매칭</button>
                      </form>
                    ))}
                    {sugg.length === 0 ? <div className="text-xs text-slate-400">추천 결제 없음 — 수동 분류 필요</div> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* 출금 분류 */}
      {withdraws.length > 0 ? (
        <Card title={<span className="flex items-center gap-1.5"><Icons.building className="h-4 w-4 text-slate-400" /> 통장 출금 분류 ({withdraws.length})</span>} className="mb-4" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {withdraws.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span><b className="text-slate-800">{t.counterparty_name}</b> <span className="tnum text-xs text-slate-400">{t.txn_date}</span></span>
                <span className="tnum font-semibold text-danger-fg">{won(t.amount)}</span>
                <form action={classifyBankAction} className="ml-auto flex items-center gap-1.5">
                  <input type="hidden" name="bank_txn_id" value={t.id} />
                  <input type="hidden" name="target" value="expense" />
                  <CategorySelect options={cats} />
                  <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" name="learn" className="accent-brand-600" /> 규칙학습</label>
                  <button className={buttonVariants({ variant: 'secondary', size: 'sm' })}>비용 분류</button>
                </form>
                <form action={classifyBankAction}>
                  <input type="hidden" name="bank_txn_id" value={t.id} />
                  <input type="hidden" name="target" value="transfer" />
                  <button className={buttonVariants({ variant: 'ghost', size: 'sm' })}>이체/제외</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 카드 분류 */}
      {cards.length > 0 ? (
        <Card title={<span className="flex items-center gap-1.5"><Icons.card className="h-4 w-4 text-info-fg" /> 카드 사용내역 분류 ({cards.length})</span>} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {cards.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span><b className="text-slate-800">{c.vendor_name}</b> <span className="tnum text-xs text-slate-400">{c.used_at.slice(0, 10)}</span></span>
                <span className="tnum font-semibold text-danger-fg">{won(c.amount)}</span>
                <form action={classifyCardAction} className="ml-auto flex items-center gap-1.5">
                  <input type="hidden" name="card_expense_id" value={c.id} />
                  <CategorySelect options={cats} />
                  <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" name="learn" className="accent-brand-600" /> 규칙학습</label>
                  <button className={buttonVariants({ variant: 'secondary', size: 'sm' })}>비용 분류</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
