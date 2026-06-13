import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/server/leaderboard";

export const revalidate = 30; // cache 30 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 50);

  try {
    const { entries, periodNumber } = await getLeaderboard(limit);
    return NextResponse.json({ periodNumber, entries, count: entries.length });
  } catch (err) {
    console.error("[api/leaderboard]", err);
    return NextResponse.json({ error: "Failed to fetch leaderboard", entries: [], count: 0 }, { status: 500 });
  }
}
