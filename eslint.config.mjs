// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

// NOTE: eslint-plugin-react@7.x is not yet compatible with ESLint 10
// (uses removed context.getFilename() API). We use typescript-eslint for
// JSX type checking and react-hooks for hook rules only.
// Track: https://github.com/jsx-eslint/eslint-plugin-react/issues/3993
// TODO(phase-1): re-enable eslint-plugin-react when v8 ships with ESLint 10 support.

export default tseslint.config(
  // Global ignores (applies to all configurations and prevents traversal of large data dirs)
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'data/**',
      'apps/server/data/**',
      'src-tauri/target/**',
      'src-tauri/**',
      '**/.system_generated/**',
      '**/.user_uploaded/**',
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (type-aware) for all TS files
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow explicit `any` with a justification comment — flag bare `any`
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars: ignore _ prefixed
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Void returns must be explicit
      '@typescript-eslint/no-floating-promises': 'error',
      // Allow async functions in React JSX event handlers
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    },
  },

  // React Hooks rules for the web app
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Disable type-aware rules for plain JS config files
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Config / tooling files that are not in any tsconfig project.
  // Run base TS rules only (no type-aware rules — they need parserOptions.project).
  {
    files: [
      'scripts/**/*.ts',
      'apps/*/vitest.config.ts',
      'apps/*/vite.config.ts',
      'apps/*/playwright.config.ts',
      'apps/*/tailwind.config.ts',
      'apps/server/test/**/*.ts',
      'apps/server/scripts/**/*.ts',
      'packages/*/vitest.config.ts',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
    ],
  },
);
