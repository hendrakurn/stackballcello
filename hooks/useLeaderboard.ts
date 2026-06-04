"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import type { Address } from "viem";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";

export type LeaderboardEntry = {
  rank: number;
  player: Address;
  score: number;
  submittedAt: number;
  isCurrentUser: boolean;
};

type ContractLeaderboardEntry = {
  player: Address;
  score: bigint;
  rank: bigint;
  submittedAt: bigint;
};

export function useLeaderboard() {
  const { address } = useAccount();
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    functionName: "getLeaderboard",
    chainId: CHAIN_ID,
    query: {
      refetchInterval: 30_000,
    },
  });

  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const rows = (data ?? []) as readonly ContractLeaderboardEntry[];

    return rows
      .map((entry, index) => ({
        rank: Number(entry.rank || BigInt(index + 1)),
        player: entry.player,
        score: Number(entry.score),
        submittedAt: Number(entry.submittedAt),
        isCurrentUser:
          address?.toLowerCase() === entry.player.toLowerCase(),
      }))
      .sort((left, right) => left.rank - right.rank);
  }, [address, data]);

  return {
    leaderboard,
    entries: leaderboard,
    top10: leaderboard.slice(0, 10),
    top3: leaderboard.slice(0, 3),
    playerRank:
      leaderboard.find((entry) => entry.isCurrentUser)?.rank ?? null,
    isLoading,
    isFetching,
    refetch,
    refresh: refetch,
  };
}
