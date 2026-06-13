import { NextResponse } from "next/server";
import { getPeriodInfo } from "@/lib/server/leaderboard";

export const revalidate = 15; // cache 15 seconds

export async function GET() {
  try {
    const info = await getPeriodInfo();
    return NextResponse.json(info);
  } catch (err) {
    console.error("[api/period]", err);
    return NextResponse.json({ error: "Failed to fetch period info" }, { status: 500 });
  }
}
