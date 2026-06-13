import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import { config } from "./config.js";

const chain = config.chainId === 42220 ? celo : celoAlfajores;

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  rank: number;
  player: Address;
  score: number;
  periodNumber: number;
  lastUpdated: number; // unix timestamp
};

// ─── State ───────────────────────────────────────────────────────────────────

// periodNumber → player → cumulative score
const scores = new Map<number, Map<string, number>>();
// periodNumber → player → last submission timestamp
const timestamps = new Map<number, Map<string, number>>();

export function getLeaderboard(periodNumber: number, limit = 50): LeaderboardEntry[] {
  const periodScores = scores.get(periodNumber);
  if (!periodScores) return [];

  const periodTs = timestamps.get(periodNumber) ?? new Map<string, number>();

  return Array.from(periodScores.entries())
    .map(([player, score]) => ({ player: player as Address, score, lastUpdated: periodTs.get(player) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.lastUpdated - b.lastUpdated)
    .slice(0, limit)
    .map((entry, i) => ({ ...entry, rank: i + 1, periodNumber }));
}

export function getTop3(periodNumber: number): LeaderboardEntry[] {
  return getLeaderboard(periodNumber, 3);
}

export function getPlayerRank(periodNumber: number, player: Address): LeaderboardEntry | null {
  const lb = getLeaderboard(periodNumber, 50);
  return lb.find((e) => e.player.toLowerCase() === player.toLowerCase()) ?? null;
}

function upsertScore(periodNumber: number, player: string, score: number, timestamp: number) {
  if (!scores.has(periodNumber)) scores.set(periodNumber, new Map());
  if (!timestamps.has(periodNumber)) timestamps.set(periodNumber, new Map());

  const periodScores = scores.get(periodNumber)!;
  const periodTs = timestamps.get(periodNumber)!;

  const prev = periodScores.get(player) ?? 0;
  // Score is cumulative from contract — always take the latest (highest will be cumulative)
  if (score > prev) {
    periodScores.set(player, score);
    periodTs.set(player, timestamp);
    console.log(`[indexer] period=${periodNumber} player=${player.slice(0, 10)}... score=${score}`);
  }
}

// ─── Event listener ──────────────────────────────────────────────────────────

const SCORE_SUBMITTED_ABI = parseAbiItem(
  "event ScoreSubmitted(address indexed player, uint256 score, uint256 rank, uint256 periodNumber, uint256 timestamp)"
);

export async function startIndexer() {
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = config.indexerStartBlock > 0n ? config.indexerStartBlock : latestBlock - 50000n;

  console.log(`[indexer] Scanning from block ${fromBlock} to ${latestBlock}`);

  // ── 1. Backfill past events ───────────────────────────────────────────────
  try {
    const pastLogs = await publicClient.getLogs({
      address: config.contractAddress,
      event: SCORE_SUBMITTED_ABI,
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of pastLogs) {
      if (!log.args.player || log.args.score === undefined || log.args.periodNumber === undefined) continue;
      upsertScore(
        Number(log.args.periodNumber),
        log.args.player,
        Number(log.args.score),
        Number(log.args.timestamp ?? 0n)
      );
    }
    console.log(`[indexer] Backfill complete: ${pastLogs.length} events processed`);
  } catch (err) {
    console.error("[indexer] Backfill error (non-fatal):", err);
  }

  // ── 2. Watch for new events ───────────────────────────────────────────────
  publicClient.watchEvent({
    address: config.contractAddress,
    event: SCORE_SUBMITTED_ABI,
    onLogs: (logs) => {
      for (const log of logs) {
        if (!log.args.player || log.args.score === undefined || log.args.periodNumber === undefined) continue;
        upsertScore(
          Number(log.args.periodNumber),
          log.args.player,
          Number(log.args.score),
          Number(log.args.timestamp ?? 0n)
        );
      }
    },
    onError: (err) => console.error("[indexer] Watch error:", err),
  });

  console.log("[indexer] Watching for new ScoreSubmitted events...");
}
