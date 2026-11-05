import { useEffect, useState } from "react";
import { BUILD_ID, CHECK_EVERY_MS, fetchLatestBuild, isNewerBuild, reloadUrl } from "../app/updateCheck";

// Checks for a newer build every few minutes and when the player comes back to
// the tab; offers a reload (after saving) but never forces one. Hidden during
// a live battle so a tap can't cut a fight short.
export default function UpdateBanner({ onBeforeReload, hidden = false }) {
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    if (BUILD_ID === "dev") return undefined;
    let alive = true;
    const check = async () => {
      const build = await fetchLatestBuild(import.meta.env.BASE_URL);
      if (alive && isNewerBuild(BUILD_ID, build)) setLatest(build);
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    check();
    const interval = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!latest || hidden) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onBeforeReload?.();
        window.location.replace(reloadUrl(window.location.href, latest));
      }}
      className="mb-3 w-full rounded border border-cyan-300/60 bg-cyan-300/10 p-2 text-left font-mono-g text-[12px] text-cyan-100"
      data-testid="update-banner"
    >
      A new version is ready · <span className="font-bold underline">Tap to reload</span>
    </button>
  );
}
