/**
 * Firebase builds its sign-in handler URL as `https://<authDomain>/__/auth/handler`.
 *
 * Returning the current host keeps that handler same-origin, so the `/__/auth/*` rewrite in
 * next.config.ts proxies it — the "Option 3" setup from Firebase's redirect-best-practices.
 * A cross-origin authDomain (the production domain while browsing localhost) writes the
 * pending-redirect state to one origin and completes it on another, so the user silently
 * lands back on the sign-in page.
 */
export function resolveAuthDomain(
  configured: string | undefined,
  host: string | undefined,
): string | undefined {
  return host ?? configured;
}
