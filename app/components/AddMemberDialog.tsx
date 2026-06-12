'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MARKETING_SOURCE_LABEL } from '@/biz/index.js';
import { addMemberAction } from '../actions';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Field';
import { Icons } from './icons';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? '추가 중…' : '회원 추가'}
    </Button>
  );
}

const GENDERS: Array<[string, string]> = [
  ['', '선택'],
  ['female', '여'],
  ['male', '남'],
];

/** 회원 등록 폼 모달(제어형) — 회원 목록·글로벌 ＋빠른등록 양쪽에서 재사용. */
export function MemberFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal title="회원 추가" subtitle="운영자 등록 — 연락처로 회원앱 초대가 연결됩니다" onClose={onClose}>
      <form action={addMemberAction} onSubmit={onClose} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="이름" required htmlFor="m-name">
            <Input id="m-name" name="name" required autoFocus placeholder="홍길동" />
          </Field>
          <Field label="연락처" required htmlFor="m-phone">
            <Input id="m-phone" name="phone" required placeholder="010-0000-0000" inputMode="tel" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="성별">
            <div className="flex gap-2">
              {GENDERS.map(([v, label], i) => (
                <label
                  key={v}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line-strong px-2 py-2 text-sm text-slate-600 transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-soft has-[:checked]:text-brand-700"
                >
                  <input type="radio" name="gender" value={v} defaultChecked={i === 0} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="유입경로" htmlFor="m-source">
            <Select id="m-source" name="marketing_source" defaultValue="">
              <option value="">유입경로 선택</option>
              {Object.entries(MARKETING_SOURCE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="운동 목적" htmlFor="m-goal">
          <Input id="m-goal" name="goal" placeholder="체형교정 / 다이어트 등" />
        </Field>
        <Field label="통증·주의사항 · 메모" htmlFor="m-note">
          <Textarea id="m-note" name="medical_note" rows={2} placeholder="부상 이력, 특이사항 등" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <SubmitButton />
        </div>
      </form>
    </Modal>
  );
}

/** 회원 목록 페이지의 '+ 회원 추가' 트리거 버튼 + 모달. */
export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        회원 추가
      </Button>
      <MemberFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
