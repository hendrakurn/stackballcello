"use client";

import { useWatchContractEvent } from "wagmi";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";

type EventHandler = () => void;

export function useContractEvents({
  onScoreSubmitted,
  onLeaderboardReset,
  onPeriodFinalized,
  onRewardClaimed,
}: {
  onScoreSubmitted?: EventHandler;
  onLeaderboardReset?: EventHandler;
  onPeriodFinalized?: EventHandler;
  onRewardClaimed?: EventHandler;
} = {}) {
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    eventName: "ScoreSubmitted",
    onLogs() {
      onScoreSubmitted?.();
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    eventName: "LeaderboardReset",
    onLogs() {
      onLeaderboardReset?.();
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    eventName: "PeriodFinalized",
    onLogs() {
      onPeriodFinalized?.();
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    eventName: "RewardClaimed",
    onLogs() {
      onRewardClaimed?.();
    },
  });
}
