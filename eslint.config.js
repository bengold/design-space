import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'mcp-server/dist/**',
      'public/**',
      // Local Claude Code state — worktrees, hooks, etc. — never linted.
      '.claude/**',
      // Stray Vite build chunks at the repo root, if any leaked out of dist/.
      'QuestionsViewer-*.js',
      '*-[A-Za-z0-9]{8}.js',
      'projectpage.js',
      'startingpointpicker.js',
      // Reference exports kept locally but not part of the source tree.
      'App onboarding/**',
      'ios-frame.jsx',
      'script.js',
      'designs/*/agent-feedback.md',
      'designs/*/agent-inbox.md',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: { react: { version: '19.0' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['bin/**/*.mjs', 'mcp-server/**/*.mjs', 'lib/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
