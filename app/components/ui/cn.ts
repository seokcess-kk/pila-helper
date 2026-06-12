/** 조건부 className 결합(작은 clsx 대체). falsy 제거 후 공백 결합. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
