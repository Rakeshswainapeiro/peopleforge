import nextPlugin from '@next/eslint-plugin-next';
import { baseConfig } from '@sirius/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat config replaces (not merges) a rule's options, so the base dynamic-require selector is
// repeated here alongside the web-only i18n/RTL selectors.
const restrictedSyntax = [
  {
    selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']",
    message: 'Dynamic require is forbidden.',
  },
  {
    // i18n: user-facing text comes from messages/*.json, never JSX literals (ADR-001).
    selector: 'JSXText[value=/[A-Za-z\\u0600-\\u06FF]/]',
    message: 'Hardcoded UI text. Add a key to messages/en.json and use t().',
  },
  {
    // RTL: physical left/right utilities don't mirror. Use ms-/me-/ps-/pe-/start-/end-.
    selector:
      'JSXAttribute[name.name="className"] Literal[value=/(^|\\s)-?(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)(-|\\s|$)/]',
    message:
      'Physical direction utility. Use logical equivalents (ms-, me-, ps-, pe-, start-, end-, text-start).',
  },
];

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
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    // React components return JSX by convention; annotating every one adds noise, not safety.
    files: ['**/*.tsx'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
];
