// "A new version is ready": each build writes version.json next to the game
// (vite.config.js) and bakes its own id in as __BUILD_ID__. The page asks for
// version.json now and then; when the id differs, a newer build is live.
export const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
export const CHECK_EVERY_MS = 5 * 60_000;

// The live build's id, or null (offline, dev server, unreadable file).
export async function fetchLatestBuild(base = "/", fetcher = globalThis.fetch) {
  if (!fetcher) return null;
  try {
    const response = await fetcher(`${base}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.build === "string" && data.build ? data.build : null;
  } catch {
    return null;
  }
}

export function isNewerBuild(current, latest) {
  return current !== "dev" && !!latest && latest !== current;
}

// Where to go to load `build`: the same page with ?v=<build>, so a phone's
// cached index.html isn't reused.
export function reloadUrl(href, build) {
  const url = new URL(href);
  url.searchParams.set("v", build);
  return url.toString();
}
