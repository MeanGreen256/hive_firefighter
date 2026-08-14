import type { ReactNode } from 'react';
import { OnboardingStep, type OnboardingStepId } from './onboardingSteps';
import './OnboardingCoach.css';

/** A space bar and a pad face button, drawn as shapes rather than named. */
function ActionKeys() {
  return (
    <span className="coach__keys coach__act">
      <span className="coach__key" />
      <span className="coach__button">A</span>
    </span>
  );
}

function Arrow() {
  return (
    <span className="coach__arrow" aria-hidden="true">
      ➜
    </span>
  );
}

interface Prompt {
  /** For screen readers and for the adult in the room. Never shown. */
  readonly label: string;
  readonly icons: ReactNode;
}

/**
 * Each prompt is one sentence with no words in it: what to press, an arrow, and
 * what happens. The moving element is always the thing being asked for.
 */
const PROMPTS: Readonly<Record<Exclude<OnboardingStepId, 'done'>, Prompt>> = {
  [OnboardingStep.Drive]: {
    label: 'Hold a direction to drive the truck',
    icons: (
      <>
        <span className="coach__act" aria-hidden="true">
          🕹
        </span>
        <Arrow />
        <span aria-hidden="true">🚒</span>
      </>
    ),
  },
  [OnboardingStep.Approach]: {
    label: 'Drive to the smoke',
    icons: (
      <>
        <span aria-hidden="true">🚒</span>
        <Arrow />
        <span className="coach__act" aria-hidden="true">
          💨
        </span>
      </>
    ),
  },
  [OnboardingStep.Dismount]: {
    label: 'Press the button to hop out of the truck',
    icons: (
      <>
        <ActionKeys />
        <Arrow />
        <span aria-hidden="true">🧑‍🚒</span>
      </>
    ),
  },
  [OnboardingStep.Spray]: {
    label: 'Hold the button to squirt water at the fire',
    icons: (
      <>
        <ActionKeys />
        <Arrow />
        <span aria-hidden="true">💦</span>
        <span aria-hidden="true">🔥</span>
      </>
    ),
  },
};

export interface OnboardingCoachProps {
  readonly step: OnboardingStepId;
  readonly onSkip: () => void;
}

/**
 * The guided first quest (#107).
 *
 * One prompt at a time, at the moment it is needed, and it stays until the
 * player does the thing. There is no timer, no failure, and no second page —
 * the whole tutorial is four pictures and it never plays twice.
 *
 * The card cannot be clicked through to the game (`pointer-events: none`)
 * except for the skip control, so a child mashing the screen never loses the
 * prompt by accident.
 */
export function OnboardingCoach({ step, onSkip }: OnboardingCoachProps) {
  if (step === OnboardingStep.Done) return null;
  const prompt = PROMPTS[step];

  return (
    <aside className="coach" role="status" aria-live="polite" aria-label={prompt.label}>
      <div className="coach__icons">{prompt.icons}</div>
      <button type="button" className="coach__skip" onClick={onSkip} aria-label="Skip the guide">
        ✕
      </button>
    </aside>
  );
}
