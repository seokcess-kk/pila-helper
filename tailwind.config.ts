import type { Config } from 'tailwindcss';

/**
 * 디자인 토큰 — 단일 출처(SSOT).
 * - brand: 차분한 인디고 스케일(50~950). 데이터 밀집 화면에서 눈이 덜 피로한 톤.
 * - 시맨틱(success/warning/danger/info): 상태 배지·금액 방향 표시 단일 매핑.
 * - 표면(canvas/surface/muted/line): CSS 변수 경유 → 추후 다크모드 확장 대비.
 * 기존 Tailwind 팔레트(neutral/slate/emerald…)도 그대로 유지(점진 마이그레이션).
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f4fb',
          100: '#e6eaf6',
          200: '#cdd5ee',
          300: '#abb8e0',
          400: '#8494d0',
          500: '#6575c0',
          600: '#4f5db0', // primary
          700: '#424e93',
          800: '#394277',
          900: '#313a61',
          950: '#1f2440',
          DEFAULT: '#4f5db0',
          soft: '#e6eaf6',
        },
        success: { DEFAULT: '#059669', soft: '#d1fae5', fg: '#047857' },
        warning: { DEFAULT: '#d97706', soft: '#fef3c7', fg: '#b45309' },
        danger: { DEFAULT: '#dc2626', soft: '#fee2e2', fg: '#b91c1c' },
        info: { DEFAULT: '#0284c7', soft: '#e0f2fe', fg: '#0369a1' },
        // 표면 토큰(CSS 변수) — bg-canvas / bg-surface / bg-muted / border-line
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        muted: 'var(--surface-muted)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Apple SD Gothic Neo',
          'Segoe UI',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '0.875rem', // 14px — 카드/패널 표준
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        pop: '0 12px 32px -12px rgba(16,24,40,.28), 0 2px 6px -2px rgba(16,24,40,.12)',
        drawer: '-16px 0 40px -16px rgba(16,24,40,.25)',
      },
      ringColor: {
        DEFAULT: '#4f5db0',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-up': { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'slide-in-right': 'slide-in-right .22s cubic-bezier(.32,.72,0,1)',
        'slide-up': 'slide-up .18s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
