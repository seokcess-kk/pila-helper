import Link from 'next/link';
import { buttonVariants } from './components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="text-center">
        <div className="text-7xl font-extrabold tracking-tight text-brand-200">404</div>
        <h1 className="mt-2 text-lg font-bold text-slate-900">페이지를 찾을 수 없습니다</h1>
        <p className="mt-1 text-sm text-slate-500">주소가 바뀌었거나 삭제된 페이지일 수 있어요.</p>
        <Link href="/dashboard" className={`${buttonVariants({ variant: 'primary', size: 'lg' })} mt-6`}>
          대시보드로 가기
        </Link>
      </div>
    </div>
  );
}
