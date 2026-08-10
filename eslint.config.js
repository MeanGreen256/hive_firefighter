import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `.claude` holds agent definitions and settings, never lintable source.
  // Agent sessions also materialise full repo checkouts under
  // `.claude/worktrees/`, which ESLint would otherwise try to lint against
  // the root tsconfig and fail on. CI never sees them (they're excluded
  // locally, not committed) so this only bites during local verification.
  { ignores: ['dist', 'node_modules', 'docs', '.claude'] },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // The simulation is the core system and it must stay portable: pure data
  // in, pure data out. If it imports the renderer or React, the style
  // switcher (#18) stops being cheap and the sim stops being testable.
  {
    files: ['src/sim/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message: 'src/sim must stay renderer-agnostic. Keep Three.js in src/render.',
            },
            {
              name: 'react',
              message: 'src/sim must not depend on React. Bridge through the store instead.',
            },
            { name: '@react-three/fiber', message: 'src/sim must stay renderer-agnostic.' },
            { name: '@react-three/drei', message: 'src/sim must stay renderer-agnostic.' },
          ],
          patterns: [
            {
              group: ['@render/*', '@ui/*'],
              message: 'src/sim must not depend on render or UI layers.',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
