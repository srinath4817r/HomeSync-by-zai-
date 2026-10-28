"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Home,
  MapPin,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/homesync/glass";
import { HomeSyncMark } from "@/components/homesync/icons";
import { apiSend } from "@/lib/homesync/api";
import { useSession } from "@/lib/homesync/session";
import type { FamilyInfo } from "@/lib/homesync/types";

/**
 * Post-sign-in onboarding — REAL household setup.
 * 1. Create your home (creator becomes Family Admin — decided by the server).
 * 2. or Join an existing home with an invite code (goes to the admin for approval).
 * No demo household exists; an empty app shows honest empty states.
 */

function useRadiusDefaults() {
  // Rough India-centric defaults; the user can fine-tune later in settings.
  return { lat: 13.0827, lng: 80.2707 };
}

export function OnboardingCreate() {
  const user = useSession((s) => s.user);
  const setFamily = useSession((s) => s.setFamily);
  const hydrate = useSession((s) => s.hydrate);

  const [name, setName] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [capacity, setCapacity] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaults = useRadiusDefaults();

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ family: FamilyInfo }>("/api/family", "POST", {
        name,
        homeLabel: homeLabel || undefined,
        homeLat: defaults.lat,
        homeLng: defaults.lng,
        capacity,
      });
      toast.success(`Welcome home, ${user?.name ?? "family"}`);
      setFamily(res.family);
      await hydrate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your family.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute left-[10%] top-[16%] h-32 w-32 rounded-3xl glass opacity-40 hs-float-soft" />
      <div aria-hidden className="pointer-events-none absolute bottom-[14%] right-[12%] h-24 w-24 rounded-full glass opacity-30 hs-float-soft" style={{ animationDelay: "-1.6s" }} />

      <GlassCard strong specular className="w-full max-w-md p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <HomeSyncMark size={44} />
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-wide">Set up your home</p>
            <p className="text-[11px] text-muted-foreground">Signed in as {user?.email}</p>
          </div>
        </div>

        <h2 className="text-lg font-bold tracking-tight">Create your family space</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          You become the Family Admin. Invite the household with a code right after.
        </p>

        <form onSubmit={createFamily} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fam-name">Family name</Label>
            <div className="relative">
              <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fam-name"
                required
                maxLength={60}
                placeholder="e.g. The Sharma Home"
                className="h-11 rounded-xl bg-background/50 pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fam-home">Home label (optional)</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fam-home"
                maxLength={80}
                placeholder="e.g. 24 Lakeview Avenue"
                className="h-11 rounded-xl bg-background/50 pl-9"
                value={homeLabel}
                onChange={(e) => setHomeLabel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fam-cap">Member capacity</Label>
            <Input
              id="fam-cap"
              type="number"
              min={1}
              max={24}
              className="h-11 rounded-xl bg-background/50"
              value={capacity}
              onChange={(e) => setCapacity(Math.max(1, Math.min(24, Number(e.target.value) || 8)))}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={busy} className="brand-gradient h-11 w-full rounded-xl text-white shadow-md">
            {busy ? <Home className="h-4 w-4 animate-pulse" /> : <Home className="h-4 w-4" />}
            {busy ? "Building your home…" : "Create our home"}
          </Button>
        </form>

        <JoinByCode />
      </GlassCard>
    </div>
  );
}

export function JoinByCode() {
  const hydrate = useSession((s) => s.hydrate);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiSend<{ status: string; message?: string }>("/api/family/join", "POST", {
        code: code.trim(),
      });
      if (res.status === "active") {
        toast.success("You're in. Opening your home…");
        await hydrate();
      } else {
        setMessage(res.message ?? "Request sent. Waiting for admin approval.");
        setCode("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join with that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Joining an existing home?
      </p>
      <form onSubmit={join} className="flex items-center gap-2">
        <Input
          aria-label="Invite code"
          placeholder="Invite code, e.g. HMK7-QX2P"
          className="h-10 flex-1 rounded-xl bg-background/50 font-mono text-sm uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={9}
          required
        />
        <Button type="submit" variant="outline" disabled={busy} className="h-10 rounded-xl px-4 text-sm">
          {busy ? <Clock3 className="h-4 w-4 animate-spin" /> : null}
          Join
        </Button>
      </form>
      {message ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shown while a join request waits for admin approval. */
export function PendingApproval() {
  const logout = useSession((s) => s.logout);
  const user = useSession((s) => s.user);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute left-[14%] top-[20%] h-28 w-28 rounded-3xl glass opacity-40 hs-float-soft" />
      <div aria-hidden className="pointer-events-none absolute bottom-[18%] right-[16%] h-20 w-20 rounded-full glass opacity-30 hs-float-soft" style={{ animationDelay: "-1.4s" }} />

      <GlassCard strong specular className="w-full max-w-md p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient text-white shadow-md">
          <Clock3 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Waiting for approval</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Your request to join the family is with the Family Admin.
          You&apos;ll see your home the moment they approve you{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
        </p>
        <Button variant="outline" onClick={() => void logout()} className="mt-6 h-10 rounded-xl">
          Sign out
        </Button>
      </GlassCard>
    </div>
  );
}

/** Compact helper: shows an invite code with copy (used post-creation too). */
export function InviteCodeRow({ code }: { code: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(() => toast.success("Invite code copied"));
      }}
      className="glass-inset flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-mono text-sm font-semibold tracking-widest transition-colors hover:bg-accent/60"
      title="Copy invite code"
    >
      {code}
      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}
