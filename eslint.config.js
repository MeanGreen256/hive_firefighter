import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

const HEX_COLOR_PATTERN = /#[0-9a-f]{3,8}\b/i;
const CSS_COLOR_FUNCTION_PATTERN = /\b(?:rgba?|hsla?)\s*\(/i;
// Three.js takes colours as numeric hex at least as often as strings —
// `new Color(0xff0000)`, `color={0x101319}` — so the numeric form is the one
// most likely to smuggle an art direction into src/render. Bounded to
// colour-shaped widths (3, 4, 6, 8 digits) so ordinary masks like 0xff and
// bit flags like 0x1 stay legal.
const NUMERIC_HEX_COLOR_PATTERN = /^0x(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const noRenderHexColors = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      hardcodedColor:
        'Do not hardcode colour literals in src/render. Read colour from the active style.',
    },
  },
  create(context) {
    function check(node, value) {
      if (
        typeof value === 'string' &&
        (HEX_COLOR_PATTERN.test(value) || CSS_COLOR_FUNCTION_PATTERN.test(value))
      ) {
        context.report({ node, messageId: 'hardcodedColor' });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'number') {
          if (NUMERIC_HEX_COLOR_PATTERN.test(node.raw ?? '')) {
            context.report({ node, messageId: 'hardcodedColor' });
          }
          return;
        }
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

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
      hive: { rules: { 'no-render-hex-colors': noRenderHexColors } },
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

  {
    files: ['src/render/**/*.{ts,tsx}'],
    rules: {
      'hive/no-render-hex-colors': 'error',
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
