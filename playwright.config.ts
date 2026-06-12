import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pw',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100/dashboard',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
