"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";
import { Baby, Crown, Glasses, UserRound, ShieldCheck } from "lucide-react";
import { EmptyIllustration } from "./icons";

/* ---------- Glass surfaces ---------- */

export function GlassCard({
  className,
  strong,
  hover,
  specular,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  strong?: boolean;
  hover?: boolean;
  specular?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl",
        strong ? "glass-strong" : "glass",
        hover && "glass-hover",
        specular && "glass-specular",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  sub,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl brand-gradient text-white text-sm shadow-md [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight">{title}</h3>
          {sub ? <p className="truncate text-xs text-muted-foreground leading-tight">{sub}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------- Avatars (role-first — no emojis in HOME SYNC) ---------- */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Role icon used inside avatars for members without a photo. */
function RoleGlyph({ role, size }: { role: string; size: number }) {
  const px = Math.max(12, Math.round(size * 0.52));
  const cls = "shrink-0";
  switch (role) {
    case "Family Admin":
      return <Crown className={cls} style={{ width: px, height: px }} aria-hidden />;
    case "Parent":
      return <UserRound className={cls} style={{ width: px, height: px }} aria-hidden />;
    case "Senior Member":
      return <Glasses className={cls} style={{ width: px, height: px }} aria-hidden />;
    case "Child":
      return <Baby className={cls} style={{ width: px, height: px }} aria-hidden />;
    case "Guest":
      return <ShieldCheck className={cls} style={{ width: px, height: px }} aria-hidden />;
    default:
      return <span style={{ fontSize: Math.max(9, size * 0.34), fontWeight: 700 }}>{initialsOf(role)}</span>;
  }
}

export function MemberAvatar({
  name,
  color,
  role,
  photoUrl,
  size = 40,
  ring,
  className,
  title,
}: {
  name: string;
  color: string;
  role?: string; // when given, shows the role avatar instead of initials
  photoUrl?: string | null; // real photo (e.g. Google profile) — falls back to role glyph
  size?: number;
  ring?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? (role ? `${name} • ${role}` : name)}
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full border border-white/60 text-white shadow-sm select-none dark:border-white/15",
        ring && "ring-2 ring-primary/60 ring-offset-2 ring-offset-transparent",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color}b3)`,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : role ? <RoleGlyph role={role} size={size} /> : (
        <span
          style={{ fontSize: Math.max(10, size * 0.36), letterSpacing: "0.02em", fontWeight: 700 }}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}

/* ---------- Small UI atoms ---------- */

export function Chip({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground border-white/40 dark:border-white/10",
    brand: "bg-primary/12 text-primary border-primary/30",
    success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    danger: "bg-red-500/12 text-red-600 dark:text-red-400 border-red-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <GlassCard
      hover={Boolean(onClick)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn("flex flex-col gap-1.5 p-4 cursor-default", onClick && "cursor-pointer", className)}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl brand-gradient text-white shadow-md [&_svg]:h-4 [&_svg]:w-4"
        aria-hidden
      >
        {icon}
      </span>
      <div className="text-2xl font-bold leading-none tracking-tight">{value}</div>
      <div className="text-xs font-medium">{label}</div>
      {sub ? <div className="text-[11px] text-muted-foreground leading-tight">{sub}</div> : null}
    </GlassCard>
  );
}

export function EmptyState({
  title,
  sub,
  icon,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
      {icon ? (
        <span className="[&_svg]:h-10 [&_svg]:w-10 text-primary">{icon}</span>
      ) : (
        <EmptyIllustration size={72} />
      )}
      <p className="text-sm font-medium">{title}</p>
      {sub ? <p className="max-w-xs text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function ViewTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ---------- Priority dot ---------- */

export function PriorityDot({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-emerald-500",
  };
  return (
    <span
      title={`${priority} priority`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", map[priority] ?? "bg-muted-foreground")}
    />
  );
}
