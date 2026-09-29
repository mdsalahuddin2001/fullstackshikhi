// Present mode lives on <html data-present>, which survives client-side navigation.
// sessionStorage restores it after a hard reload.
const STORAGE_KEY = 'present-mode';
const REVEAL_ALL_KEY = 'present-reveal-all';
const listeners = new Set<() => void>();

export function isPresent(): boolean {
  return document.documentElement.hasAttribute('data-present');
}

export function setPresent(on: boolean) {
  document.documentElement.toggleAttribute('data-present', on);
  try {
    if (on) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export function restorePresent() {
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1' && !isPresent()) setPresent(true);
  } catch {}
}

export function subscribePresent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Going back a page should land with every step already revealed, like slides. */
export function markRevealAll() {
  try {
    sessionStorage.setItem(REVEAL_ALL_KEY, '1');
  } catch {}
}

export function shouldRevealAll(): boolean {
  try {
    return sessionStorage.getItem(REVEAL_ALL_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearRevealAll() {
  try {
    sessionStorage.removeItem(REVEAL_ALL_KEY);
  } catch {}
}
