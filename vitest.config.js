import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Local Claude Code worktrees shadow the repo; vitest would otherwise
      // pick up the duplicate test files inside them.
      '.claude/**',
    ],
  },
});
