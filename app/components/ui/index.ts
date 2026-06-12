/** 공통 UI 컴포넌트 단일 진입점. 기존 `app/components/ui.tsx`를 대체. */
export { cn } from './cn';
export { Button, IconButton, buttonVariants } from './Button';
export type { ButtonVariant, ButtonSize, ButtonProps } from './Button';
export { Badge, statusTone } from './Badge';
export type { BadgeTone } from './Badge';
export { Card } from './Card';
export { Stat, KpiCard } from './Stat';
export type { StatTone } from './Stat';
export { Input, Textarea, Select, Field, SearchInput, inputBase } from './Field';
export { EmptyState } from './EmptyState';
export { Skeleton, SkeletonText, SkeletonCard } from './Skeleton';
export { PageHeader, PageTitle, Toolbar } from './PageHeader';
export { SegmentedNav, Tabs } from './Tabs';
export type { SegOption, TabItem } from './Tabs';
export { Table, THead, Th, TBody, TR, Td, EmptyRow } from './Table';
export { Drawer } from './Drawer';
export { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';
export { ConfirmDialog, ConfirmSubmit } from './ConfirmDialog';
export { ToastProvider, useToast } from './Toast';
export { ToastBridge } from './ToastBridge';
export { useDialog } from './useDialog';
export { Modal } from '../Modal';

// 금액 포맷은 공용 util 단일 출처 재export(중복 제거)
export { won } from '@/lib/util.js';
