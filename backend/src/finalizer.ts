import { createWalletClient, http, parseAbiItem, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";
import { config } from "./config.js";
import { publicClient, getTop3 } from "./indexer.js";

const chain = config.chainId === 42220 ? celo : celoAlfajores;

const account = privateKeyToAccount(config.ownerPrivateKey);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});

const IS_PERIOD_EXPIRED_ABI = parseAbiItem("function isPeriodExpired() view returns (bool)");
const PERIOD_NUMBER_ABI = parseAbiItem("function periodNumber() view returns (uint256)");
const IS_PERIOD_FINALIZED_ABI = parseAbiItem("function isPeriodFinalized(uint256) view returns (bool)");
const FINALIZE_ABI = parseAbiItem(
  "function finalizePeriodWithWinners(address[3] winners, uint256[3] rewards)"
);
const GET_PRIZES_ABI = parseAbiItem("function getPrizes() view returns (uint256, uint256, uint256)");

export async function tryFinalize() {
  try {
    const [isExpired, periodNumber] = await Promise.all([
      publicClient.readContract({
        address: config.contractAddress,
        abi: [IS_PERIOD_EXPIRED_ABI],
        functionName: "isPeriodExpired",
      }),
      publicClient.readContract({
        address: config.contractAddress,
        abi: [PERIOD_NUMBER_ABI],
        functionName: "periodNumber",
      }),
    ]);

    if (!isExpired) return;

    const periodNum = Number(periodNumber as bigint);
    const isAlreadyFinalized = await publicClient.readContract({
      address: config.contractAddress,
      abi: [IS_PERIOD_FINALIZED_ABI],
      functionName: "isPeriodFinalized",
      args: [periodNumber as bigint],
    });

    if (isAlreadyFinalized) return;

    const [prize1, prize2, prize3] = (await publicClient.readContract({
      address: config.contractAddress,
      abi: [GET_PRIZES_ABI],
      functionName: "getPrizes",
    })) as [bigint, bigint, bigint];

    const top3 = getTop3(periodNum);
    console.log(`[finalizer] Period ${periodNum} expired. Top 3:`, top3.map((e) => `${e.player.slice(0, 8)} (${e.score})`));

    // Build winners and rewards arrays (zero-address for empty slots)
    const winners: [Address, Address, Address] = [
      (top3[0]?.player ?? "0x0000000000000000000000000000000000000000") as Address,
      (top3[1]?.player ?? "0x0000000000000000000000000000000000000000") as Address,
      (top3[2]?.player ?? "0x0000000000000000000000000000000000000000") as Address,
    ];
    const rewards: [bigint, bigint, bigint] = [
      top3[0] ? prize1 : 0n,
      top3[1] ? prize2 : 0n,
      top3[2] ? prize3 : 0n,
    ];

    console.log(`[finalizer] Calling finalizePeriodWithWinners for period ${periodNum}...`);
    const txHash = await walletClient.writeContract({
      address: config.contractAddress,
      abi: [FINALIZE_ABI],
      functionName: "finalizePeriodWithWinners",
      args: [winners, rewards],
    });

    console.log(`[finalizer] ✅ Period ${periodNum} finalized! tx: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[finalizer] ✅ Confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    console.error("[finalizer] Error during finalization:", err);
  }
}

export function startFinalizer(intervalMs = 60_000) {
  console.log(`[finalizer] Starting — checking every ${intervalMs / 1000}s`);
  void tryFinalize(); // run immediately on start
  setInterval(tryFinalize, intervalMs);
}
