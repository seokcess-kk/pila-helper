import Link from 'next/link';
import { Card, EmptyState, buttonVariants } from '../components/ui';
import { Icons } from '../components/icons';

export default function ConsoleNotFound() {
  return (
    <div className="mx-auto mt-12 max-w-md">
      <Card>
        <EmptyState
          icon={<Icons.search className="h-6 w-6" />}
          title="페이지를 찾을 수 없습니다"
          description="요청하신 회원·수업·페이지가 존재하지 않거나 삭제되었을 수 있어요."
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              대시보드로 이동
            </Link>
          }
        />
      </Card>
    </div>
  );
}
