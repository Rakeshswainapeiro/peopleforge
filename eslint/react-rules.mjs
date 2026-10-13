// no-restricted-syntax selectors shared by every React workspace (apps/web, packages/ui). Flat
// config replaces (not merges) a rule's options, so the base dynamic-require selector is repeated.
// The direction rule checks every string literal, not only className attributes, because the
// design system keeps its classes in variant tables.
const dynamicRequire = {
  selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']",
  message: 'Dynamic require is forbidden.',
};

const physicalDirection = {
  // RTL: physical left/right utilities don't mirror. Use ms-/me-/ps-/pe-/start-/end-.
  selector:
    'Literal[value=/(^|\\s)(-?(ml|mr|pl|pr|left|right)-(\\d|\\[|px|auto|full)|text-(left|right)(\\s|$)|(rounded|border)-(l|r|tl|tr|bl|br)(-|\\s|$))/]',
  message:
    'Physical direction utility. Use logical equivalents (ms-, me-, ps-, pe-, start-, end-, text-start).',
};

export const reactRestrictedSyntax = [
  dynamicRequire,
  {
    // i18n: user-facing text comes from messages/*.json, never JSX literals (ADR-001).
    selector: 'JSXText[value=/[A-Za-z\\u0600-\\u06FF]/]',
    message: 'Hardcoded UI text. Add a key to messages/en.json and use t().',
  },
  physicalDirection,
];

/** Tests render fixture text directly; the RTL rule still applies. */
export const reactTestRestrictedSyntax = [dynamicRequire, physicalDirection];
