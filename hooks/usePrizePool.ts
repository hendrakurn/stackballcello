"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";

type PrizeTuple = readonly [bigint, bigint, bigint];
const ZERO_WEI = BigInt(0);
const ZERO_PRIZES = [ZERO_WEI, ZERO_WEI, ZERO_WEI] as const satisfies PrizeTuple;

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  return `${days}:${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function usePrizePool() {
  const prizesQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "getPrizes",
    query: { refetchInterval: 30_000 },
  });
  const timeQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "getTimeUntilReset",
    query: { refetchInterval: 30_000 },
  });
  const balanceQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "getContractBalance",
    query: { refetchInterval: 30_000 },
  });
  const expiredQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "isPeriodExpired",
    query: { refetchInterval: 30_000 },
  });
  const [now, setNow] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  const timeLeft = useMemo(() => {
    const chainTimeLeft = Number(timeQuery.data ?? ZERO_WEI);
    const elapsed =
      now > 0 && timeQuery.dataUpdatedAt
        ? Math.floor((now - timeQuery.dataUpdatedAt) / 1_000)
        : 0;

    return Math.max(0, chainTimeLeft - elapsed);
  }, [now, timeQuery.data, timeQuery.dataUpdatedAt]);

  const prizes = useMemo(
    () => (prizesQuery.data as PrizeTuple | undefined) ?? ZERO_PRIZES,
    [prizesQuery.data],
  );
  const balanceWei = (balanceQuery.data ?? ZERO_WEI) as bigint;

  const formatted = useMemo(
    () => ({
      prize1: formatEther(prizes[0]),
      prize2: formatEther(prizes[1]),
      prize3: formatEther(prizes[2]),
      balance: formatEther(balanceWei),
    }),
    [balanceWei, prizes],
  );

  const refetch = () => {
    void prizesQuery.refetch();
    void timeQuery.refetch();
    void balanceQuery.refetch();
    void expiredQuery.refetch();
  };

  return {
    ...formatted,
    prizes,
    balanceWei,
    timeLeft,
    countdown: formatDuration(timeLeft),
    isPeriodExpired: Boolean(expiredQuery.data) || timeLeft === 0,
    isLoading:
      prizesQuery.isLoading ||
      timeQuery.isLoading ||
      balanceQuery.isLoading ||
      expiredQuery.isLoading,
    refetch,
  };
}
