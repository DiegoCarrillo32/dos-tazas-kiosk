/**
 * The service worker (public/sw.js) keys its caches on this value, so it
 * MUST change on every deploy — otherwise a device keeps serving the
 * previous build's HTML and `/_next/static` chunks forever. That is
 * exactly what happened when the hardcoded "v1" in sw.js was never
 * bumped: `activate` only evicts caches whose name differs from the
 * current one, so nothing was ever evicted and the admin section booted
 * against a shell from an older build.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA at build time; the timestamp is the
 * local fallback (where the worker is disabled anyway).
 */
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Baked in at build time, so every client and the SW registration agree
  // on one value for the life of a deploy.
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
};

export default nextConfig;
