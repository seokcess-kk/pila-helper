'use client';
// 루트 에러 경계 — 루트 레이아웃까지 실패한 경우(globals.css 미적용)이므로 인라인 스타일 사용.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'Pretendard, system-ui, sans-serif', background: '#f6f7fb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 360, textAlign: 'center', background: '#fff', border: '1px solid #e4e8f0', borderRadius: 14, padding: 28 }}>
            <div
              style={{ width: 48, height: 48, margin: '0 auto 12px', borderRadius: '50%', background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}
            >
              !
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#0f172a' }}>문제가 발생했습니다</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>잠시 후 다시 시도해 주세요.</p>
            <button
              onClick={() => reset()}
              style={{ background: '#4f5db0', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
