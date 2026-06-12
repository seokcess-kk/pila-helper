import { Skeleton } from '../../components/ui';

export default function MemberLoading() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-12 shrink-0 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
