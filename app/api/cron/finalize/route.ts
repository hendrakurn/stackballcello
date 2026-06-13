import { NextResponse } from "next/server";
import type { Address } from "viem";
import { publicClient, getWalletClient, CONTRACT_ADDRESS, ABI } from "@/lib/server/chain";
import { getLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic"; // never cache — cron must always run fresh

function isAuthorized(request: Request): boolean {
  // Vercel injects CRON_SECRET as Authorization: Bearer <secret>
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // skip auth in local dev (no secret configured)

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerPrivateKey) {
    return NextResponse.json({ error: "OWNER_PRIVATE_KEY not configured" }, { status: 500 });
  }

  try {
    // 1. Check if period is expired
    const [isExpired, periodNumberRaw] = await Promise.all([
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.isPeriodExpired], functionName: "isPeriodExpired" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodNumber], functionName: "periodNumber" }),
    ]);

    if (!isExpired) {
      return NextResponse.json({ skipped: true, reason: "Period not expired yet" });
    }

    const periodNumber = periodNumberRaw as bigint;

    // 2. Check if already finalized
    const isAlreadyFinalized = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: [ABI.isPeriodFinalized],
      functionName: "isPeriodFinalized",
      args: [periodNumber],
    });

    if (isAlreadyFinalized) {
      return NextResponse.json({ skipped: true, reason: "Period already finalized" });
    }

    // 3. Get current period prizes from contract
    const prizesRaw = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: [ABI.getPrizes],
      functionName: "getPrizes",
    });
    const [prize1, prize2, prize3] = prizesRaw as [bigint, bigint, bigint];

    // 4. Get top 3 from leaderboard (reads ScoreSubmitted events)
    const { entries } = await getLeaderboard(3);

    // 5. Build winners/rewards arrays (zero-address for empty slots)
    const ZERO: Address = "0x0000000000000000000000000000000000000000";
    const winners: [Address, Address, Address] = [
      (entries[0]?.player ?? ZERO) as Address,
      (entries[1]?.player ?? ZERO) as Address,
      (entries[2]?.player ?? ZERO) as Address,
    ];
    const rewards: [bigint, bigint, bigint] = [
      entries[0] ? prize1 : 0n,
      entries[1] ? prize2 : 0n,
      entries[2] ? prize3 : 0n,
    ];

    console.log(`[cron/finalize] Period ${periodNumber} — finalizing with winners:`, winners);

    // 6. Call finalizePeriodWithWinners
    const walletClient = getWalletClient(ownerPrivateKey);
    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: [ABI.finalizePeriodWithWinners],
      functionName: "finalizePeriodWithWinners",
      args: [winners, rewards],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`[cron/finalize] ✅ Period ${periodNumber} finalized in block ${receipt.blockNumber}`);

    return NextResponse.json({
      success: true,
      periodNumber: Number(periodNumber),
      txHash,
      blockNumber: Number(receipt.blockNumber),
      winners,
      rewards: rewards.map(String),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/finalize] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
