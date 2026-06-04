"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";

export type PlayerStatsDisplay = {
  totalGames: number;
  bestScore: number;
  currentPeriodScore: number;
  currentRank: number;
  hasSubmittedThisPeriod: boolean;
};

type ContractPlayerStats = {
  totalGames: bigint;
  bestScore: bigint;
  currentPeriodScore: bigint;
  currentRank: bigint;
  hasSubmittedThisPeriod: boolean;
};

export function usePlayerStats(playerAddress?: Address) {
  const { address } = useAccount();
  const player = playerAddress ?? address;
  const { data, isLoading, isFetching, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    functionName: "getPlayerStats",
    args: [player ?? zeroAddress],
    query: {
      enabled: Boolean(player),
      refetchInterval: 30_000,
    },
  });

  const stats = useMemo<PlayerStatsDisplay | null>(() => {
    if (!data) {
      return null;
    }

    const value = data as ContractPlayerStats;

    return {
      totalGames: Number(value.totalGames),
      bestScore: Number(value.bestScore),
      currentPeriodScore: Number(value.currentPeriodScore),
      currentRank: Number(value.currentRank),
      hasSubmittedThisPeriod: value.hasSubmittedThisPeriod,
    };
  }, [data]);

  return { stats, rawStats: data, isLoading, isFetching, refetch };
}
