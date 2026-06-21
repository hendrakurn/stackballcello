import type { Address } from "viem";
import { publicClient, CONTRACT_ADDRESS, ABI } from "./chain";

export type LeaderboardEntry = {
  rank: number;
  player: Address;
  score: number;
  lastUpdated: number;
  periodNumber: number;
};

export type PeriodInfo = {
  periodNumber: number;
  periodStart: number;
  expiresAt: number;
  timeUntilResetSeconds: number;
  isExpired: boolean;
  contractBalanceWei: string;
  prizes: { first: string; second: string; third: string };
};

// Celo ~5 second block time
const CELO_BLOCK_TIME_SECS = 5;
// Safety buffer: scan a bit earlier than periodStart to avoid missing events
const BLOCK_SCAN_BUFFER = 200n;
// Max blocks per getLogs call (Forno caps at 5000)
const MAX_BLOCKS_PER_CHUNK = 5_000n;

async function getLogsChunked(fromBlock: bigint, toBlock: bigint) {
  const allLogs = [];
  let from = fromBlock < 0n ? 0n : fromBlock;

  while (from <= toBlock) {
    const to = from + MAX_BLOCKS_PER_CHUNK - 1n > toBlock ? toBlock : from + MAX_BLOCKS_PER_CHUNK - 1n;
    const logs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: ABI.scoreSubmitted,
      fromBlock: from,
      toBlock: to,
    });
    allLogs.push(...logs);
    from = to + 1n;
  }

  return allLogs;
}

export async function getLeaderboard(limit = 50): Promise<{
  entries: LeaderboardEntry[];
  periodNumber: number;
}> {
  // Read period info from contract
  const [periodNumberRaw, periodStartRaw] = await Promise.all([
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodNumber], functionName: "periodNumber" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodStart], functionName: "periodStart" }),
  ]);

  const periodNumber = Number(periodNumberRaw as bigint);
  const periodStart = Number(periodStartRaw as bigint);

  // Estimate start block from periodStart timestamp
  const currentBlock = await publicClient.getBlockNumber();
  const nowSecs = Math.floor(Date.now() / 1000);
  const secondsSincePeriodStart = Math.max(0, nowSecs - periodStart);
  const blocksSincePeriodStart = BigInt(Math.ceil(secondsSincePeriodStart / CELO_BLOCK_TIME_SECS));
  const fromBlock =
    currentBlock > blocksSincePeriodStart + BLOCK_SCAN_BUFFER
      ? currentBlock - blocksSincePeriodStart - BLOCK_SCAN_BUFFER
      : 0n;

  // Fetch all ScoreSubmitted events for this period
  const logs = await getLogsChunked(fromBlock, currentBlock);

  // Build leaderboard: player → {score, timestamp}
  // Event emits cumulative score, so always take the latest event per player for this period
  const playerMap = new Map<string, { score: number; timestamp: number }>();

  for (const log of logs) {
    if (!log.args.player || log.args.score === undefined || log.args.periodNumber === undefined) continue;
    if (Number(log.args.periodNumber) !== periodNumber) continue;

    const player = log.args.player.toLowerCase();
    const score = Number(log.args.score);
    const timestamp = Number(log.args.timestamp ?? 0n);
    const prev = playerMap.get(player);

    // Take the highest score (last submitScore is cumulative but in case of re-org, take highest)
    if (!prev || score > prev.score) {
      playerMap.set(player, { score, timestamp });
    }
  }

  // Sort: highest score first, then earliest timestamp for ties
  const sorted = Array.from(playerMap.entries())
    .sort(([, a], [, b]) => b.score - a.score || a.timestamp - b.timestamp)
    .slice(0, limit)
    .map(([player, { score, timestamp }], i) => ({
      rank: i + 1,
      player: player as Address,
      score,
      lastUpdated: timestamp,
      periodNumber,
    }));

  return { entries: sorted, periodNumber };
}

export async function getPeriodInfo(): Promise<PeriodInfo> {
  const [periodNumberRaw, periodStartRaw, periodDurationRaw, isExpired, balance, prizes] =
    await Promise.all([
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodNumber], functionName: "periodNumber" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodStart], functionName: "periodStart" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.periodDuration], functionName: "periodDuration" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.isPeriodExpired], functionName: "isPeriodExpired" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.getContractBalance], functionName: "getContractBalance" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: [ABI.getPrizes], functionName: "getPrizes" }),
    ]);

  const start = Number(periodStartRaw as bigint);
  const duration = Number(periodDurationRaw as bigint);
  const expiresAt = start + duration;
  const nowSecs = Math.floor(Date.now() / 1000);
  const [prize1, prize2, prize3] = prizes as [bigint, bigint, bigint];

  return {
    periodNumber: Number(periodNumberRaw as bigint),
    periodStart: start,
    expiresAt,
    timeUntilResetSeconds: Math.max(0, expiresAt - nowSecs),
    isExpired: Boolean(isExpired),
    contractBalanceWei: String(balance as bigint),
    prizes: {
      first: String(prize1),
      second: String(prize2),
      third: String(prize3),
    },
  };
}
