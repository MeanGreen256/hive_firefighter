import { describe, expect, it } from 'vitest';
import { SoundControlMode, getSoundControlPresentation } from './soundControl';

describe('the one wordless sound control', () => {
  it('offers sound quietly while the automatic unlock still has gestures to spend', () => {
    const presentation = getSoundControlPresentation({
      enabled: false,
      muted: false,
      gestureRequired: false,
    });

    expect(presentation.mode).toBe(SoundControlMode.Offer);
    expect(presentation.className).not.toContain('wants-sound');
  });

  it('asks for a gesture once the browser has refused the automatic unlock', () => {
    const presentation = getSoundControlPresentation({
      enabled: false,
      muted: false,
      gestureRequired: true,
    });

    expect(presentation.mode).toBe(SoundControlMode.Ask);
    expect(presentation.className).toContain('world-hud__action--wants-sound');
    expect(presentation.glyph).toBe('🔈');
  });

  it('becomes the mute toggle once sound is running', () => {
    expect(
      getSoundControlPresentation({ enabled: true, muted: false, gestureRequired: false }),
    ).toMatchObject({ mode: SoundControlMode.Toggle, glyph: '🔊', pressed: false });
    expect(
      getSoundControlPresentation({ enabled: true, muted: true, gestureRequired: false }),
    ).toMatchObject({ mode: SoundControlMode.Toggle, glyph: '🔇', pressed: true });
  });

  it('never asks for a gesture it has already been given', () => {
    expect(
      getSoundControlPresentation({ enabled: true, muted: false, gestureRequired: true }).className,
    ).not.toContain('wants-sound');
  });

  it('says nothing on screen that has to be read', () => {
    for (const enabled of [false, true]) {
      for (const muted of [false, true]) {
        const presentation = getSoundControlPresentation({
          enabled,
          muted,
          gestureRequired: false,
        });
        expect(presentation.glyph).not.toMatch(/[a-z]/i);
      }
    }
  });
});
