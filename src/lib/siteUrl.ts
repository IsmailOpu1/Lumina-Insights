const PRODUCTION_URL = 'https://lumina-insights-ashen.vercel.app';

/**
 * The address links in emails should point to. Vercel preview deployments
 * are deleted after a while, so a confirmation or invite link built from a
 * preview's address would later open a dead page. Local development keeps
 * its own address so those flows can still be tested.
 */
export function siteUrl() {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return PRODUCTION_URL;
}
