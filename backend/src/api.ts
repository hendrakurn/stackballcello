import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseAbiItem, type Address } from "viem";
import { publicClient, getLeaderboard, getTop3, getPlayerRank } from "./indexer.js";
import { config } from "./config.js";

const PERIOD_NUMBER_ABI = parseAbiItem("function periodNumber() view returns (uint256)");
const PERIOD_START_ABI = parseAbiItem("function periodStart() view returns (uint256)");
const PERIOD_DURATION_ABI = parseAbiItem("function periodDuration() view returns (uint256)");
const IS_EXPIRED_ABI = parseAbiItem("function isPeriodExpired() view returns (bool)");
const CONTRACT_BALANCE_ABI = parseAbiItem("function getContractBalance() view returns (uint256)");
const GET_PRIZES_ABI = parseAbiItem("function getPrizes() view returns (uint256, uint256, uint256)");

export function createApp() {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (c) => c.json({ status: "ok", contractAddress: config.contractAddress }));

  // ── Leaderboard ───────────────────────────────────────────────────────────
  app.get("/leaderboard", async (c) => {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(Number(limitParam), 50) : 50;

    const periodNumber = Number(
      await publicClient.readContract({
        address: config.contractAddress,
        abi: [PERIOD_NUMBER_ABI],
        functionName: "periodNumber",
      })
    );

    const entries = getLeaderboard(periodNumber, limit);
    return c.json({ periodNumber, entries, count: entries.length });
  });

  app.get("/leaderboard/top3", async (c) => {
    const periodNumber = Number(
      await publicClient.readContract({
        address: config.contractAddress,
        abi: [PERIOD_NUMBER_ABI],
        functionName: "periodNumber",
      })
    );

    const top3 = getTop3(periodNumber);
    return c.json({ periodNumber, top3 });
  });

  // ── Player ────────────────────────────────────────────────────────────────
  app.get("/player/:address", async (c) => {
    const address = c.req.param("address") as Address;
    const periodNumber = Number(
      await publicClient.readContract({
        address: config.contractAddress,
        abi: [PERIOD_NUMBER_ABI],
        functionName: "periodNumber",
      })
    );

    const entry = getPlayerRank(periodNumber, address);
    return c.json({
      periodNumber,
      player: address,
      rank: entry?.rank ?? null,
      score: entry?.score ?? 0,
      inLeaderboard: entry !== null,
    });
  });

  // ── Period info ───────────────────────────────────────────────────────────
  app.get("/period", async (c) => {
    const [periodNumber, periodStart, periodDuration, isExpired, balance, prizes] = await Promise.all([
      publicClient.readContract({ address: config.contractAddress, abi: [PERIOD_NUMBER_ABI], functionName: "periodNumber" }),
      publicClient.readContract({ address: config.contractAddress, abi: [PERIOD_START_ABI], functionName: "periodStart" }),
      publicClient.readContract({ address: config.contractAddress, abi: [PERIOD_DURATION_ABI], functionName: "periodDuration" }),
      publicClient.readContract({ address: config.contractAddress, abi: [IS_EXPIRED_ABI], functionName: "isPeriodExpired" }),
      publicClient.readContract({ address: config.contractAddress, abi: [CONTRACT_BALANCE_ABI], functionName: "getContractBalance" }),
      publicClient.readContract({ address: config.contractAddress, abi: [GET_PRIZES_ABI], functionName: "getPrizes" }),
    ]);

    const start = Number(periodStart as bigint);
    const duration = Number(periodDuration as bigint);
    const expiresAt = start + duration;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilReset = Math.max(0, expiresAt - now);
    const [prize1, prize2, prize3] = prizes as [bigint, bigint, bigint];

    return c.json({
      periodNumber: Number(periodNumber as bigint),
      periodStart: start,
      expiresAt,
      timeUntilResetSeconds: timeUntilReset,
      isExpired: Boolean(isExpired),
      contractBalanceWei: String(balance as bigint),
      prizes: {
        first: String(prize1),
        second: String(prize2),
        third: String(prize3),
      },
    });
  });

  return app;
}
