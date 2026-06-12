import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getContext } from '@/server/db2.js';
import { currentStudio } from '@/biz/index.js';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Icons } from '../components/icons';

export const dynamic = 'force-dynamic';

async function loginAction() {
  'use server';
  // 데모: 인증 미연동. 실서비스는 세션 발급 후 역할별 진입.
  redirect('/dashboard');
}

export default function LoginPage() {
  const ctx = getContext();
  const studio = currentStudio(ctx);
  const ownerEmail = ctx.db.users.find((u) => u.id === ctx.user_id)?.email ?? 'owner@studio.kr';

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Icons.brand className="h-6 w-6" />
          </span>
          <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">필라헬퍼</h1>
          <p className="mt-1 text-sm text-slate-500">필라테스 경영관리 · {studio.name}</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <form action={loginAction} className="space-y-4">
            <Field label="이메일" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={ownerEmail} autoComplete="username" />
            </Field>
            <Field label="비밀번호" htmlFor="password">
              <Input id="password" name="password" type="password" defaultValue="demo1234" autoComplete="current-password" />
            </Field>
            <Button type="submit" full size="lg">
              로그인
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-400">데모 환경 — 아무 값으로 로그인됩니다.</p>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          회원이신가요?{' '}
          <Link href="/m/booking" className="font-medium text-brand-700 hover:underline">
            회원 예약 페이지
          </Link>
        </p>
      </div>
    </div>
  );
}
