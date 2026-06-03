import type { Address } from "viem";
import {
  CHAIN_ID as GENERATED_CHAIN_ID,
  CONTRACT_ADDRESS as GENERATED_CONTRACT_ADDRESS,
} from "@/lib/abi-contract/constants";

export const CONTRACT_ADDRESS = GENERATED_CONTRACT_ADDRESS as Address;

export const CHAIN_ID: number = GENERATED_CHAIN_ID;

export const IS_MAINNET = CHAIN_ID === 42220;

export const SCORING = {
  pointsPerStack: 10,
  finishBonus: 500,
  timeBonusMax: 3000,
  timeBonusDivisor: 10,
  comboThreshold: 5,
  comboMultiplier: 1.5,
} as const;
