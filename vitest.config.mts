import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // The API tests boot the Express app in-process; keep them sequential so a
    // shared rate-limit window does not cause flaky 429s.
    fileParallelism: false,
  },
});
