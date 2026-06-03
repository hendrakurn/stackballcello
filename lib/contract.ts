"use client";

import { createPublicClient, http } from "viem";
import { celo, celoAlfajores, celoSepolia } from "viem/chains";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID } from "./constants";

export const STACK_BALL_ABI = StackBallGameABI;

export const celoChain =
  CHAIN_ID === celo.id
    ? celo
    : CHAIN_ID === celoSepolia.id
      ? celoSepolia
      : celoAlfajores;

const rpcUrl =
  celoChain.id === celo.id
    ? "https://forno.celo.org"
    : celoChain.id === celoSepolia.id
      ? "https://forno.celo-sepolia.celo-testnet.org"
      : "https://alfajores-forno.celo-testnet.org";

export const publicClient = createPublicClient({
  chain: celoChain,
  transport: http(rpcUrl),
});
