"use client";

import { cn } from "@/lib/utils";
import type { WeatherIconKey } from "@/lib/homesync/types";

/**
 * HOME SYNC animated SVG library.
 * Pure hand-built SVG icons with CSS animations — no emojis anywhere in the app.
 * All colors derive from currentColor or explicit props so they adapt to theme.
 */

/* ---------------- Animated logo mark ---------------- */

export function HomeSyncMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span className="logo-pulse absolute inset-0 rounded-2xl" aria-hidden />
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className="relative">
        <defs>
          <linearGradient id="hs-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.38 0.014 255)" />
            <stop offset="100%" stopColor="oklch(0.5 0.016 255)" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#hs-logo-g)" />
        <rect x="1" y="1" width="46" height="46" rx="13" fill="none" stroke="oklch(1 0 0 / 35%)" strokeWidth="1" />
        {/* roof */}
        <path d="M12 24.5 24 14l12 10.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* body */}
        <path d="M15.5 23v9.5a1.8 1.8 0 0 0 1.8 1.8h13.4a1.8 1.8 0 0 0 1.8-1.8V23" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
        {/* heart beat line inside home */}
        <path d="M20 29h2.2l1.6-3.4 2.4 5 1.6-2.6H28" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hs-heartbeat-path" />
      </svg>
    </span>
  );
}

/* ---------------- Weather (animated) ---------------- */

function SunCore({ cx = 24, cy = 22, r = 8 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g className="hs-sun-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r} fill="oklch(0.84 0.16 85)" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = cx + Math.cos(a) * (r + 3);
        const y1 = cy + Math.sin(a) * (r + 3);
        const x2 = cx + Math.cos(a) * (r + 6.5);
        const y2 = cy + Math.sin(a) * (r + 6.5);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="oklch(0.8 0.16 80)" strokeWidth="2.6" strokeLinecap="round" />
        );
      })}
    </g>
  );
}

function CloudShape({ x = 0, y = 0, scale = 1, opacity = 1, className }: { x?: number; y?: number; scale?: number; opacity?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} className={className}>
      <path
        d="M18 30a6 6 0 0 1 .8-11.9A8.5 8.5 0 0 1 35 19.4 5.4 5.4 0 0 1 34.4 30H18z"
        fill="oklch(0.86 0.02 260)"
      />
    </g>
  );
}

export function WeatherAnimated({ icon, className }: { icon: WeatherIconKey; className?: string }) {
  return (
    <svg viewBox="0 0 48 44" className={cn("h-10 w-10", className)} aria-hidden>
      {icon === "sunny" && <SunCore cx={24} cy={22} r={9} />}
      {icon === "partly" && (
        <>
          <SunCore cx={28} cy={16} r={6.5} />
          <CloudShape x={2} y={8} scale={0.95} className="hs-cloud-drift" />
        </>
      )}
      {icon === "cloudy" && (
        <>
          <CloudShape x={-2} y={2} scale={0.7} opacity={0.55} className="hs-cloud-drift-back" />
          <CloudShape x={4} y={9} scale={0.95} className="hs-cloud-drift" />
        </>
      )}
      {icon === "rain" && (
        <>
          <CloudShape x={4} y={2} scale={0.9} className="hs-cloud-drift" />
          <g stroke="oklch(0.66 0.15 240)" strokeWidth="2.6" strokeLinecap="round">
            <line x1="18" y1="32" x2="16.4" y2="38" className="hs-drop d1" />
            <line x1="25" y1="32" x2="23.4" y2="38" className="hs-drop d2" />
            <line x1="32" y1="32" x2="30.4" y2="38" className="hs-drop d3" />
          </g>
        </>
      )}
      {icon === "storm" && (
        <>
          <CloudShape x={4} y={2} scale={0.9} className="hs-cloud-drift" />
          <path d="M25 30l-5.4 7h4l-2.2 6 7.4-9h-4.4l2.6-4z" fill="oklch(0.85 0.18 95)" className="hs-bolt" />
        </>
      )}
    </svg>
  );
}

/* ---------------- Live / connection ---------------- */

export function LivePing({ className, color = "oklch(0.72 0.17 150)" }: { className?: string; color?: string }) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)} aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full opacity-75 hs-live-ring" style={{ background: color }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

/* ---------------- Map pin (animated) ---------------- */

