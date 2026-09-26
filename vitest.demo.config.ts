import { defineConfig } from 'vitest/config';

// Slow test against the real demos in test-demos/ (not in git). Run: npm run test:demo
export default defineConfig({
  test: { include: ['tests/demo/**/*.test.ts'], testTimeout: 300_000, pool: 'forks' },
});
