import { readFileSync } from "fs";
import { resolve, join } from "path";

function loadEnv() {
  try {
    const envPath = resolve(join(import.meta.dirname, "../.env"));
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found — rely on environment variables
  }
}

loadEnv();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  rpcUrl: process.env.RPC_URL || "https://forno.celo.org",
  chainId: Number(process.env.CHAIN_ID || "42220"),
  contractAddress: required("CONTRACT_ADDRESS") as `0x${string}`,
  ownerPrivateKey: required("OWNER_PRIVATE_KEY") as `0x${string}`,
  port: Number(process.env.PORT || "3001"),
  indexerStartBlock: BigInt(process.env.INDEXER_START_BLOCK || "0"),
};
