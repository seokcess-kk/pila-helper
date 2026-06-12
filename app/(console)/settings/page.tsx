import type { ReactNode } from 'react';
import { getContext } from '@/server/db2.js';
import { assertCan, COST_TYPE_LABEL, currentStudio, ROLE_LABEL, scoped, type CostType, type Role } from '@/biz/index.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  Tabs,
} from '../../components/ui';
import { Icons } from '../../components/icons';
import {
  createRoomAction,
  deleteRoomAction,
  inviteUserAction,
  removeUserAction,
  updateExpenseCategoryAction,
  updateRoomAction,
  updateStudioAction,
  updateStudioPolicyAction,
  updateUserAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

function NumRow({ name, label, value, suffix, placeholder }: { name: string; label: string; value: number | null; suffix?: string; placeholder?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          name={name}
          type="number"
          defaultValue={value ?? ''}
          placeholder={placeholder}
          className="h-8 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right text-sm tabular-nums"
        />
        {suffix ? <span className="text-xs text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

function ToggleRow({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 accent-brand-600" />
    </label>
  );
}

function SelectRow({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <select name={name} defaultValue={value} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function SaveBar() {
  return (
    <div className="mt-2 flex justify-end border-t border-line pt-2.5">
      <Button type="submit" size="sm">저장</Button>
    </div>
  );
}

export default function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const ctx = getContext();
  assertCan(ctx.role, 'studio', 'read');
  const tab = searchParams.tab ?? 'studio';
  const studio = currentStudio(ctx);
  const pol = studio.policy_json;
  const users = ctx.db.users.filter((u) => u.tenant_id === ctx.tenant_id && !u.deleted_at);
  const rooms = scoped(ctx, ctx.db.rooms);
  const categories = scoped(ctx, ctx.db.expense_categories).sort((a, b) => a.sort_order - b.sort_order);
  const ASSIGNABLE_ROLES: Role[] = ['owner', 'manager', 'info_staff', 'instructor', 'accountant'];

  const tabs = [
    { value: 'studio', label: '스튜디오', href: '/settings?tab=studio' },
    { value: 'policy', label: '운영 정책', href: '/settings?tab=policy' },
    { value: 'users', label: '사용자·권한', href: '/settings?tab=users', count: users.length },
    { value: 'rooms', label: '룸', href: '/settings?tab=rooms', count: rooms.length },
    { value: 'categories', label: '비용 카테고리', href: '/settings?tab=categories', count: categories.length },
  ];

  return (
    <div>
      <PageHeader title="설정" sub="스튜디오 · 운영 정책 · 사용자/권한 · 룸 · 비용 카테고리" />
      <Tabs items={tabs} active={tab} className="mb-4" />

      {tab === 'studio' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="스튜디오 정보">
            <form action={updateStudioAction} className="space-y-3">
              <Field label="스튜디오명" required htmlFor="st-name"><Input id="st-name" name="name" defaultValue={studio.name} required /></Field>
              <Field label="주소" htmlFor="st-addr"><Input id="st-addr" name="address" defaultValue={studio.address ?? ''} placeholder="서울시 ..." /></Field>
              <Field label="연락처" htmlFor="st-phone"><Input id="st-phone" name="phone" defaultValue={studio.phone ?? ''} inputMode="tel" placeholder="02-000-0000" /></Field>
              <Field label="시간대" htmlFor="st-tz"><Input id="st-tz" name="timezone" defaultValue={studio.timezone} /></Field>
              <div className="flex justify-end"><Button type="submit">저장</Button></div>
            </form>
          </Card>
          <Card title="안내">
            <p className="text-sm text-slate-500">스튜디오 기본 정보를 수정합니다. 다지점·요금제 설정은 후속 단계에서 제공됩니다.</p>
          </Card>
        </div>
      ) : null}

      {tab === 'policy' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="예약 정책">
            <form action={updateStudioPolicyAction}>
              <input type="hidden" name="section" value="booking" />
              <div className="divide-y divide-line">
                <NumRow name="booking_open_days" label="예약 오픈" value={pol.booking.booking_open_days} suffix="일 전" />
                <NumRow name="booking_close_minutes" label="예약 마감" value={pol.booking.booking_close_minutes} suffix="분 전" />
                <NumRow name="cancel_deadline_minutes" label="취소 마감(무차감)" value={pol.booking.cancel_deadline_minutes} suffix="분 전" />
                <NumRow name="daily_booking_limit" label="1일 예약 한도" value={pol.booking.daily_booking_limit} suffix="회" placeholder="무제한" />
                <SelectRow name="deduct_timing" label="차감 시점" value={pol.booking.deduct_timing} options={[['on_attend', '출석 시'], ['on_booking', '예약 시']]} />
                <ToggleRow name="no_show_deduct" label="노쇼 차감" checked={pol.booking.no_show_deduct} />
                <ToggleRow name="late_cancel_deduct" label="지각취소 차감" checked={pol.booking.late_cancel_deduct} />
                <ToggleRow name="waitlist_auto_promote" label="대기 자동확정" checked={pol.booking.waitlist_auto_promote} />
              </div>
              <SaveBar />
            </form>
          </Card>

          <div className="space-y-4">
            <Card title="수강권 정책">
              <form action={updateStudioPolicyAction}>
                <input type="hidden" name="section" value="pass" />
                <div className="divide-y divide-line">
                  <NumRow name="expiring_alert_days" label="만료 임박 알림" value={pol.pass.expiring_alert_days} suffix="일 전" />
                  <NumRow name="low_count_threshold" label="잔여 부족 알림" value={pol.pass.low_count_threshold} suffix="회 이하" />
                  <ToggleRow name="holdable" label="정지(홀딩) 가능" checked={pol.pass.holdable} />
                  <NumRow name="max_hold_days" label="최대 정지 일수" value={pol.pass.max_hold_days} suffix="일" />
                  <ToggleRow name="extend_allowed" label="연장 허용" checked={pol.pass.extend_allowed} />
                </div>
                <SaveBar />
              </form>
            </Card>
            <Card title="결제·환불 정책">
              <form action={updateStudioPolicyAction}>
                <input type="hidden" name="section" value="finance" />
                <div className="divide-y divide-line">
                  <SelectRow name="revenue_recognition" label="매출 인식" value={pol.finance.revenue_recognition} options={[['on_paid', '결제 시'], ['on_deposit', '입금 시']]} />
                  <ToggleRow name="allow_receivable" label="미수(외상) 허용" checked={pol.finance.allow_receivable} />
                  <NumRow name="refund_penalty_rate" label="환불 위약 공제" value={Math.round(pol.finance.refund_penalty_rate * 100)} suffix="%" />
                  <NumRow name="card_fee_rate" label="카드 수수료(추정)" value={Math.round(pol.finance.card_fee_rate * 1000) / 10} suffix="%" />
                </div>
                <SaveBar />
              </form>
            </Card>
            <Card title="알림 정책">
              <form action={updateStudioPolicyAction}>
                <input type="hidden" name="section" value="notification" />
                <div className="divide-y divide-line">
                  <NumRow name="reminder_before_minutes" label="예약 리마인드" value={pol.notification.reminder_before_minutes} suffix="분 전" />
                  <NumRow name="long_absence_days" label="장기 미방문 기준" value={pol.notification.long_absence_days} suffix="일" />
                  <SelectRow name="default_channel" label="기본 채널" value={pol.notification.default_channel} options={[['sms', 'SMS'], ['kakao', '카카오톡'], ['push', '푸시'], ['email', '이메일']]} />
                </div>
                <SaveBar />
              </form>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'users' ? (
        <div className="space-y-3">
          <Card title="사용자 초대">
            <form action={inviteUserAction} className="flex flex-wrap items-end gap-2">
              <Field label="이메일" required><Input name="email" type="email" required placeholder="staff@studio.kr" className="w-60" /></Field>
              <Field label="역할">
                <Select name="role" defaultValue="manager" className="w-32">
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </Field>
              <Button type="submit" icon={<Icons.plus className="h-4 w-4" />}>초대</Button>
            </form>
            <p className="mt-2 text-xs text-slate-400">데모: 초대 시 ‘초대됨’ 상태로 추가됩니다(실서비스는 초대 메일 발송 → 비밀번호 설정).</p>
          </Card>

          <Card title="사용자 목록" bodyClassName="p-0">
            <div className="divide-y divide-line">
              {users.map((u) => {
                const self = u.id === ctx.user_id;
                return (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-[12rem] flex-1">
                      <span className="text-sm font-medium text-slate-800">{u.email}</span>
                      {self ? <Badge tone="brand" label="나" className="ml-1.5" /> : null}
                      {u.status === 'invited' ? <Badge tone="info" label="초대됨" className="ml-1.5" /> : null}
                      {u.status === 'suspended' ? <Badge tone="muted" label="정지" className="ml-1.5" /> : null}
                    </div>
                    <form action={updateUserAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <Select name="role" defaultValue={u.role} className="w-28" aria-label="역할">
                        {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </Select>
                      <Select name="status" defaultValue={u.status} className="w-24" aria-label="상태">
                        <option value="active">활성</option>
                        <option value="invited">초대됨</option>
                        <option value="suspended">정지</option>
                      </Select>
                      <Button type="submit" variant="secondary" size="sm">저장</Button>
                    </form>
                    {!self ? (
                      <form action={removeUserAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <IconButton aria-label="사용자 제거" type="submit" className="hover:bg-danger-soft hover:text-danger-fg">
                          <Icons.trash className="h-4 w-4" />
                        </IconButton>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'rooms' ? (
        <div className="space-y-3">
          <Card title="룸 추가">
            <form action={createRoomAction} className="flex flex-wrap items-end gap-2">
              <Field label="룸 이름" required><Input name="name" required placeholder="A룸" className="w-40" /></Field>
              <Field label="정원"><Input name="capacity" type="number" defaultValue={6} className="w-24" /></Field>
              <Button type="submit" icon={<Icons.plus className="h-4 w-4" />}>추가</Button>
            </form>
          </Card>
          <Card title="룸 목록" bodyClassName="p-0">
            {rooms.length > 0 ? (
              <div className="divide-y divide-line">
                {rooms.map((rm) => (
                  <div key={rm.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <form action={updateRoomAction} className="flex flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="room_id" value={rm.id} />
                      <Input name="name" defaultValue={rm.name} className="w-36" aria-label="룸 이름" />
                      <Input name="capacity" type="number" defaultValue={rm.capacity} className="w-20" aria-label="정원" />
                      <Select name="status" defaultValue={rm.status} className="w-28" aria-label="상태">
                        <option value="active">사용중</option>
                        <option value="inactive">미사용</option>
                      </Select>
                      <Button type="submit" variant="secondary" size="sm">저장</Button>
                    </form>
                    <form action={deleteRoomAction}>
                      <input type="hidden" name="room_id" value={rm.id} />
                      <IconButton aria-label="룸 삭제" type="submit" className="hover:bg-danger-soft hover:text-danger-fg">
                        <Icons.trash className="h-4 w-4" />
                      </IconButton>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4"><EmptyState icon={<Icons.pin className="h-6 w-6" />} title="등록된 룸이 없습니다" description="위에서 첫 룸을 추가하세요." /></div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'categories' ? (
        <Card title="비용 카테고리" bodyClassName="p-0" action={<span className="text-xs text-slate-400">비활성 카테고리는 비용 입력·거래 분류 폼에서 숨겨집니다</span>}>
          <div className="divide-y divide-line">
            {categories.map((c) => (
              <form key={c.id} action={updateExpenseCategoryAction} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <input type="hidden" name="category_id" value={c.id} />
                <div className="min-w-[10rem] flex-1">
                  <Input name="name_ko" defaultValue={c.name_ko} aria-label="카테고리명" />
                </div>
                <div className="w-28">
                  <Select name="default_cost_type" defaultValue={c.default_cost_type} aria-label="기본 성격">
                    <option value="fixed">{COST_TYPE_LABEL['fixed' as CostType]}</option>
                    <option value="variable">{COST_TYPE_LABEL['variable' as CostType]}</option>
                  </Select>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" name="is_active" defaultChecked={c.is_active} className="h-4 w-4 accent-brand-600" /> 사용
                </label>
                <Button type="submit" variant="secondary" size="sm">저장</Button>
              </form>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
