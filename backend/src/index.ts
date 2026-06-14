import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { startIndexer } from "./indexer.js";
import { startFinalizer } from "./finalizer.js";
import { createApp } from "./api.js";

console.log("=== StackBall Backend ===");
console.log(`Chain ID:    ${config.chainId}`);
console.log(`Contract:    ${config.contractAddress}`);
console.log(`RPC:         ${config.rpcUrl}`);
console.log(`Port:        ${config.port}`);
console.log("========================\n");

// Start blockchain event indexer
await startIndexer();

// Start period auto-finalizer (checks every 60s)
startFinalizer(60_000);

// Start HTTP API
const app = createApp();
serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`\n[api] Server running at http://localhost:${info.port}`);
  console.log("[api] Endpoints:");
  console.log("  GET /health");
  console.log("  GET /leaderboard?limit=50");
  console.log("  GET /leaderboard/top3");
  console.log("  GET /player/:address");
  console.log("  GET /period\n");
});
