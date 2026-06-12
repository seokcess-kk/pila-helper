import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-surface text-slate-700 border border-line-strong hover:bg-muted',
  ghost: 'text-slate-600 hover:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger-fg shadow-sm',
  dangerGhost: 'text-danger-fg hover:bg-danger-soft',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1',
  md: 'h-9 px-3.5 text-sm gap-1.5',
  lg: 'h-11 px-5 text-sm gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none';

/** className 문자열만 필요할 때(Link·서버액션 form 버튼 등)에 사용. */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  full = false,
}: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean } = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], full && 'w-full');
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-90" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size, full }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  'aria-label': string;
}

const ICON_SIZE: Record<ButtonSize, string> = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-11 w-11' };

export function IconButton({ variant = 'ghost', size = 'md', className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={cn(BASE, VARIANT[variant], ICON_SIZE[size], 'shrink-0 p-0 text-slate-500', className)}
      {...props}
    >
      {children}
    </button>
  );
}
