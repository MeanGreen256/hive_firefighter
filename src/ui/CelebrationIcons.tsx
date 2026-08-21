import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** A small, consistent icon vocabulary for the celebration screen. */
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m32 7 7.7 16.5 18 2.2-13.3 12.4 3.5 17.9L32 47.4 16.1 56l3.5-17.9L6.3 25.7l18-2.2z" />
    </Icon>
  );
}

export function BuildingIcon({
  scorched = false,
  ...props
}: IconProps & { readonly scorched?: boolean }) {
  return (
    <Icon {...props}>
      <path d="M10 57h44V24L32 7 10 24z" />
      <path d="M24 57V38h16v19M20 28h4M40 28h4" />
      {scorched ? <path d="m16 15 9 11-7 7 12 7-8 9m24-34-8 11 8 6-9 9 7 7" /> : null}
    </Icon>
  );
}

export function OutcomeIcon({
  outcome,
  ...props
}: IconProps & { readonly outcome: 'contained' | 'scorched' }) {
  return outcome === 'contained' ? (
    <Icon {...props}>
      <path d="M32 5c13 15 18 25 18 34a18 18 0 1 1-36 0c0-9 5-19 18-34Z" />
      <path d="M23 39c2 5 6 8 11 8 4 0 7-2 9-5M25 28l4 4 9-10" />
    </Icon>
  ) : (
    <Icon {...props}>
      <path d="M10 57h44V24L32 7 10 24z" />
      <path d="M24 57V38h16v19M17 18l10 10-8 8 12 6-9 10m25-34-8 10 8 8-10 9 8 8" />
    </Icon>
  );
}

export function ContinueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 32h43M36 17l15 15-15 15" />
    </Icon>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M51 25a20 20 0 1 0 1 16" />
      <path d="M51 9v16H35" />
    </Icon>
  );
}

export function NewFireIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M32 5c12 13 18 23 18 33a18 18 0 1 1-36 0c0-8 4-15 12-24 0 10 7 11 8 1 3 6 9 11 9 21 0 5-4 10-11 10-6 0-10-4-10-9" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m32 5 4 23 23 4-23 4-4 23-4-23-23-4 23-4z" />
    </Icon>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 32h45M39 17l15 15-15 15" />
    </Icon>
  );
}

export function ScenarioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="32" cy="32" r="21" />
      <path d="M32 11v10M32 43v10M11 32h10M43 32h10M17 17l7 7m16 16 7 7m0-30-7 7M24 40l-7 7" />
    </Icon>
  );
}
