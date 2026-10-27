import { NextResponse } from "next/server";
import { ensureSeed } from "@/lib/homesync/seed";
import type { WeatherIconKey } from "@/lib/homesync/types";

export const dynamic = "force-dynamic";

/** GET /api/weather — demo weather widget data; day labels computed from real dates. */
export async function GET() {
  try {
    await ensureSeed();

    const base: { highC: number; lowC: number; icon: WeatherIconKey }[] = [
      { highC: 30, lowC: 26, icon: "partly" },
      { highC: 31, lowC: 27, icon: "sunny" },
      { highC: 29, lowC: 25, icon: "rain" },
      { highC: 30, lowC: 26, icon: "partly" },
    ];
    const forecast = base.map((f, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return { ...f, day: d.toLocaleDateString("en-US", { weekday: "short" }) };
    });

    return NextResponse.json({
      city: "Chennai",
      tempC: 28,
      condition: "Partly Cloudy",
      icon: "partly" as WeatherIconKey,
      forecast,
      demo: true,
    });
  } catch (e) {
    console.error("GET /api/weather failed:", e);
    return NextResponse.json({ error: "Failed to load weather" }, { status: 500 });
  }
}
