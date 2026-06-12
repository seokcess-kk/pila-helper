import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '필라헬퍼 — 필라테스 경영관리',
  description: '필라테스 스튜디오 운영 솔루션 — 예약·회원·수강권·결제·이중기준 손익',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard(가변·동적 서브셋) — 한글 본문 가독성 + 라틴/숫자 정렬 */}
        <link
          rel="stylesheet"
          as="style"
          // eslint-disable-next-line @next/next/no-page-custom-font
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
