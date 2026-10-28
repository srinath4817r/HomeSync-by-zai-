"use client";

/**
 * Nearby Services — REAL place search.
 *
 * Results come from GET /api/nearby (server-side web search around a real
 * place name resolved from the family home coordinates). Only fields the
 * search genuinely returned are rendered: name, snippet, link. Distances,
 * ratings, reviews and opening hours are NOT available from web results, so
 * they are never shown — nothing is fabricated here.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Compass,
  Navigation,
  Pencil,
  Pill,
  RotateCcw,
  Scissors,
  Search,
  Shirt,
  Sparkles,
  Stethoscope,
  Store,
  UtensilsCrossed,
  Wrench,
  Building2,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, GlassCard, SectionHeader, ViewTitle } from "@/components/homesync/glass";
import { useResource } from "@/lib/homesync/api";
import { cn } from "@/lib/utils";

/** One real search result from GET /api/nearby. */
interface NearbyResult {
  id: string;
  name: string;
  category: string;
  address: string | null; // web search carries no structured address — null today
  snippet: string | null;
  link: string | null;
}

const RADII: { value: string; label: string }[] = [
  { value: "1", label: "1 km" },
  { value: "3", label: "3 km" },
  { value: "5", label: "5 km" },
  { value: "10", label: "10 km" },
];

const CATEGORIES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "grocery", label: "Grocery", icon: Store },
  { key: "supermarket", label: "Supermarket", icon: Building2 },
  { key: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { key: "cafe", label: "Café", icon: Coffee },
  { key: "pharmacy", label: "Pharmacy", icon: Pill },
  { key: "barber", label: "Barber", icon: Scissors },
  { key: "salon", label: "Salon", icon: Sparkles },
  { key: "stationery", label: "Stationery", icon: Pencil },
  { key: "clinic", label: "Clinic", icon: Stethoscope },
  { key: "hardware", label: "Hardware", icon: Wrench },
  { key: "laundry", label: "Laundry", icon: Shirt },
];

const chipBase =
  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition";

function ResultSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <GlassCard key={i} className="p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-2/5 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded-md bg-muted" />
          <div className="mt-1.5 h-3 w-3/5 animate-pulse rounded-md bg-muted" />
        </GlassCard>
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: NearbyResult }) {
  const destination = encodeURIComponent(
    [result.name, result.address].filter(Boolean).join(", ")
  );
  const openDirections = () =>
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      "_blank",
      "noopener,noreferrer"
    );

  return (
    <GlassCard hover className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {result.link ? (
            <a
              href={result.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 truncate text-sm font-semibold hover:text-primary hover:underline"
              title={`Open ${result.name}`}
            >
              <span className="truncate">{result.name}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            </a>
          ) : (
            <p className="truncate text-sm font-semibold">{result.name}</p>
          )}
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {CATEGORIES.find((c) => c.key === result.category)?.label ?? result.category}
          </p>
        </div>
      </div>
      {result.snippet ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {result.snippet}
        </p>
      ) : null}
      <div className="mt-3">
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={openDirections}>
          <Navigation className="h-4 w-4" /> Directions
        </Button>
      </div>
    </GlassCard>
  );
}

export function NearbyView() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [radiusKm, setRadiusKm] = useState("5");
  const [category, setCategory] = useState<string | null>(null);

  // Debounce search so typing does not hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = useMemo(() => {
    const params = new URLSearchParams({ radiusKm });
    if (category) params.set("category", category);
    if (debouncedQ) params.set("q", debouncedQ);
    return `/api/nearby?${params.toString()}`;
  }, [radiusKm, category, debouncedQ]);

  const { data, loading, error, refresh } = useResource<{ results: NearbyResult[] }>(url);
  const results = useMemo(() => (Array.isArray(data?.results) ? data.results : []), [data]);
  const isFiltered = Boolean(category || debouncedQ);

  const resetFilters = () => {
    setCategory(null);
    setQ("");
    setDebouncedQ("");
  };

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Nearby Services"
        sub="Live web search for shops, clinics and services around your home"
      />

      {/* Search controls */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<Compass className="h-4 w-4" />}
          title="Search places"
          sub="Real results from live web search around your home"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="nearby-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="nearby-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search shops and services by name…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Search area</Label>
            <Select value={radiusKm} onValueChange={setRadiusKm}>
              <SelectTrigger className="w-full sm:w-[130px]" aria-label="Search area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADII.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Compass className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Distances, ratings and opening hours aren&apos;t shown — web search results don&apos;t carry
          reliable data for them.
        </p>
      </GlassCard>

      {/* Category chips */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<Store className="h-4 w-4" />}
          title="Categories"
          sub={category ? "Tap the active category again to clear it" : "Filter by category"}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={cn(
              chipBase,
              category === null
                ? "brand-gradient border-0 text-white shadow-md"
                : "glass-inset border-white/40 hover:border-primary/40 dark:border-white/10"
            )}
          >
            <Compass className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">All nearby</span>
          </button>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            const CategoryIcon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(active ? null : c.key)}
                aria-pressed={active}
                className={cn(
                  chipBase,
                  active
                    ? "brand-gradient border-0 text-white shadow-md"
                    : "glass-inset border-white/40 hover:border-primary/40 dark:border-white/10"
                )}
              >
                <CategoryIcon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{c.label}</span>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Results */}
      {error ? (
        <GlassCard className="p-4 sm:p-5">
          <EmptyState
            icon={<Compass className="h-10 w-10" />}
            title="Could not load nearby places"
            sub={error}
          />
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={refresh}>
              <RotateCcw /> Try again
            </Button>
          </div>
        </GlassCard>
      ) : loading && !data ? (
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Searching nearby…</p>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
          <div className="mt-3">
            <ResultSkeleton />
          </div>
        </GlassCard>
      ) : results.length === 0 ? (
        <GlassCard className="p-4 sm:p-5">
          <EmptyState
            icon={<Search className="h-10 w-10" />}
            title="No results here yet — try another category"
            sub={
              isFiltered
                ? "Nothing matched this filter. Try a different category or search term."
                : "Search for a shop or service by name above."
            }
          />
          {isFiltered ? (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={resetFilters}>
                <RotateCcw /> Reset filters
              </Button>
            </div>
          ) : null}
        </GlassCard>
      ) : (
        <GlassCard className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {results.length} result{results.length === 1 ? "" : "s"}
              {category ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  • {CATEGORIES.find((c) => c.key === category)?.label ?? category}
                </span>
              ) : null}
              {debouncedQ ? (
                <span className="font-normal text-muted-foreground"> • “{debouncedQ}”</span>
              ) : null}
            </p>
            {isFiltered ? (
              <Button size="sm" variant="outline" onClick={resetFilters}>
                <RotateCcw /> Reset filters
              </Button>
            ) : null}
          </div>
          <div
            className={cn(
              "scrollbar-slim mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1 transition-opacity lg:max-h-[560px]",
              loading && "pointer-events-none opacity-50"
            )}
          >
            {results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
