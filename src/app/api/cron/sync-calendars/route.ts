import { NextResponse, type NextRequest } from "next/server";

import { syncDueCalendars } from "@/lib/calendar/sync";

// Background re-sync. Pulls fresh events for every calendar that's gone stale,
// keeping each group's heatmap current without anyone opening the app
// (DATA-MODEL §6 — background re-sync). Protect with CRON_SECRET and point a
// scheduler at it: Vercel Cron (vercel.json), GitHub Actions, or any external
// pinger sending `Authorization: Bearer <CRON_SECRET>`.
//
// Runs on Node (the service-role worker is server-only). Force dynamic so it's
// never statically cached. maxDuration is capped at 60s on Vercel's Hobby (free)
// plan — syncs run sequentially, so if the user base ever outgrows a 60s window,
// batch the work (the sync is idempotent, so a partial run just catches up next
// time). On Hobby the cron itself can only fire once/day (see docs/GOOGLE-SETUP).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { synced, results } = await syncDueCalendars();
  const failed = results.filter((r) => !r.result.ok).length;
  return NextResponse.json({ synced, failed });
}

// Support both GET (Vercel Cron uses GET) and POST (manual / external pingers).
export const GET = handle;
export const POST = handle;
