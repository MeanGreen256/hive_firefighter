import { createStore } from 'zustand/vanilla';
import { isStyleId, type StyleId } from './styles';
import { getBrowserStyleStorage, resolveStyleId, writeStylePreference } from './stylePreferences';

export const DEFAULT_STYLE_ID: StyleId = 'diorama';

export function styleIdFromSearch(search: string): StyleId {
  const requested = new URLSearchParams(search).get('style');
  return isStyleId(requested) ? requested : DEFAULT_STYLE_ID;
}

type StyleUrlWriter = (styleId: StyleId) => void;

function updateBrowserUrl(styleId: StyleId): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('style', styleId);
  window.history.replaceState(window.history.state, '', url);
}

export interface StyleStoreState {
  readonly activeStyleId: StyleId;
  readonly setActiveStyle: (styleId: StyleId) => void;
}

export function createStyleStore(
  initialStyleId: StyleId = DEFAULT_STYLE_ID,
  writeUrl: StyleUrlWriter = updateBrowserUrl,
) {
  return createStore<StyleStoreState>()((set) => ({
    activeStyleId: initialStyleId,
    setActiveStyle: (activeStyleId) => {
      set({ activeStyleId });
      writeUrl(activeStyleId);
      writeStylePreference(getBrowserStyleStorage(), activeStyleId);
    },
  }));
}

const initialStyleId =
  typeof window === 'undefined'
    ? DEFAULT_STYLE_ID
    : resolveStyleId(window.location.search, getBrowserStyleStorage());

export const styleStore = createStyleStore(initialStyleId);
