"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassCard } from "@/components/homesync/glass";
import {
  GoogleIcon,
  HomeSyncMark,
  SparkleFloat,
} from "@/components/homesync/icons";
import { useSession } from "@/lib/homesync/session";

/**
 * Liquid glass sign-in — REAL Google OAuth only.
 * Guest mode, demo accounts and password sign-in were removed:
 * every household member signs in with their own verified Google account.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_STATE_KEY = "homesync-oauth-state";

export function LoginScreen() {
  const applyAuth = useSession((s) => s.applyAuth);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupRedirectUri, setSetupRedirectUri] = useState("");
  const [copied, setCopied] = useState(false);
  /** Guards the redirect-handling effect against double runs (React strict mode). */
  const oauthHandled = useRef(false);

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

    // Clean the address bar immediately (the code is single-use).
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
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri: `${window.location.origin}/` }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          user?: { id: string; name: string; email: string; photoUrl: string | null };
          membership?: { role: string; status: string; familyId: string } | null;
          error?: string;
        };
        if (!res.ok || !data.user) {
          setGoogleError(data.error ?? "Google sign-in failed. Please try again.");
          return;
        }
        toast.success(`Welcome home, ${data.user.name}`);
        applyAuth({ user: data.user, membership: data.membership ?? null });
      } catch {
        setGoogleError("Could not reach the home server. Please try again.");
      } finally {
        setGoogleBusy(false);
      }
    })();
  }, [applyAuth]);

  const copyRedirectUri = useCallback(() => {
    if (!setupRedirectUri) return;
    void navigator.clipboard
      .writeText(setupRedirectUri)
      .then(() => {
        setCopied(true);
        toast.success("Redirect URI copied");
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast.error("Could not copy — long-press to copy manually"));
  }, [setupRedirectUri]);

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
            Your family&apos;s private space — calendar, tasks, groceries, care, a live
            family map and an assistant that keeps the whole home in sync.
          </p>
          <ul className="space-y-2.5 text-sm">
            {[
              "Consent-based live family location on real maps",
              "Everyone sees their own view — admin, parent, senior or kid",
              "Your household data stays private and permissive by role",
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
            Sign in with your Google account — every family member uses their own.
          </p>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void startGoogleSignIn()}
              disabled={googleBusy}
              aria-busy={googleBusy}
              className="h-12 w-full rounded-xl"
            >
              {googleBusy ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <GoogleIcon size={18} className="text-foreground" />
              )}
              {googleBusy ? "Talking to Google…" : "Continue with Google"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Secured by Google. We only see your name, email and profile photo.
              New here? You&apos;ll create your home or join with an invite code right after.
            </p>
          </div>

          {googleError ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              {googleError}
            </p>
          ) : null}
        </GlassCard>
      </div>

      {/* Google setup guide — shown when the server keys are missing */}
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
