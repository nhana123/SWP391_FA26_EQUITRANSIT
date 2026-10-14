// Capture before React, analytics or other content mounts. Tokens never enter router state.
let captured: { path: string; token: string | null } | null = null;
export function captureTokenLink() {
  if (!['/verify-email', '/reset-password'].includes(window.location.pathname)) return;
  const url = new URL(window.location.href);
  captured = { path: url.pathname, token: url.searchParams.get('token') };
  url.searchParams.delete('token');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
export function getCapturedToken(path: string) {
  return captured?.path === path ? captured.token : null;
}
export function clearCapturedToken() {
  captured = null;
}
