import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// The rules of typescript-eslint's strict and stylistic type-checked sets that the code already
// passes, with the options those sets give them. The others in the sets need code changes first.
const passingStrictRules = [
  '@typescript-eslint/adjacent-overload-signatures',
  '@typescript-eslint/ban-tslint-comment',
  '@typescript-eslint/class-literal-property-style',
  '@typescript-eslint/consistent-generic-constructors',
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/dot-notation',
  '@typescript-eslint/no-confusing-non-null-assertion',
  '@typescript-eslint/no-dynamic-delete',
  '@typescript-eslint/no-generated-empty-object-type',
  '@typescript-eslint/no-inferrable-types',
  '@typescript-eslint/no-invalid-void-type',
  '@typescript-eslint/no-meaningless-void-operator',
  '@typescript-eslint/no-mixed-enums',
  '@typescript-eslint/no-non-null-asserted-nullish-coalescing',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare',
  '@typescript-eslint/no-unnecessary-template-expression',
  '@typescript-eslint/no-unnecessary-type-arguments',
  '@typescript-eslint/no-unsafe-enum-assignment',
  '@typescript-eslint/no-useless-constructor',
  '@typescript-eslint/no-useless-default-assignment',
  '@typescript-eslint/prefer-find',
  '@typescript-eslint/prefer-for-of',
  '@typescript-eslint/prefer-function-type',
  '@typescript-eslint/prefer-literal-enum-member',
  '@typescript-eslint/prefer-reduce-type-parameter',
  '@typescript-eslint/prefer-return-this-type',
  '@typescript-eslint/prefer-string-starts-ends-with',
  '@typescript-eslint/related-getter-setter-pairs',
  '@typescript-eslint/return-await',
  '@typescript-eslint/unified-signatures',
  '@typescript-eslint/use-unknown-in-catch-callback-variable',
];
const strictSetRules = Object.assign(
  {},
  ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map(
    (config) => config.rules ?? {},
  ),
);

export default [
  {
    ignores: [
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '**/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['frontend/apps/admin-portal/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      ...Object.fromEntries(passingStrictRules.map((rule) => [rule, strictSetRules[rule]])),
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
