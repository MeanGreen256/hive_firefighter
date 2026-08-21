import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StationCelebration } from './StationCelebration';

describe('station reward celebration', () => {
  it('reveals a new mastery badge through pictures, without another button', () => {
    const html = renderToStaticMarkup(
      <StationCelebration
        notice={{ id: 'meadow:1', kind: 'badge', stars: 2, rewardUnlocked: false }}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('New firehouse badge with 2 mastery stars');
    expect((html.match(/data-earned="true"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });

  it('marks shift completion and a fresh cosmetic without relying on color alone', () => {
    const html = renderToStaticMarkup(
      <StationCelebration
        notice={{ id: 'shift:1', kind: 'shift', stars: 3, rewardUnlocked: true }}
      />,
    );

    expect(html).toContain('station-celebration--shift');
    expect(html).toContain('Five-incident shift complete');
    expect(html).toContain('cosmetic reward unlocked');
    expect(html).toContain('station-celebration__reward');
  });

  it('never announces a fresh reward for later shifts that unlock nothing', () => {
    const html = renderToStaticMarkup(
      <StationCelebration
        notice={{ id: 'shift:2', kind: 'shift', stars: 2, rewardUnlocked: false }}
      />,
    );

    expect(html).toContain('aria-label="Five-incident shift complete"');
    expect(html).not.toContain('reward unlocked');
    expect(html).not.toContain('station-celebration__reward');
  });

  it('announces a newly unlocked cosmetic alongside a non-shift badge', () => {
    const html = renderToStaticMarkup(
      <StationCelebration
        notice={{ id: 'badge:10', kind: 'badge', stars: 3, rewardUnlocked: true }}
      />,
    );

    expect(html).toContain('New firehouse badge with 3 mastery stars; cosmetic reward unlocked');
    expect(html).toContain('station-celebration__reward');
  });
});
