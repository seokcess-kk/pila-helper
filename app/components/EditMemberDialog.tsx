'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MARKETING_SOURCE_LABEL, MEMBER_STATUS_LABEL } from '@/biz/index.js';
import { updateMemberAction } from '../actions';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Icons } from './icons';

type EditMember = {
  id: string;
  name: string;
  phone: string;
  gender?: string;
  member_status: string;
  marketing_source?: string;
  goal?: string;
  medical_note?: string;
  memo?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      저장
    </Button>
  );
}

const GENDERS: Array<[string, string]> = [
  ['', '선택'],
  ['female', '여'],
  ['male', '남'],
];

export function EditMemberDialog({ member }: { member: EditMember }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" icon={<Icons.pencil className="h-4 w-4" />} onClick={() => setOpen(true)}>
        정보 수정
      </Button>
      {open ? (
        <Modal title="회원 정보 수정" subtitle={member.name} onClose={() => setOpen(false)}>
          <form action={updateMemberAction} onSubmit={() => setOpen(false)} className="space-y-3.5">
            <input type="hidden" name="member_id" value={member.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="이름" required htmlFor="e-name">
                <Input id="e-name" name="name" required defaultValue={member.name} />
              </Field>
              <Field label="연락처" required htmlFor="e-phone">
                <Input id="e-phone" name="phone" required defaultValue={member.phone} inputMode="tel" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="상태" htmlFor="e-status">
                <Select id="e-status" name="member_status" defaultValue={member.member_status}>
                  {Object.entries(MEMBER_STATUS_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="유입경로" htmlFor="e-source">
                <Select id="e-source" name="marketing_source" defaultValue={member.marketing_source ?? ''}>
                  <option value="">선택 안 함</option>
                  {Object.entries(MARKETING_SOURCE_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="성별">
              <div className="flex gap-2">
                {GENDERS.map(([v, label]) => (
                  <label
                    key={v}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line-strong px-2 py-2 text-sm text-slate-600 transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-soft has-[:checked]:text-brand-700"
                  >
                    <input type="radio" name="gender" value={v} defaultChecked={(member.gender ?? '') === v} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="운동 목적" htmlFor="e-goal">
              <Input id="e-goal" name="goal" defaultValue={member.goal ?? ''} />
            </Field>
            <Field label="통증·주의사항" htmlFor="e-medical">
              <Textarea id="e-medical" name="medical_note" rows={2} defaultValue={member.medical_note ?? ''} />
            </Field>
            <Field label="메모" htmlFor="e-memo">
              <Textarea id="e-memo" name="memo" rows={2} defaultValue={member.memo ?? ''} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                취소
              </Button>
              <SubmitButton />
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
