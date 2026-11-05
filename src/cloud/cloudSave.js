// Cloud saves on Supabase: email + password accounts, one save row per player
// (public.saves, see supabase/migrations). The publishable key is meant to ship
// in the client; row-level security limits every player to their own row.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || "https://xtgpznknlaihmfohdmqs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_eYzLLZ9uLLCkFLBQnM2rZA_Ujq0wHUF";

let client = null;
function cloud() {
  client ||= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}

// Supabase error messages are already player-readable ("Invalid login credentials").
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || "Cloud request failed");
  return data;
}

// Where email links (confirmation, password reset) send the player: the game
// itself, subfolder included (GitHub Pages serves it under /Gauntlet-s-survival/).
// Inside the Android app the page lives at a local address no email can open,
// so links go to the web game there.
export const WEB_GAME_URL = "https://demonanic.github.io/Gauntlet-s-survival/";

export function gameUrl(location = globalThis.location, base = import.meta.env?.BASE_URL || "/") {
  if (!location) return undefined;
  if (/^(https?:\/\/localhost|capacitor:)/.test(location.origin) && location.protocol !== "http:") return WEB_GAME_URL;
  return `${location.origin}${base}`;
}

export async function signUp(email, password) {
  const data = unwrap(await cloud().auth.signUp({
    email, password, options: { emailRedirectTo: gameUrl() },
  }));
  // With email confirmation on, Supabase returns no session until the link is clicked.
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signIn(email, password) {
  return unwrap(await cloud().auth.signInWithPassword({ email, password })).user;
}

export async function signOut() {
  unwrap(await cloud().auth.signOut());
}

// Emails a link that brings the player back to the game to set a new password.
export async function requestPasswordReset(email) {
  unwrap(await cloud().auth.resetPasswordForEmail(email, { redirectTo: gameUrl() }));
}

export async function setNewPassword(password) {
  unwrap(await cloud().auth.updateUser({ password }));
}

// Deletes the signed-in account and its cloud save (public.delete_my_account,
// see supabase/migrations). This device's save is left alone.
export async function deleteAccount() {
  unwrap(await cloud().rpc("delete_my_account"));
  await cloud().auth.signOut({ scope: "local" }).catch(() => {});
}

export async function currentUser() {
  return unwrap(await cloud().auth.getSession()).session?.user || null;
}

// `callback(user, event)`; event "PASSWORD_RECOVERY" means the player arrived
// from a reset link and should choose a new password.
export function onAuthChange(callback) {
  const { data } = cloud().auth.onAuthStateChange((event, session) => callback(session?.user || null, event));
  return () => data.subscription.unsubscribe();
}

// The signed-in player's save, or null if they have never synced.
export async function fetchCloudSave(userId) {
  const row = unwrap(await cloud().from("saves").select("data, updated_at").eq("user_id", userId).maybeSingle());
  return row ? { data: row.data, updatedAt: Date.parse(row.updated_at) } : null;
}

export async function pushCloudSave(userId, state) {
  const updatedAt = new Date().toISOString();
  unwrap(await cloud().from("saves").upsert({ user_id: userId, data: state, updated_at: updatedAt }));
  return Date.parse(updatedAt);
}

// A one-line picture of a save, for choosing between this device and the cloud.
export function summarizeSave(state) {
  const heroes = Array.isArray(state?.heroes) ? state.heroes : [];
  return {
    gold: Math.round(state?.gold || 0),
    heroes: heroes.length,
    topLevel: Math.max(0, ...heroes.map((hero) => hero?.progression?.level || 0)),
    bossRank: state?.bossRank || 0,
    riftBest: state?.records?.riftBest || 0,
    renown: state?.legacy?.renown || 0,
    lastPlayed: state?.lastTickAt || 0,
  };
}

// Each device remembers the cloud version it last synced. The player is asked
// to choose only when the cloud holds a save this device has not seen (first
// sign-in here, or another device saved since).
const LAST_SYNC_KEY = "gauntlet.cloud.lastSync";

export function readLastSync(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(LAST_SYNC_KEY) || "null");
  } catch {
    return null;
  }
}

export function writeLastSync(userId, updatedAt, storage = globalThis.localStorage) {
  try {
    storage?.setItem(LAST_SYNC_KEY, JSON.stringify({ userId, updatedAt }));
  } catch {
    // Storage unavailable: the next sign-in will simply ask again.
  }
}

// `localReplaced`: this device's save could not be read and a fresh guild was
// started, so the cloud copy must never be overwritten without asking.
export function needsSaveChoice(lastSync, userId, remote, localReplaced = false) {
  if (!remote) return false;
  if (localReplaced) return true;
  return lastSync?.userId !== userId || lastSync.updatedAt !== remote.updatedAt;
}
