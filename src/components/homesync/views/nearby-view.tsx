"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Coffee,
  Compass,
  Footprints,
  Globe,
  Hand,
  House,
  MapPin,
  Navigation,
  Pencil,
  Pill,
  School,
  Scissors,
  Search,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  UtensilsCrossed,
  Wrench,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Chip,
  EmptyState,
  GlassCard,
  PageLoader,
  SectionHeader,
  ViewTitle,
} from "@/components/homesync/glass";
import { placePins } from "@/components/homesync/family-map-data";
import { RadarSweep } from "@/components/homesync/icons";
import { useResource } from "@/lib/homesync/api";
import type { NearbyStore, StoreCategory } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";

interface StoresResponse {
  categories: StoreCategory[];
  stores: NearbyStore[];
}

/** Real satellite map (Leaflet) — loaded client-side only. */
const FamilyMap = dynamic(
  () => import("@/components/homesync/family-map").then((m) => m.FamilyMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    ),
  }
);

/** Vantage points (cosmetic — results are returned around the selected place). */
const PLACES: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "home", icon: House, label: "Home" },
  { key: "school", icon: School, label: "School" },
  { key: "office", icon: Building2, label: "Office" },
  { key: "clinic", icon: Stethoscope, label: "Clinic" },
  { key: "market", icon: ShoppingBasket, label: "Fresh Mart" },
];

const RADII: { value: string; label: string }[] = [
  { value: "0.5", label: "500 m" },
  { value: "1", label: "1 km" },
  { value: "3", label: "3 km" },
  { value: "5", label: "5 km" },
  { value: "10", label: "10 km" },
];

/** Singular category label for a store card (server returns plural labels for chips). */
const CATEGORY_LABELS: Record<string, string> = {
  grocery: "Grocery Shop",
  supermarket: "Supermarket",
  restaurant: "Restaurant",
  cafe: "Café",
  pharmacy: "Pharmacy",
  barber: "Barber",
  salon: "Salon",
  stationery: "Stationery",
  clinic: "Clinic",
  hardware: "Hardware",
  laundry: "Laundry",
};

/** Category key → Lucide icon (the API returns {key, label, count} only — no emoji). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  grocery: Store,
  supermarket: Building2,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  pharmacy: Pill,
  barber: Scissors,
  salon: Sparkles,
  stationery: Pencil,
  clinic: Stethoscope,
  hardware: Wrench,
  laundry: Shirt,
};

function categoryIcon(key: string): LucideIcon {
  return CATEGORY_ICONS[key] ?? Store;
}

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
}

function OpenStatusChip({ openNow }: { openNow: boolean | null }) {
  if (openNow === true) return <Chip tone="success">Open now</Chip>;
  if (openNow === false) return <Chip tone="danger">Closed</Chip>;
  return <Chip>Hours unknown</Chip>;
}

function StoreCard({ store }: { store: NearbyStore }) {
  const openDirections = () =>
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${store.name} ${store.address}`
      )}`,
      "_blank",
      "noopener,noreferrer"
    );

  return (
    <GlassCard hover className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{store.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CATEGORY_LABELS[store.category] ?? store.category}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone="brand">
            <MapPin className="h-3 w-3" /> {fmtDistance(store.distanceKm)}
          </Chip>
          <Chip>
            <Footprints className="h-3 w-3" /> ~{store.etaMins} min
          </Chip>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-semibold text-foreground/80">
          <Star className="h-3.5 w-3.5 fill-current" /> {store.rating.toFixed(1)}
        </span>
        <span className="text-[11px] text-muted-foreground">({store.reviews} reviews)</span>
        <OpenStatusChip openNow={store.openNow} />
      </div>
      <p
        className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted-foreground"
        title={store.address}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" /> {store.address}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={openDirections}>
          <Navigation className="h-4 w-4" /> Directions
        </Button>
        <Button
          size="sm"
          className="flex-1 brand-gradient border-0 text-white shadow-md"
          onClick={() =>
            toast.success("Request sent to family — someone can accept it from their app", {
              description: `${store.name} • ${fmtDistance(store.distanceKm)} away`,
            })
          }
        >
          <Hand className="h-4 w-4" /> Request help
        </Button>
      </div>
    </GlassCard>
  );
}

export function NearbyView() {
  const [place, setPlace] = useState("home");
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
    return `/api/stores?${params.toString()}`;
  }, [radiusKm, category, debouncedQ]);

  const { data, loading, error, refresh } = useResource<StoresResponse>(url);

  const categories = data?.categories ?? [];
  const stores = data?.stores ?? [];
  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);
  const isFiltered = Boolean(category || debouncedQ || radiusKm !== "5");
  const radiusLabel = RADII.find((r) => r.value === radiusKm)?.label ?? `${radiusKm} km`;

  const resetFilters = () => {
    setCategory(null);
    setQ("");
    setDebouncedQ("");
    setRadiusKm("5");
  };

  const chipBase =
    "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition";

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Nearby Services"
        sub="Shops, clinics and help around the places your family visits"
      />

      {/* Vantage points */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<MapPin className="h-4 w-4" />}
          title="Search around"
          sub="Results around the selected place"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PLACES.map((p) => {
            const PlaceIcon = p.icon;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlace(p.key)}
                aria-pressed={place === p.key}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition",
                  place === p.key
                    ? "brand-gradient border-0 text-white shadow-md"
                    : "glass-inset border-white/40 text-muted-foreground hover:text-foreground dark:border-white/10"
                )}
              >
                <PlaceIcon className="h-3.5 w-3.5" /> {p.label}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Controls */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                placeholder="Search by name or address…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Radius</Label>
            <Select value={radiusKm} onValueChange={setRadiusKm}>
              <SelectTrigger className="w-full sm:w-[120px]" aria-label="Search radius">
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
      </GlassCard>

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
        <PageLoader label="Finding places nearby…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* LEFT — map + categories */}
          <div className="space-y-4">
            <FamilyMap pins={placePins()} className="h-[300px] lg:h-[520px]" mapStyle="satellite" />

            <GlassCard className="p-4 sm:p-5">
              <SectionHeader
                icon={<RadarSweep size={16} />}
                title="Categories"
                sub={category ? "Tap the active category again to clear it" : "Filter by category"}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                  <Globe className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">All</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      category === null ? "bg-white/25" : "bg-muted"
                    )}
                  >
                    {totalCount}
                  </span>
                </button>
                {categories.map((c) => {
                  const active = category === c.key;
                  const CategoryIcon = categoryIcon(c.key);
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
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          active ? "bg-white/25" : "bg-muted"
                        )}
                      >
                        {c.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </GlassCard>
          </div>

          {/* RIGHT — results */}
          <div className="space-y-3 self-start lg:sticky lg:top-20">
            <GlassCard className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {stores.length} place{stores.length === 1 ? "" : "s"} • within {radiusLabel}
                </p>
                {isFiltered ? (
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    <RotateCcw /> Reset filters
                  </Button>
                ) : null}
              </div>

              {stores.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Search className="h-10 w-10" />}
                    title="No places found"
                    sub="Try a wider radius or another category"
                  />
                </div>
              ) : (
                <div className="mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1 scrollbar-slim lg:max-h-[560px]">
                  {stores.map((s) => (
                    <StoreCard key={s.id} store={s} />
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
