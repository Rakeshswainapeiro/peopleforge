import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type StepState = 'done' | 'current' | 'todo';

export interface Step {
  label: ReactNode;
  /** Second line, e.g. a date or "Pending". */
  detail?: ReactNode;
  state: StepState;
}

export interface ProgressStepsProps {
  /** Accessible name, e.g. "Progress". */
  label: string;
  steps: readonly Step[];
  /** Screen-reader text for each state, e.g. { done: 'completed', current: 'in progress', todo: 'not started' }. */
  stateLabels: Readonly<Record<StepState, string>>;
}

/** Figma "Progress": a bar per stage, filled when reached. */
export function ProgressSteps({ label, steps, stateLabels }: ProgressStepsProps) {
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
      {steps.map((step, index) => (
        <li
          // Steps are a fixed, ordered list: the position is the stage.
          key={`step-${String(index)}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex flex-col gap-2"
        >
          <span
            aria-hidden="true"
            className={cn('h-1 rounded-full', step.state === 'todo' ? 'bg-line' : 'bg-brand-600')}
          />
          <span className="text-xs font-semibold text-ink">
            {step.label}
            <span className="sr-only">
              {' — '}
              {step.state === 'done'
                ? stateLabels.done
                : step.state === 'current'
                  ? stateLabels.current
                  : stateLabels.todo}
            </span>
          </span>
          {step.detail === undefined ? null : (
            <span className="-mt-1.5 text-xs text-ink-muted">{step.detail}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
