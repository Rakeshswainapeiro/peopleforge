import { baseConfig } from '@sirius/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { reactRestrictedSyntax, reactTestRestrictedSyntax } from '../../eslint/react-rules.mjs';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...reactRestrictedSyntax],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    files: ['**/*.test.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...reactTestRestrictedSyntax] },
  },
];
