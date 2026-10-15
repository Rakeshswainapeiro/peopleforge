import type { ComponentType, ReactNode } from 'react';

export interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page' | undefined;
  'aria-label'?: string | undefined;
}

/**
 * The anchor a component renders. Apps pass their router's link (Next.js `Link`) so navigation
 * stays client-side; the default is a plain `<a>`, which keeps the package framework-free.
 */
export type LinkComponent = ComponentType<LinkProps>;

export function PlainLink({ children, ...props }: LinkProps) {
  return <a {...props}>{children}</a>;
}
