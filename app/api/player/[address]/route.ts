import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/server/leaderboard";
import type { Address } from "viem";

export const revalidate = 15;

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  try {
    const { entries, periodNumber } = await getLeaderboard(50);
    const entry = entries.find((e) => e.player.toLowerCase() === address.toLowerCase());

    return NextResponse.json({
      periodNumber,
      player: address as Address,
      rank: entry?.rank ?? null,
      score: entry?.score ?? 0,
      inLeaderboard: entry !== null && entry !== undefined,
    });
  } catch (err) {
    console.error("[api/player]", err);
    return NextResponse.json({ error: "Failed to fetch player data" }, { status: 500 });
  }
}
