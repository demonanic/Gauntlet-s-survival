import { useEffect, useRef, useState } from "react";
import {
  currentUser, deleteAccount, fetchCloudSave, needsSaveChoice, onAuthChange, pushCloudSave, readLastSync,
  requestPasswordReset, setNewPassword, signIn, signOut, signUp, summarizeSave, writeLastSync,
} from "../cloud/cloudSave";
import { parseGuild } from "../game/storage";
import { NeonButton, Panel } from "./ui";

const AUTOSAVE_MS = 45_000;
const MIN_PASSWORD = 6;

function SaveSummary({ title, summary, updatedAt }) {
  return (
    <div className="rounded border border-white/10 p-2 font-mono-g text-[11px]">
      <div className="font-bold text-cyan-200">{title}</div>
      <div className="text-slate-300">
        {summary.heroes} heroes · top LV {summary.topLevel} · {summary.gold}g
      </div>
      <div className="text-slate-400">
        Boss rank {summary.bossRank + 1} · Rift best {summary.riftBest} · {summary.renown} renown
      </div>
      {updatedAt ? <div className="text-slate-500">Saved {new Date(updatedAt).toLocaleString()}</div> : null}
    </div>
  );
}

// Cloud saves: sign in with email + password; the guild then syncs on its own.
// `onLoadSave(state)` replaces the local guild when the player picks the cloud copy.
// `localReplaced`: this device's save was unreadable and a fresh guild started;
// signing in then always asks before anything is written to the cloud.
// `onUserChange(signedIn)`: once the account is known, and on every sign-in or out.
export default function CloudSync({ guild, onLoadSave, localReplaced = false, onUserChange }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null);
  const [status, setStatus] = useState({ kind: "idle" });
  const [form, setForm] = useState({ email: "", password: "", mode: "signIn", busy: false, message: null });
  // Arrived from a reset email: ask for a new password.
  const [recovering, setRecovering] = useState(false);
  // Account deletion: typed confirmation, then the request.
  const [deleting, setDeleting] = useState(null);
  const guildRef = useRef(guild);
  const userRef = useRef(null);
  const readyRef = useRef(false);
  const pushedRef = useRef(null);
  guildRef.current = guild;
  userRef.current = user;

  const push = async () => {
    const owner = userRef.current;
    if (!owner) return;
    const state = guildRef.current;
    setStatus({ kind: "saving" });
    try {
      const at = await pushCloudSave(owner.id, state);
      writeLastSync(owner.id, at);
      pushedRef.current = state;
      readyRef.current = true;
      setStatus({ kind: "synced", at });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    }
  };

  const userChange = useRef(onUserChange);
  userChange.current = onUserChange;
  useEffect(() => {
    currentUser().then((found) => { setUser(found); userChange.current?.(!!found); }).catch(() => { setUser(null); userChange.current?.(false); });
    return onAuthChange((next, event) => {
      setUser(next);
      userChange.current?.(!!next);
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setOpen(true);
      }
    });
  }, []);

  // On sign-in: adopt the cloud save, keep this device's, or ask when both changed.
  useEffect(() => {
    readyRef.current = false;
    setChoice(null);
    if (!user) {
      setStatus({ kind: "idle" });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchCloudSave(user.id);
        if (cancelled) return;
        if (needsSaveChoice(readLastSync(), user.id, remote, localReplaced)) setChoice(remote);
        else await push();
      } catch (error) {
        if (!cancelled) setStatus({ kind: "error", message: error.message });
      }
    })();
    return () => { cancelled = true; };
    // push reads refs only; re-run only when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Autosave while signed in, and when the page is hidden.
  useEffect(() => {
    if (!user) return undefined;
    const save = () => { if (readyRef.current && guildRef.current !== pushedRef.current) push(); };
    const interval = setInterval(save, AUTOSAVE_MS);
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onHide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const adoptCloudSave = () => {
    const parsed = parseGuild(choice.data);
    if (!parsed) {
      setStatus({ kind: "error", message: "The cloud save could not be read." });
      return;
    }
    onLoadSave(parsed);
    writeLastSync(user.id, choice.updatedAt);
    pushedRef.current = null;
    readyRef.current = true;
    setChoice(null);
    setStatus({ kind: "synced", at: choice.updatedAt });
  };

  const submit = async (event) => {
    event.preventDefault();
    setForm((current) => ({ ...current, busy: true, message: null }));
    try {
      if (recovering) {
        await setNewPassword(form.password);
        setRecovering(false);
        setForm((current) => ({ ...current, busy: false, password: "", message: "Password changed." }));
      } else if (form.mode === "reset") {
        await requestPasswordReset(form.email.trim());
        setForm((current) => ({
          ...current, busy: false, mode: "signIn",
          message: "If that email has an account, a reset link is on its way. Open it on this device.",
        }));
      } else if (form.mode === "signUp") {
        const { needsConfirmation } = await signUp(form.email.trim(), form.password);
        setForm((current) => ({
          ...current, busy: false, mode: "signIn", password: "",
          message: needsConfirmation ? "Account created. Confirm it from the email we sent, then sign in." : null,
        }));
        if (!needsConfirmation) setOpen(false);
      } else {
        await signIn(form.email.trim(), form.password);
        setForm((current) => ({ ...current, busy: false, password: "" }));
        setOpen(false);
      }
    } catch (error) {
      setForm((current) => ({ ...current, busy: false, message: error.message }));
    }
  };

  const removeAccount = async () => {
    setDeleting((current) => ({ ...current, busy: true, message: null }));
    try {
      await deleteAccount();
      setDeleting(null);
      setUser(null);
      setForm((current) => ({ ...current, message: "Account deleted. Your guild is still saved on this device." }));
    } catch (error) {
      setDeleting((current) => ({ ...current, busy: false, message: error.message }));
    }
  };

  const label = !user ? "Cloud: sign in"
    : status.kind === "saving" ? "Cloud: saving…"
      : status.kind === "error" ? "Cloud: error"
        : status.kind === "synced" ? "Cloud: synced" : "Cloud: …";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded border px-2 py-1 font-mono-g text-[10px] uppercase ${status.kind === "error" ? "border-red-400/60 text-red-300" : "border-cyan-400/40 text-cyan-200"}`}
        data-testid="cloud-button"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4" data-testid="cloud-dialog">
          <Panel className="w-full max-w-sm">
            <h2 className="font-display text-lg font-bold text-cyan-200">CLOUD SAVE</h2>
            {user && recovering ? (
              <form className="mt-2 space-y-2" onSubmit={submit} data-testid="cloud-recovery">
                <p className="font-mono-g text-[11px] text-slate-300">Choose a new password for {user.email}.</p>
                <input
                  type="password" required minLength={MIN_PASSWORD} placeholder={`New password (${MIN_PASSWORD}+ characters)`}
                  autoComplete="new-password" value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded border border-white/15 bg-black/40 px-2 py-2 font-mono-g text-xs outline-none focus:border-cyan-300"
                  data-testid="cloud-new-password"
                />
                {form.message && <p className="font-mono-g text-[11px] text-yellow-300">{form.message}</p>}
                <NeonButton type="submit" className="w-full" disabled={form.busy} data-testid="cloud-set-password">Set password</NeonButton>
              </form>
            ) : user ? (
              <div className="mt-2 space-y-2 font-mono-g text-[11px]">
                <p className="text-slate-300">Signed in as <span className="text-cyan-200">{user.email}</span></p>
                <p className="text-slate-400">
                  {status.kind === "synced" && `Last synced ${new Date(status.at).toLocaleTimeString()}. Saves every ${AUTOSAVE_MS / 1000}s while you play.`}
                  {status.kind === "error" && <span className="text-red-300">{status.message}</span>}
                  {status.kind === "saving" && "Saving…"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <NeonButton color="#39FF14" onClick={push} disabled={!readyRef.current}>Sync now</NeonButton>
                  <NeonButton color="#FF2A5F" onClick={() => signOut().catch(() => {})}>Sign out</NeonButton>
                </div>
                {form.message && <p className="text-yellow-300">{form.message}</p>}
                {deleting ? (
                  <div className="space-y-1 rounded border border-red-400/50 p-2" data-testid="cloud-delete">
                    <p className="text-red-200">
                      This deletes your account and its cloud save for good. Your guild stays on this device. Type DELETE to confirm.
                    </p>
                    <input
                      value={deleting.text}
                      onChange={(event) => setDeleting((current) => ({ ...current, text: event.target.value }))}
                      className="w-full rounded border border-white/15 bg-black/40 px-2 py-2 font-mono-g text-xs outline-none focus:border-red-300"
                      data-testid="cloud-delete-confirm"
                    />
                    {deleting.message && <p className="text-red-300">{deleting.message}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <NeonButton color="#94A3B8" onClick={() => setDeleting(null)}>Cancel</NeonButton>
                      <NeonButton color="#FF2A5F" disabled={deleting.text !== "DELETE" || deleting.busy} onClick={removeAccount} data-testid="cloud-delete-go">
                        Delete account
                      </NeonButton>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full text-[10px] text-red-300 underline"
                    onClick={() => setDeleting({ text: "", busy: false, message: null })}
                    data-testid="cloud-delete-open"
                  >
                    Delete account
                  </button>
                )}
              </div>
            ) : (
              <form className="mt-2 space-y-2" onSubmit={submit}>
                <p className="font-mono-g text-[10px] text-slate-500">
                  Sign in to keep your guild in the cloud and play it on any device.
                </p>
                <input
                  type="email" required autoComplete="email" placeholder="Email" value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded border border-white/15 bg-black/40 px-2 py-2 font-mono-g text-xs outline-none focus:border-cyan-300"
                  data-testid="cloud-email"
                />
                {form.mode !== "reset" && (
                  <input
                    type="password" required minLength={MIN_PASSWORD} placeholder={`Password (${MIN_PASSWORD}+ characters)`}
                    autoComplete={form.mode === "signUp" ? "new-password" : "current-password"} value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded border border-white/15 bg-black/40 px-2 py-2 font-mono-g text-xs outline-none focus:border-cyan-300"
                    data-testid="cloud-password"
                  />
                )}
                {form.message && <p className="font-mono-g text-[11px] text-yellow-300" data-testid="cloud-message">{form.message}</p>}
                <NeonButton type="submit" className="w-full" disabled={form.busy} data-testid="cloud-submit">
                  {form.mode === "signUp" ? "Create account" : form.mode === "reset" ? "Email me a reset link" : "Sign in"}
                </NeonButton>
                {form.mode !== "signUp" && (
                  <button
                    type="button"
                    className="w-full font-mono-g text-[10px] text-slate-400 underline"
                    onClick={() => setForm((current) => ({ ...current, mode: current.mode === "reset" ? "signIn" : "reset", message: null }))}
                    data-testid="cloud-forgot"
                  >
                    {form.mode === "reset" ? "Back to sign in" : "Forgot password?"}
                  </button>
                )}
                <button
                  type="button"
                  className="w-full font-mono-g text-[10px] text-slate-400 underline"
                  onClick={() => setForm((current) => ({ ...current, mode: current.mode === "signUp" ? "signIn" : "signUp", message: null }))}
                >
                  {form.mode === "signUp" ? "Have an account? Sign in" : "New here? Create an account"}
                </button>
              </form>
            )}
            <NeonButton className="mt-3 w-full" color="#94A3B8" onClick={() => setOpen(false)}>Close</NeonButton>
          </Panel>
        </div>
      )}

      {choice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4" data-testid="cloud-choice">
          <Panel className="w-full max-w-sm space-y-2">
            <h2 className="font-display text-lg font-bold text-cyan-200">WHICH GUILD?</h2>
            <p className="font-mono-g text-[11px] text-slate-400">Your account already has a cloud save. Pick the one to keep; the other is replaced.</p>
            <SaveSummary title="Cloud save" summary={summarizeSave(choice.data)} updatedAt={choice.updatedAt} />
            <SaveSummary title="This device" summary={summarizeSave(guild)} />
            <div className="grid grid-cols-2 gap-2">
              <NeonButton color="#00F3FF" onClick={adoptCloudSave} data-testid="cloud-use-remote">Use cloud</NeonButton>
              <NeonButton color="#FFE600" onClick={() => { setChoice(null); push(); }} data-testid="cloud-keep-local">Keep this device</NeonButton>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
