import Link from 'next/link';

/** 결제기준 ↔ 소진기준 토글 (canon §4). 쿼리파라미터 basis 로 전환. */
export function BasisToggle({ basis, path }: { basis: 'payment' | 'consumption'; path: string }) {
  const opts: Array<['payment' | 'consumption', string]> = [
    ['payment', '결제기준'],
    ['consumption', '소진기준'],
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-xs">
      {opts.map(([v, label]) => (
        <Link
          key={v}
          href={`${path}?basis=${v}`}
          className={`px-3 py-1.5 ${basis === v ? 'bg-brand text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
