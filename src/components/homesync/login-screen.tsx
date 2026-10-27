"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassCard, MemberAvatar } from "@/components/homesync/glass";
import {
  GoogleIcon,
  HomeSyncMark,
  ShieldUserIcon,
  SparkleFloat,
} from "@/components/homesync/icons";
import { useSession } from "@/lib/homesync/session";
import type { SessionUser } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";

/**
 * Liquid glass sign-in.
 * Family accounts sign in with one tap; Google continues through the REAL
 * Google OAuth consent screen (authorization-code flow, verified by the
 * server); Guest gets a read-only preview.
 */

const FAMILY_ACCOUNTS = [
  { name: "Karthik Rao", role: "Family Admin", email: "karthik@homesync.app", color: "#64748b" },
  { name: "Meera Rao", role: "Parent", email: "meera@homesync.app", color: "#8f7a99" },
  { name: "Aditya Rao", role: "Child", email: "aditya@homesync.app", color: "#6f9a80" },
  { name: "Ramesh Rao", role: "Senior Member", email: "ramesh@homesync.app", color: "#6889a8" },
];

/** Shared family password — used only by the one-tap sign-in chips, never shown in the UI. */
const FAMILY_PASSWORD = "home@123";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_STATE_KEY = "homesync-oauth-state";

type AuthResult = { user: SessionUser | null; error: string | null };

/** POST an auth endpoint and normalize the result (never throws). */
async function requestUser(
  url: string,
  body: Record<string, unknown>,
  fallbackError: string
): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: SessionUser;
      error?: string;
    };
    if (!res.ok || !data.user) {
      return { user: null, error: data.error ?? fallbackError };
    }
    return { user: data.user, error: null };
  } catch {
    return { user: null, error: "Could not reach the home server. Please try again." };
  }
}

