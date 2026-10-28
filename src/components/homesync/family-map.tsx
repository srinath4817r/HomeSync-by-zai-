"use client";

/**
 * SSR-safe shell for the family map.
 *
 * Leaflet / react-leaflet touch `window` at module top-level, so the actual
 * implementation lives in ./family-map-inner and is ONLY loaded through
 * next/dynamic with ssr:false here. This file itself imports no leaflet code
 * and can safely render during SSR (it just emits the loading skeleton).
 */

import dynamic from "next/dynamic";
import type { FamilyMapProps } from "./family-map-data";

export type { MapStyle } from "./family-map-data";

const FamilyMapInner = dynamic(
  () => import("./family-map-inner").then((m) => m.FamilyMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-2xl">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    ),
  }
);

export function FamilyMap(props: FamilyMapProps) {
  return <FamilyMapInner {...props} />;
}
