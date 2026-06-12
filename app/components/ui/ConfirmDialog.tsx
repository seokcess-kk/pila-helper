'use client';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../Modal';
import { Button, buttonVariants } from './Button';
import type { ButtonVariant, ButtonSize } from './Button';
import { cn } from './cn';

/** 제어형 확인 다이얼로그. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'danger',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Modal title={title} onClose={onClose}>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 서버액션 폼 안의 비가역 액션(폐강·환불·취소·노쇼)을 확인 후 제출하도록 감싸는 버튼.
 * <form action={serverAction}> 내부에 두면, 클릭 시 확인 모달을 띄우고 승인 시에만 submit.
 */
export function ConfirmSubmit({
  children,
  title,
  message,
  confirmLabel = '확인',
  variant = 'danger',
  buttonVariant = 'dangerGhost',
  size = 'sm',
  className,
}: {
  children: ReactNode;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  buttonVariant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cn(buttonVariants({ variant: buttonVariant, size }), className)}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        variant={variant}
        onClose={() => setOpen(false)}
        onConfirm={() => ref.current?.closest('form')?.requestSubmit()}
      />
    </>
  );
}
