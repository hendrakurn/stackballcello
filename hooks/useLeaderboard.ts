"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";

export type LeaderboardEntry = {
  rank: number;
  player: Address;
  score: number;
  submittedAt: number;
  isCurrentUser: boolean;
};

type ApiEntry = {
  rank: number;
  player: Address;
  score: number;
  lastUpdated: number;
  periodNumber: number;
};

type ApiResponse = {
  periodNumber: number;
  entries: ApiEntry[];
  count: number;
};

const REFETCH_INTERVAL = 30_000;

export function useLeaderboard() {
  const { address } = useAccount();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      // silently retain previous data on error
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    intervalRef.current = setInterval(fetchLeaderboard, REFETCH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchLeaderboard]);

  const leaderboard: LeaderboardEntry[] = (data?.entries ?? []).map((entry) => ({
    rank: entry.rank,
    player: entry.player,
    score: entry.score,
    submittedAt: entry.lastUpdated,
    isCurrentUser: address?.toLowerCase() === entry.player.toLowerCase(),
  }));

  return {
    leaderboard,
    entries: leaderboard,
    top10: leaderboard.slice(0, 10),
    top3: leaderboard.slice(0, 3),
    playerRank: leaderboard.find((e) => e.isCurrentUser)?.rank ?? null,
    isLoading,
    isFetching,
    refetch: fetchLeaderboard,
    refresh: fetchLeaderboard,
  };
}
