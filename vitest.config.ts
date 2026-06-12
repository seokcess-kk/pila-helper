import { defineConfig } from 'vitest/config';

// 단위/통합 테스트만 (E2E *.e2e.ts, Playwright *.spec.ts 제외)
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