export function AnimatedPin({ color = "#7c5cff", className }: { color?: string; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-8 w-8 items-center justify-center", className)} aria-hidden>
      <span className="pin-ripple absolute bottom-0 h-4 w-4 rounded-full" style={{ background: `${color}55` }} />
      <svg viewBox="0 0 24 24" className="hs-pin-bounce relative h-7 w-7 drop-shadow-md">
        <path
          d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z"
          fill={color}
          stroke="white"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="10" r="2.6" fill="white" />
      </svg>
    </span>
  );
}

/* ---------------- Check draw (success) ---------------- */

export function CheckDraw({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} className={className} aria-hidden>
      <circle cx="26" cy="26" r="23" fill="none" stroke="oklch(0.72 0.17 150)" strokeWidth="3" className="hs-check-circle" />
      <path d="M15 27l7.5 7.5L37 20" fill="none" stroke="oklch(0.72 0.17 150)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="hs-check-mark" />
    </svg>
  );
}

/* ---------------- Radar sweep (nearby) ---------------- */

export function RadarSweep({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <circle cx="24" cy="24" r="5" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
      <g className="hs-radar">
        <path d="M24 24 L24 3 A21 21 0 0 1 42 14 Z" fill="currentColor" opacity="0.28" />
      </g>
      <circle cx="31" cy="17" r="1.8" fill="currentColor" className="hs-twinkle" />
      <circle cx="16" cy="30" r="1.8" fill="currentColor" className="hs-twinkle t2" />
    </svg>
  );
}

/* ---------------- Heart pulse (care) ---------------- */

export function HeartPulseLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 28" className={cn("h-7 w-16", className)} aria-hidden>
      <path
        d="M2 16h10l4-9 6 16 5-11 3 4h8l4-6 4 6h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hs-ecg"
      />
    </svg>
  );
}

/* ---------------- Sparkles ---------------- */

export function SparkleFloat({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M12 2l2.2 6.4L20.5 11l-6.3 2.6L12 20l-2.2-6.4L3.5 11l6.3-2.6L12 2z" fill="currentColor" className="hs-twinkle" />
      <path d="M19 15l1 2.6 2.6 1-2.6 1L19 22l-1-2.4-2.6-1 2.6-1 1-2.6z" fill="currentColor" opacity="0.7" className="hs-twinkle t2" />
    </svg>
  );
}

/* ---------------- Empty state illustration ---------------- */

export function EmptyIllustration({ className, size = 64 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 96 72" width={size} height={(size * 72) / 96} className={className} aria-hidden>
      <defs>
        <linearGradient id="hs-empty-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.5 0.014 255)" stopOpacity="0.65" />
          <stop offset="100%" stopColor="oklch(0.65 0.012 255)" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="62" rx="30" ry="5" fill="currentColor" opacity="0.12" />
      <path d="M28 40 L48 30 L68 40 L68 52 a4 4 0 0 1 -4 4 H32 a4 4 0 0 1 -4 -4 Z" fill="url(#hs-empty-g)" className="hs-float-soft" />
      <path d="M28 40 L48 30 L68 40" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="hs-float-soft" />
      <circle cx="18" cy="34" r="3" fill="currentColor" opacity="0.45" className="hs-twinkle" />
      <circle cx="80" cy="26" r="2.4" fill="currentColor" opacity="0.4" className="hs-twinkle t2" />
      <circle cx="72" cy="54" r="2" fill="currentColor" opacity="0.35" className="hs-twinkle t3" />
    </svg>
  );
}

/* ---------------- Guest / shield ---------------- */

export function ShieldUserIcon({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 17c.8-2.2 2.5-3.4 4.5-3.4s3.7 1.2 4.5 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Google mark (monochrome, minimalist) ---------------- */

export function GoogleIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d="M21.6 12.23c0-.68-.06-1.36-.19-2.02H12v3.83h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.74 2.97-4.3 2.97-7.33z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.6-4.12H3.08v2.58A10 10 0 0 0 12 22z"
        fill="currentColor"
        opacity="0.72"
      />
      <path
        d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.08a10 10 0 0 0 0 8.96l3.32-2.58z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.97 9.97 0 0 0 12 2 10 10 0 0 0 3.08 7.52L6.4 10.1c.8-2.36 3-4.12 5.6-4.12z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}
