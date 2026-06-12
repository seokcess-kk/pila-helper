'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MEMBER_STATUS_LABEL, type MemberStatus } from '@/biz/index.js';
import { SearchInput, Select } from '../ui/Field';
import { cn } from '../ui/cn';

const STATUS_CHIPS: MemberStatus[] = ['enrolled', 're_enrolled', 'trial_done', 'new_inquiry', 'dormant', 'expired'];

export function MemberFilters({ q, status, sort }: { q: string; status: string; sort: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    router.push(`/members?${next.toString()}`);
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: text });
          }}
          className="min-w-0 flex-1 sm:max-w-xs"
        >
          <SearchInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="이름·연락처 검색"
            aria-label="이름·연락처 검색"
          />
        </form>
        <Select
          aria-label="정렬"
          value={sort}
          onChange={(e) => setParam({ sort: e.target.value })}
          className="h-9 w-36"
        >
          <option value="name">이름순</option>
          <option value="recent">최근 방문순</option>
          <option value="receivable">미수금순</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setParam({ status: '' })}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            !status ? 'bg-brand-600 text-white' : 'bg-muted text-slate-600 hover:bg-slate-200',
          )}
        >
          전체
        </button>
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParam({ status: s })}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              status === s ? 'bg-brand-600 text-white' : 'bg-muted text-slate-600 hover:bg-slate-200',
            )}
          >
            {MEMBER_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
