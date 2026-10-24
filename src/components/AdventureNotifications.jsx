import { useEffect, useRef, useState } from "react";
import { getRegion } from "../game/regions";

// Browser notifications for big expedition moments while the game is in the
// background (boss reached, legendary monster, merchant, treasure, rare gear,
// the party getting home). Opt-in per device; the choice is kept in localStorage.
const PREF_KEY = "gauntlet.notifications";
const OUTCOME_TEXT = { victory: "conquered", retreat: "routed", recalled: "back home", returned: "back from the Rift" };

const supported = () => typeof Notification !== "undefined";

function readPref() {
  try {
    return globalThis.localStorage?.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on) {
  try {
    globalThis.localStorage?.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the toggle simply won't be remembered.
  }
}

const entryKey = (entry) => `${entry.at}|${entry.text}`;

function notify(body) {
  try {
    new Notification("Gauntlet", { body, tag: `gauntlet-${body.slice(0, 40)}` });
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

export function useAdventureNotifications(guild) {
  const [enabled, setEnabled] = useState(() => readPref() && supported() && Notification.permission === "granted");
  const lastFeed = useRef(null);
  const lastReport = useRef(guild.lastReport);

  useEffect(() => {
    const background = typeof document !== "undefined" && document.visibilityState !== "visible";
    const active = enabled && background && supported() && Notification.permission === "granted";
    const feed = guild.expedition?.feed || [];
    const seen = lastFeed.current ? feed.findIndex((entry) => entryKey(entry) === lastFeed.current) : feed.length - 1;
    if (active) for (const entry of feed.slice(seen + 1)) if (entry.notify) notify(entry.text);
    if (feed.length) lastFeed.current = entryKey(feed[feed.length - 1]);

    const report = guild.lastReport;
    if (report && report !== lastReport.current && report.endedAt !== lastReport.current?.endedAt && active) {
      notify(`${getRegion(report.regionId)?.name}: ${OUTCOME_TEXT[report.outcome] || "done"}. +${report.loot.gold}g, ${report.loot.items.length} items.`);
    }
    lastReport.current = report;
  }, [guild, enabled]);

  const toggle = async () => {
    if (!supported()) return;
    if (enabled) {
      writePref(false);
      setEnabled(false);
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    writePref(permission === "granted");
    setEnabled(permission === "granted");
  };

  return { enabled, toggle, supported: supported(), denied: supported() && Notification.permission === "denied" };
}

export default function NotificationToggle({ state }) {
  if (!state.supported) return null;
  return (
    <button
      type="button"
      className="font-mono-g text-[10px] text-slate-500 underline disabled:no-underline"
      onClick={state.toggle}
      disabled={state.denied}
      data-testid="notifications-toggle"
    >
      {state.denied ? "Notifications blocked in browser settings" : `Notifications: ${state.enabled ? "on" : "off"}`}
    </button>
  );
}
