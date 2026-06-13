import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores, celoSepolia } from "viem/chains";
import { CHAIN_ID } from "@/lib/abi-contract/constants";

// Prefer V2 address from env, fallback to constants (updated after deploy)
export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  process.env.CONTRACT_ADDRESS ??
  "0x61579782c820d63951fB1658151aDb5cC3E13288"
) as `0x${string}`;

export const chain =
  CHAIN_ID === celo.id ? celo : CHAIN_ID === celoSepolia.id ? celoSepolia : celoAlfajores;

const rpcUrl =
  chain.id === celo.id
    ? "https://forno.celo.org"
    : chain.id === celoSepolia.id
      ? "https://forno.celo-sepolia.celo-testnet.org"
      : "https://alfajores-forno.celo-testnet.org";

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

export function getWalletClient(privateKey: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain,
    transport: http(rpcUrl),
  });
}

// Shared ABI items
export const ABI = {
  periodNumber:      parseAbiItem("function periodNumber() view returns (uint256)"),
  periodStart:       parseAbiItem("function periodStart() view returns (uint256)"),
  periodDuration:    parseAbiItem("function periodDuration() view returns (uint256)"),
  isPeriodExpired:   parseAbiItem("function isPeriodExpired() view returns (bool)"),
  isPeriodFinalized: parseAbiItem("function isPeriodFinalized(uint256) view returns (bool)"),
  getContractBalance:parseAbiItem("function getContractBalance() view returns (uint256)"),
  getPrizes:         parseAbiItem("function getPrizes() view returns (uint256, uint256, uint256)"),
  finalizePeriodWithWinners: parseAbiItem(
    "function finalizePeriodWithWinners(address[3] winners, uint256[3] rewards)"
  ),
  scoreSubmitted: parseAbiItem(
    "event ScoreSubmitted(address indexed player, uint256 score, uint256 periodNumber, uint256 timestamp)"
  ),
};
