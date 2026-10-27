"use client";

import { cn } from "@/lib/utils";
import type { MapPin } from "@/lib/homesync/types";

/**
 * Stylized vector city map (no external tiles needed).
 * Coordinates are 0-100 relative; pins render emoji badges.
 */
export function FamilyMapCanvas({
  pins,
  className,
  activePinId,
  onPinClick,
}: {
  pins: MapPin[];
  className?: string;
  activePinId?: string | null;
  onPinClick?: (pin: MapPin) => void;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/50 dark:border-white/10", className)}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* base */}
        <rect width="100" height="62" className="fill-emerald-50/80 dark:fill-slate-800/40" />
        {/* park */}
        <path d="M2 40 Q14 34 24 40 T28 56 Q16 60 6 54 Z" className="fill-emerald-300/50 dark:fill-emerald-700/30" />
        <circle cx="15" cy="47" r="1" className="fill-emerald-600/40" />
        <circle cx="19" cy="50" r="0.8" className="fill-emerald-600/40" />
        {/* water */}
        <path d="M78 0 L100 0 L100 22 Q88 26 80 14 Z" className="fill-sky-300/40 dark:fill-sky-700/25" />
        {/* blocks */}
        {[
          [8, 6], [20, 4], [32, 8], [44, 5], [56, 9], [68, 4],
          [10, 20], [22, 18], [36, 20], [50, 19], [62, 21],
          [8, 30], [20, 28], [34, 30], [48, 29], [60, 31], [72, 28],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={i % 3 === 0 ? 9 : 7}
            height={i % 2 === 0 ? 6 : 5}
            rx="1.4"
            className="fill-slate-200/70 dark:fill-slate-600/25"
          />
        ))}
        {/* roads */}
        <g className="stroke-white/90 dark:stroke-slate-500/40" strokeWidth="2.4" strokeLinecap="round">
          <line x1="0" y1="16" x2="100" y2="16" />
          <line x1="0" y1="37" x2="100" y2="37" />
          <line x1="30" y1="0" x2="30" y2="62" />
          <line x1="58" y1="0" x2="58" y2="62" />
          <line x1="82" y1="16" x2="82" y2="62" />
        </g>
        <g className="stroke-amber-400/70" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4 3">
          <line x1="30" y1="16" x2="58" y2="16" />
          <line x1="58" y1="16" x2="58" y2="37" />
          <line x1="58" y1="37" x2="82" y2="37" />
        </g>
      </svg>

      {/* pins */}
      {pins.map((p) => {
        const active = p.id === activePinId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPinClick?.(p)}
            aria-label={`${p.label} — ${p.sublabel ?? ""}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {p.kind === "member" ? (
              <span
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-base shadow-lg transition-transform group-hover:scale-110 dark:border-slate-900",
                  active && "scale-110 ring-2 ring-violet-500"
                )}
                style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}99)` }}
              >
                {p.emoji}
                {p.sharing && !p.stale ? (
                  <span className="pulse-ring absolute inset-0 rounded-full" />
                ) : null}
                {p.stale ? (
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400 dark:border-slate-900" title="Location may be stale" />
                ) : null}
              </span>
            ) : (
              <span
                className={cn(
                  "flex h-7 items-center gap-1 rounded-full glass-strong px-2 text-[11px] font-semibold shadow-md transition-transform group-hover:scale-105",
                  active && "ring-2 ring-violet-500"
                )}
              >
                <span aria-hidden>{p.emoji}</span>
                {p.label}
              </span>
            )}
          </button>
        );
      })}

      {/* home marker center card */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full glass-strong px-2.5 py-1 text-[11px] font-semibold shadow">
        🏠 Home • 123 Green Park, Chennai
      </div>
      <div className="absolute right-2 top-2 rounded-full glass px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
        Demo map
      </div>
    </div>
  );
}

/** Default saved places + demo member pin positions. */
export function basePlacePins(): MapPin[] {
  return [
    { id: "place-home", kind: "place", label: "Home", emoji: "🏠", color: "#7c5cff", x: 44, y: 44 },
    { id: "place-school", kind: "place", label: "School", sublabel: "Sunrise Intl.", emoji: "🏫", color: "#34d399", x: 70, y: 24 },
    { id: "place-office", kind: "place", label: "Office", sublabel: "T. Nagar", emoji: "🏢", color: "#38bdf8", x: 24, y: 22 },
    { id: "place-hospital", kind: "place", label: "Clinic", sublabel: "Apollo", emoji: "🏥", color: "#fb7185", x: 82, y: 50 },
    { id: "place-market", kind: "place", label: "Fresh Mart", emoji: "🛒", color: "#fbbf24", x: 15, y: 52 },
  ];
}
