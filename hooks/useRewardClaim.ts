"use client";

import { useCallback, useMemo, useState } from "react";
import { formatEther, zeroAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";
import { getFriendlyContractError } from "@/hooks/useGameSession";

type LatestClaimTuple = readonly [bigint, bigint, bigint, boolean, boolean];
type WinnersTuple = readonly [
  readonly [Address, Address, Address],
  readonly [bigint, bigint, bigint],
  readonly [boolean, boolean, boolean],
  boolean,
  bigint,
];
const ZERO_BIGINT = BigInt(0);

export function useRewardClaim() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync, isPending } = useWriteContract();
  const [lastAction, setLastAction] = useState<"finalize" | "claim" | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiredQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "isPeriodExpired",
    query: { refetchInterval: 30_000 },
  });

  const ownerQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "owner",
    query: { refetchInterval: 60_000 },
  });

  const latestPeriodQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "latestFinalizedPeriod",
    query: { refetchInterval: 30_000 },
  });

  const latestClaimQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "getLatestClaimableReward",
    args: [address ?? zeroAddress],
    query: {
      refetchInterval: 30_000,
    },
  });

  const latestWinnersQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "getPeriodWinners",
    args: [(latestPeriodQuery.data ?? ZERO_BIGINT) as bigint],
    query: {
      enabled: Boolean(latestPeriodQuery.data && latestPeriodQuery.data > ZERO_BIGINT),
      refetchInterval: 30_000,
    },
  });

  const refetch = useCallback(() => {
    void expiredQuery.refetch();
    void ownerQuery.refetch();
    void latestPeriodQuery.refetch();
    void latestClaimQuery.refetch();
    void latestWinnersQuery.refetch();
  }, [expiredQuery, latestClaimQuery, latestPeriodQuery, latestWinnersQuery, ownerQuery]);

  const handleError = useCallback((err: unknown) => {
    const message = getFriendlyContractError(err);
    setError(message);
    setIsConfirming(false);
    setIsSuccess(false);
    throw new Error(message);
  }, []);

  const finalizePeriod = useCallback(async () => {
    if (!publicClient) {
      throw new Error("Celo RPC is not ready yet.");
    }

    setError(null);
    setIsSuccess(false);
    setLastAction("finalize");

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: StackBallGameABI,
        functionName: "finalizePeriod",
        chainId: CHAIN_ID,
      });

      setLastTxHash(hash);
      setIsConfirming(true);
      await publicClient.waitForTransactionReceipt({ hash });
      setIsConfirming(false);
      setIsSuccess(true);
      refetch();
      return hash;
    } catch (err) {
      return handleError(err);
    }
  }, [handleError, publicClient, refetch, writeContractAsync]);

  const claimReward = useCallback(
    async (periodIdOverride?: number) => {
      if (!publicClient) {
        throw new Error("Celo RPC is not ready yet.");
      }

      const periodId = periodIdOverride ?? Number(latestPeriodQuery.data ?? ZERO_BIGINT);

      if (!periodId) {
        throw new Error("There is no finalized reward period yet.");
      }

      setError(null);
      setIsSuccess(false);
      setLastAction("claim");

      try {
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: StackBallGameABI,
          functionName: "claimReward",
          args: [BigInt(periodId)],
          chainId: CHAIN_ID,
        });

        setLastTxHash(hash);
        setIsConfirming(true);
        await publicClient.waitForTransactionReceipt({ hash });
        setIsConfirming(false);
        setIsSuccess(true);
        refetch();
        return hash;
      } catch (err) {
        return handleError(err);
      }
    },
    [handleError, latestPeriodQuery.data, publicClient, refetch, writeContractAsync],
  );

  const latestPeriodId = Number(latestPeriodQuery.data ?? ZERO_BIGINT);
  const claimData = (latestClaimQuery.data ?? [ZERO_BIGINT, ZERO_BIGINT, ZERO_BIGINT, false, false]) as LatestClaimTuple;
  const winnersData = latestWinnersQuery.data as WinnersTuple | undefined;
  const ownerAddress = (ownerQuery.data ?? zeroAddress) as Address;
  const isOwner = Boolean(address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase());
  const claimableAmountWei = claimData[1];
  const winningRank = Number(claimData[2]);
  const isClaimed = claimData[3];
  const isFinalized = claimData[4];
  const hasReward = claimableAmountWei > ZERO_BIGINT;
  const isPeriodExpired = Boolean(expiredQuery.data);

  const latestWinners = useMemo(() => {
    if (!winnersData) {
      return [];
    }

    return winnersData[0].map((winner, index) => ({
      winner,
      rewardWei: winnersData[1][index],
      reward: formatEther(winnersData[1][index]),
      claimed: winnersData[2][index],
      rank: index + 1,
    })).filter((entry) => entry.winner !== zeroAddress);
  }, [winnersData]);

  return {
    latestPeriodId,
    isPeriodExpired,
    isOwner,
    canFinalize: isOwner && isPeriodExpired,
    hasReward,
    winningRank,
    isClaimed,
    isFinalized,
    claimableAmountWei,
    claimableAmount: formatEther(claimableAmountWei),
    latestWinners,
    lastAction,
    lastTxHash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    finalizePeriod,
    claimReward,
    refetch,
    isLoading:
      expiredQuery.isLoading ||
      ownerQuery.isLoading ||
      latestPeriodQuery.isLoading ||
      latestClaimQuery.isLoading,
  };
}
