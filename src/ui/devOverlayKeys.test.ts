import { describe, expect, it } from 'vitest';
import {
  DEV_OVERLAY_KEYS,
  devOverlayKeyLabel,
  isTypingTarget,
  togglesDevOverlay,
  type DevOverlayKeyEvent,
} from './devOverlayKeys';

const press = (overrides: Partial<DevOverlayKeyEvent> = {}): DevOverlayKeyEvent => ({
  key: 'j',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  target: null,
  ...overrides,
});

describe('development overlay bindings', () => {
  it('gives each overlay its own key, and no function keys', () => {
    expect(DEV_OVERLAY_KEYS.perf).toBe('j');
    expect(DEV_OVERLAY_KEYS.telemetry).toBe('k');
    expect(DEV_OVERLAY_KEYS.perf).not.toBe(DEV_OVERLAY_KEYS.telemetry);
    for (const key of Object.values(DEV_OVERLAY_KEYS)) {
      expect(key).not.toMatch(/^F\d+$/i);
    }
  });

  /**
   * The game must keep every key it already owns; a development overlay that
   * shadows one is worse than an awkward function key.
   */
  it('never claims a key gameplay already uses', () => {
    const gameplayKeys = ['w', 'a', 's', 'd', ' ', 'e', 'l', 'enter'];
    for (const key of Object.values(DEV_OVERLAY_KEYS)) {
      expect(gameplayKeys).not.toContain(key);
    }
  });

  it('toggles the overlay its key belongs to, and only that one', () => {
    expect(togglesDevOverlay('perf', press({ key: 'j' }))).toBe(true);
    expect(togglesDevOverlay('telemetry', press({ key: 'j' }))).toBe(false);
    expect(togglesDevOverlay('telemetry', press({ key: 'k' }))).toBe(true);
    expect(togglesDevOverlay('perf', press({ key: 'k' }))).toBe(false);
  });

  it('accepts the key however the shift state reports it', () => {
    expect(togglesDevOverlay('perf', press({ key: 'J' }))).toBe(true);
  });

  it('ignores unrelated keys', () => {
    expect(togglesDevOverlay('perf', press({ key: 'w' }))).toBe(false);
    expect(togglesDevOverlay('perf', press({ key: 'F3' }))).toBe(false);
  });

  it('does not fire while the key is held down', () => {
    expect(togglesDevOverlay('perf', press({ repeat: true }))).toBe(false);
  });

  it('leaves the browser its own chords', () => {
    expect(togglesDevOverlay('perf', press({ ctrlKey: true }))).toBe(false);
    expect(togglesDevOverlay('perf', press({ metaKey: true }))).toBe(false);
    expect(togglesDevOverlay('perf', press({ altKey: true }))).toBe(false);
  });

  it('does not fire while someone is typing into a field', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
      expect(togglesDevOverlay('perf', press({ target: { tagName } }))).toBe(false);
    }
    expect(togglesDevOverlay('perf', press({ target: { isContentEditable: true } }))).toBe(false);
  });

  it('still fires when the keystroke lands on ordinary page furniture', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(togglesDevOverlay('perf', press({ target: { tagName: 'CANVAS' } }))).toBe(true);
  });

  it('prints the same key the binding matches on', () => {
    expect(devOverlayKeyLabel('perf')).toBe('J');
    expect(devOverlayKeyLabel('telemetry')).toBe('K');
    for (const overlay of ['perf', 'telemetry'] as const) {
      expect(devOverlayKeyLabel(overlay).toLowerCase()).toBe(DEV_OVERLAY_KEYS[overlay]);
    }
  });
});
