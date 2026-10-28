import { NextRequest, NextResponse } from "next/server";
import type { WeatherIconKey } from "@/lib/homesync/types";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
  };
}

/** Map WMO weather codes to our icon set. */
function iconForCode(code: number | undefined): WeatherIconKey {
  if (code === undefined) return "partly";
  if (code === 0) return "sunny";
  if ([1, 2, 3, 45, 48].includes(code)) return code <= 2 ? "partly" : "cloudy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "cloudy";
  if ([95, 96, 99].includes(code)) return "storm";
  return "partly";
}

const CONDITION_LABEL: Record<WeatherIconKey, string> = {
  sunny: "Clear sky",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  rain: "Rain",
  storm: "Thunderstorm",
};

/**
 * GET /api/weather?lat=&lng= — REAL current weather + 4-day forecast from
 * Open-Meteo (free, no key). Location comes from the family's saved home
 * coordinates; without them the client shows an honest setup prompt.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const params = req.nextUrl.searchParams;
  const family = await db.family.findUnique({ where: { id: ctx.familyId } });
  const lat = Number.isFinite(Number(params.get("lat"))) && params.get("lat")
    ? Number(params.get("lat"))
    : family?.homeLat;
  const lng = Number.isFinite(Number(params.get("lng"))) && params.get("lng")
    ? Number(params.get("lng"))
    : family?.homeLng;

  if (lat === null || lng === null || lat === undefined || lng === undefined) {
    return NextResponse.json(
      { error: "Set your home location in family settings to see real weather." },
      { status: 404 }
    );
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");
    url.searchParams.set("forecast_days", "5");
    url.searchParams.set("timezone", family?.timezone ?? "auto");

    const res = await fetch(url.toString(), { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;

    const currentIcon = iconForCode(data.current?.weather_code);
    const forecast = (data.daily?.time ?? []).slice(0, 4).map((day, i) => ({
      day: new Date(day).toLocaleDateString("en-US", { weekday: "short" }),
      highC: Math.round(data.daily?.temperature_2m_max?.[i] ?? 0),
      lowC: Math.round(data.daily?.temperature_2m_min?.[i] ?? 0),
      icon: iconForCode(data.daily?.weather_code?.[i]),
    }));

    return NextResponse.json({
      city: family?.homeLabel ?? "Home",
      tempC: Math.round(data.current?.temperature_2m ?? 0),
      condition: CONDITION_LABEL[currentIcon],
      icon: currentIcon,
      forecast,
      demo: false,
    });
  } catch (e) {
    console.error("GET /api/weather failed:", e);
    return NextResponse.json({ error: "Could not load the weather right now." }, { status: 502 });
  }
}

