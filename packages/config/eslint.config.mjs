import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config for every workspace. Type-aware rules are on, so each workspace must
 * pass its own tsconfig root via `tsconfigRootDir`.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', '.next/**', 'next-env.d.ts', '*.config.*'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    security.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-console': 'error',
        eqeqeq: ['error', 'always'],
        // Express error handlers are identified by arity, so unused `_next` must be allowed.
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']",
            message: 'Dynamic require is forbidden.',
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        // Tests legitimately build fixtures from literal file paths and object keys.
        'security/detect-object-injection': 'off',
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    prettier,
  );
}
