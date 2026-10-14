import { useSyncExternalStore } from 'react';
import type { LoginResponse } from './contracts';
type Session = LoginResponse & { generation: string; expiresAt: number };
let current: Session | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let onClear: () => void = () => {};
const emit = () => listeners.forEach((fn) => fn());
export function configureSessionCleanup(cleanup: () => void) {
  onClear = cleanup;
}
export function clearSession() {
  clearTimeout(timer);
  current = null;
  onClear();
  emit();
}
export function startSession(response: LoginResponse) {
  clearSession();
  current = {
    ...response,
    generation: crypto.randomUUID(),
    expiresAt: Date.now() + response.expiresIn * 1000,
  };
  timer = setTimeout(clearSession, Math.min(response.expiresIn * 1000, 2_147_483_647));
  emit();
}
export function getSession() {
  return current;
}
export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSession,
    () => null,
  );
}
