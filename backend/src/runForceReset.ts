import { createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";
import { config } from "./config.js";

const chain = config.chainId === 42220 ? celo : celoAlfajores;

const account = privateKeyToAccount(config.ownerPrivateKey);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});

const FORCE_RESET_ABI = parseAbiItem("function forceReset()");

async function main() {
  try {
    console.log("[runForceReset] Calling forceReset()...");
    const txHash = await walletClient.writeContract({
      address: config.contractAddress,
      abi: [FORCE_RESET_ABI],
      functionName: "forceReset",
    });

    console.log(`[runForceReset] tx: ${txHash}`);
    // Wait for confirmation via public client is heavier; skip for brevity
  } catch (err) {
    console.error("[runForceReset] Error:", err);
    process.exitCode = 1;
  }
}

void main();
