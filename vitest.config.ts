import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { MINI_GUARD_DEBUG: '1' },
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
