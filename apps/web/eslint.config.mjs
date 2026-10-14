import nextPlugin from '@next/eslint-plugin-next';
import { baseConfig } from '@sirius/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { reactRestrictedSyntax, reactTestRestrictedSyntax } from '../../eslint/react-rules.mjs';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['playwright-report/**', 'test-results/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...reactRestrictedSyntax],
    },
  },
  {
    files: ['**/*.test.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...reactTestRestrictedSyntax] },
  },
  {
    // React components return JSX by convention; annotating every one adds noise, not safety.
    files: ['**/*.tsx'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
];