export function LoginScreen() {
  const login = useSession((s) => s.login);
  const loginGuest = useSession((s) => s.loginGuest);

  // Email + password form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-tap family sign-in chips
  const [chipBusy, setChipBusy] = useState<string | null>(null);

  // Real Google OAuth
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupRedirectUri, setSetupRedirectUri] = useState("");
  const [copied, setCopied] = useState(false);
  /** Guards the redirect-handling effect against double runs (React strict mode). */
  const oauthHandled = useRef(false);

  async function signIn(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { user, error: authError } = await requestUser(
        "/api/auth/login",
        { email, password },
        "Sign-in failed. Please try again."
      );
      if (authError || !user) {
        setError(authError ?? "Sign-in failed. Please try again.");
        return;
      }
      toast.success(`Welcome home, ${user.name}`);
      login(user);
    } finally {
      setBusy(false);
    }
  }

  async function quickSignIn(acc: (typeof FAMILY_ACCOUNTS)[number]) {
    if (chipBusy) return;
    setChipBusy(acc.email);
    setError(null);
    try {
      const { user, error: authError } = await requestUser(
        "/api/auth/login",
        { email: acc.email, password: FAMILY_PASSWORD },
        "Sign-in failed. Please try again."
      );
      if (authError || !user) {
        toast.error(authError ?? "Sign-in failed. Please try again.");
        return;
      }
      toast.success(`Welcome home, ${user.name}`);
      login(user);
    } finally {
      setChipBusy(null);
    }
  }

  /* ------------------- REAL Google OAuth (authorization code) ------------------- */

  const finishSignIn = useCallback(
    (user: SessionUser) => {
      toast.success(`Welcome home, ${user.name}`);
      login(user);
    },
    [login]
  );

  /** Start the real flow: send the browser to Google's consent screen. */
  async function startGoogleSignIn() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const res = await fetch("/api/auth/google");
      const config = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        clientId?: string | null;
      };
      if (!config.configured || !config.clientId) {
        // Keys are not set yet — show the owner's setup guide.
        setSetupRedirectUri(`${window.location.origin}/`);
        setSetupOpen(true);
        return;
      }

      const redirectUri = `${window.location.origin}/`;
      const state =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `st_${Math.random().toString(36).slice(2)}${Date.now()}`;
      try {
        sessionStorage.setItem(OAUTH_STATE_KEY, state);
      } catch {
        /* storage unavailable — flow still works, state check skipped */
      }

      const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
      authUrl.searchParams.set("client_id", config.clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "select_account");
      const redirect = authUrl.toString();

      // Google's consent page cannot render inside the preview iframe —
      // use a top-level navigation there, same-tab otherwise.
      if (typeof window !== "undefined" && window.self !== window.top) {
        window.open(redirect, "_blank", "noopener");
      } else {
        window.location.assign(redirect);
      }
    } catch {
      setGoogleError("Could not start Google sign-in. Please try again.");
    } finally {
      setGoogleBusy(false);
    }
  }

  /** After Google redirects back with ?code=…&state=…, finish the sign-in. */
  useEffect(() => {
    if (oauthHandled.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (!code && !oauthError) return;
    oauthHandled.current = true;

    // Clean the address bar immediately (code is single-use and should not linger).
    window.history.replaceState({}, "", window.location.pathname);

    if (oauthError === "access_denied") {
      setGoogleError("Google sign-in was cancelled. Nothing was shared.");
      return;
    }
    if (!code) {
      setGoogleError("Google sign-in failed. Please try again.");
      return;
    }

    // CSRF check — the state we sent must be the state we got back.
    let savedState: string | null = null;
    try {
      savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
    } catch {
      /* ignore */
    }
    if (savedState && state && savedState !== state) {
      setGoogleError("Sign-in could not be verified. Please try again.");
      return;
    }

    setGoogleBusy(true);
    void (async () => {
      const { user, error: authError } = await requestUser(
        "/api/auth/google",
        { code, redirectUri: `${window.location.origin}/` },
        "Google sign-in failed. Please try again."
      );
      setGoogleBusy(false);
      if (authError || !user) {
        setGoogleError(authError ?? "Google sign-in failed. Please try again.");
        return;
      }
      finishSignIn(user);
    })();
  }, [finishSignIn]);

  function copyRedirectUri() {
    if (!setupRedirectUri) return;
    void navigator.clipboard
      .writeText(setupRedirectUri)
      .then(() => {
        setCopied(true);
        toast.success("Redirect URI copied");
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast.error("Could not copy — long-press to copy manually"));
  }

  function enterGuest() {
    toast("Continuing as Guest — read-only preview");
    loginGuest();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* floating glass orbs */}
      <div aria-hidden className="pointer-events-none absolute left-[8%] top-[14%] h-40 w-40 rounded-3xl glass opacity-40 hs-float-soft" />
      <div aria-hidden className="pointer-events-none absolute right-[10%] top-[22%] h-24 w-24 rounded-full glass opacity-30 hs-float-soft" style={{ animationDelay: "-1.2s" }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[12%] left-[16%] h-28 w-28 rounded-2xl glass opacity-30 hs-float-soft" style={{ animationDelay: "-2.2s" }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[18%] right-[14%] h-16 w-16 rounded-full glass opacity-40 hs-float-soft" style={{ animationDelay: "-0.6s" }} />

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        {/* Brand side */}
        <div className="hidden flex-col gap-5 lg:flex">
          <HomeSyncMark size={56} />
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            One Home.{" "}
            <span className="text-gradient">One Family.</span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Sign in to your family&apos;s private space — calendar, tasks, groceries, care, a live
            satellite family map and an assistant that keeps the whole home in sync.
          </p>
          <ul className="space-y-2.5 text-sm">
            {[
              "Consent-based live family location on real satellite maps",
              "Everyone sees their own view — admin, parent, senior or kid",
              "Guest mode available for a quick look around",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-muted-foreground">
                <SparkleFloat className="mt-0.5 shrink-0 text-primary" size={18} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Card side */}
        <GlassCard strong specular className="p-6 sm:p-7">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <HomeSyncMark size={42} />
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-wide">HOME SYNC</p>
              <p className="text-[11px] text-muted-foreground">One Home. One Family.</p>
            </div>
          </div>

          <h2 className="text-xl font-bold tracking-tight">Welcome home</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your family account, or take the guest path.
          </p>

          <form onSubmit={signIn} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@homesync.app"
                  className="h-11 rounded-xl bg-background/50 pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  className="h-11 rounded-xl bg-background/50 pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="brand-gradient h-11 w-full rounded-xl text-white shadow-md">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? "Opening your home…" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void startGoogleSignIn()}
              disabled={googleBusy}
              aria-busy={googleBusy}
              className="h-11 w-full rounded-xl"
            >
              {googleBusy ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <GoogleIcon size={18} className="text-foreground" />
              )}
              {googleBusy ? "Talking to Google…" : "Continue with Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={enterGuest}
              className="h-11 w-full rounded-xl border-primary/40 text-primary hover:bg-primary/10"
            >
              <ShieldUserIcon size={18} />
              Continue as Guest
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">(read-only preview)</span>
            </Button>
          </div>

          {googleError ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              {googleError}
            </p>
          ) : null}

          {/* Family accounts — one tap to sign in */}
          <div className="mt-6">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <UsersRound className="h-3 w-3 text-primary" /> Family accounts
            </p>
            <p className="mb-2.5 text-[11px] text-muted-foreground">Tap your name to sign in instantly</p>
            <div className="grid grid-cols-2 gap-2">
              {FAMILY_ACCOUNTS.map((acc) => {
                const rowBusy = chipBusy === acc.email;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => void quickSignIn(acc)}
                    disabled={Boolean(chipBusy)}
                    aria-busy={rowBusy}
                    title={`Sign in as ${acc.name}`}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl border border-white/40 p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60 dark:border-white/10"
                    )}
                  >
                    {rowBusy ? (
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </span>
                    ) : (
                      <MemberAvatar name={acc.name} color={acc.color} role={acc.role} size={34} />
                    )}
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-xs font-semibold">{acc.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{acc.role}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setSetupRedirectUri(`${window.location.origin}/`);
                setSetupOpen(true);
              }}
              className="mx-auto mt-3 block text-[10px] font-medium text-muted-foreground/60 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Google sign-in setup
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Google setup guide — shown only when the server keys are missing */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="glass-strong max-w-md gap-3 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              Google sign-in setup
            </DialogTitle>
            <DialogDescription className="text-xs">
              HOME SYNC signs you in through Google&apos;s official, secure consent screen. If Google
              shows &ldquo;redirect_uri_mismatch&rdquo;, register exactly the address below in your
              Google Console and the sign-in works for every family member.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">1.</span>
              <span>
                Open{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                >
                  console.cloud.google.com
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and create a project (any name, e.g. &ldquo;HOME SYNC&rdquo;).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">2.</span>
              <span>OAuth consent screen → choose &ldquo;External&rdquo; → app name HOME SYNC → save.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">3.</span>
              <span>
                Credentials → <strong className="text-foreground">Create credentials → OAuth client ID</strong> →
                type <strong className="text-foreground">Web application</strong>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">4.</span>
              <span>
                Under <strong className="text-foreground">Authorized redirect URIs</strong> add exactly this address:
              </span>
            </li>
          </ol>

          <div className="glass-inset flex items-center gap-2 rounded-xl p-2.5">
            <code className="min-w-0 flex-1 truncate text-xs font-medium">{setupRedirectUri}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-lg px-2 text-xs"
              onClick={copyRedirectUri}
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Then copy the <strong className="text-foreground">Client ID</strong> and{" "}
            <strong className="text-foreground">Client secret</strong> it gives you and paste them to
            your assistant — they are added to the server and Google sign-in turns real instantly.
          </p>

          <Button
            type="button"
            className="brand-gradient h-10 w-full rounded-xl border-0 text-white"
            onClick={() => {
              setSetupOpen(false);
              void startGoogleSignIn();
            }}
          >
            I&apos;ve added the keys — try again
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
