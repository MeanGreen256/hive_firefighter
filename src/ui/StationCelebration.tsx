import './StationCelebration.css';

export interface StationCelebrationNotice {
  readonly id: string;
  readonly kind: 'badge' | 'shift';
  readonly stars: 0 | 1 | 2 | 3;
  readonly rewardUnlocked: boolean;
}

function StationGlyph() {
  return (
    <svg viewBox="0 0 64 56" aria-hidden="true" focusable="false">
      <path d="M7 22 32 5l25 17v28H7z" />
      <path d="M22 50V32h20v18M27 23h10" />
      <path d="M30 15h4v8h-4z" />
    </svg>
  );
}

function StarGlyph({ earned }: { readonly earned: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      data-earned={earned ? 'true' : 'false'}
    >
      <path d="m16 3 3.8 8 8.8 1.2-6.4 6.1 1.6 8.7-7.8-4.2-7.8 4.2 1.6-8.7-6.4-6.1 8.8-1.2z" />
    </svg>
  );
}

/**
 * A brief, non-blocking reminder that the new sticker lives on the station.
 * It never owns focus, movement, or the one action needed to keep playing.
 */
export function StationCelebration({ notice }: { readonly notice: StationCelebrationNotice }) {
  const shift = notice.kind === 'shift';
  const label = shift
    ? notice.rewardUnlocked
      ? 'Five-incident shift complete; cosmetic reward unlocked'
      : 'Five-incident shift complete'
    : notice.rewardUnlocked
      ? `New firehouse badge with ${notice.stars} mastery stars; cosmetic reward unlocked`
      : `New firehouse badge with ${notice.stars} mastery stars`;

  return (
    <aside
      key={notice.id}
      className={shift ? 'station-celebration station-celebration--shift' : 'station-celebration'}
      role="status"
      aria-label={label}
    >
      <div className="station-celebration__station">
        <StationGlyph />
      </div>
      <div className="station-celebration__stars" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <StarGlyph key={index} earned={index < notice.stars} />
        ))}
      </div>
      {notice.rewardUnlocked ? (
        <div className="station-celebration__reward" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 2v20M2 12h20m-16-6 12 12M18 6 6 18" />
          </svg>
        </div>
      ) : null}
    </aside>
  );
}
