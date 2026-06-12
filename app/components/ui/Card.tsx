import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({
  title,
  children,
  className,
  bodyClassName,
  action,
  footer,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface shadow-card', className)}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title ? <h2 className="text-sm font-semibold text-slate-700">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-line px-4 py-3">{footer}</footer> : null}
    </section>
  );
}
