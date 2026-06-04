"use client";

import { useCallback, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodePacked,
  keccak256,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { StackBallGameABI } from "@/lib/abi-contract/StackBallGame";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/abi-contract/constants";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  "StackBall: not owner": "Only the game owner can run this action.",
  "StackBall: period expired, call finalizePeriod":
    "Period ended. Finalize rewards before starting a new round.",
  "StackBall: hash already used":
    "This score proof was already used. Start a new game and submit again.",
  "StackBall: no active session": "Start a game before submitting a score.",
  "StackBall: not your session": "This game session belongs to another wallet.",
  "StackBall: session not active": "This game session is no longer active.",
  "StackBall: already submitted": "This session was already submitted.",
  "StackBall: game too short": "Play at least 10 seconds before submitting.",
  "StackBall: submit too soon":
    "Please wait for the 30 second submit cooldown.",
  "StackBall: score must be positive": "Score must be greater than zero.",
  "StackBall: period not yet expired": "This period is still active.",
  "StackBall: period already finalized": "This period was already finalized.",
  "StackBall: period not finalized": "Rewards are not ready to claim yet.",
  "StackBall: no reward available": "This wallet does not have a reward to claim.",
  "StackBall: reward already claimed": "This reward was already claimed.",
  "StackBall: reward transfer failed": "Reward transfer failed. Please try again.",
  "StackBall: insufficient balance":
    "The prize pool does not have enough CELO yet.",
  OwnableUnauthorizedAccount: "This wallet is not authorized for that action.",
  InvalidInitialization: "The contract has already been initialized.",
};

export function getFriendlyContractError(err: unknown) {
  const rawMessage = err instanceof Error ? err.message : String(err);

  for (const [contractMessage, friendlyMessage] of Object.entries(
    CONTRACT_ERROR_MESSAGES,
  )) {
    if (rawMessage.includes(contractMessage)) {
      return friendlyMessage;
    }
  }

  if (err instanceof BaseError) {
    const reverted = err.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    );

    if (reverted instanceof ContractFunctionRevertedError) {
      const errorName = reverted.data?.errorName;

      if (errorName && CONTRACT_ERROR_MESSAGES[errorName]) {
        return CONTRACT_ERROR_MESSAGES[errorName];
      }

      const reason =
        typeof reverted.reason === "string" ? reverted.reason : undefined;

      if (reason && CONTRACT_ERROR_MESSAGES[reason]) {
        return CONTRACT_ERROR_MESSAGES[reason];
      }
    }

    if (err.shortMessage) {
      return err.shortMessage;
    }
  }

  return "Transaction failed. Please try again.";
}

export function createGameHash(
  playerAddress: Address,
  score: number,
  sessionId: Hex,
) {
  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32"],
      [playerAddress, BigInt(score), sessionId],
    ),
  );
}

export function useGameSession() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync, isPending } = useWriteContract();
  const [sessionId, setSessionId] = useState<Hex | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [lastAction, setLastAction] = useState<"start" | "submit" | null>(
    null,
  );
  const [startStage, setStartStage] = useState<
    "idle" | "requesting" | "hash_received" | "waiting_receipt" | "reading_session"
  >("idle");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSessionQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "activeSession",
    args: [address ?? zeroAddress],
    query: {
      enabled: Boolean(address),
      refetchInterval: 15_000,
    },
  });
  const activeSession = (activeSessionQuery.data ?? ZERO_BYTES32) as Hex;
  const currentSessionQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "sessions",
    args: [activeSession],
    query: {
      enabled: activeSession !== ZERO_BYTES32,
      refetchInterval: 15_000,
    },
  });
  const expiredQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: StackBallGameABI,
    chainId: CHAIN_ID,
    functionName: "isPeriodExpired",
    query: {
      refetchInterval: 30_000,
    },
  });

  const handleError = useCallback((err: unknown) => {
    const message = getFriendlyContractError(err);
    setError(message);
    setIsConfirming(false);
    setIsSuccess(false);
    setStartStage("idle");
    throw new Error(message);
  }, []);

  const startGame = useCallback(async () => {
    if (!address) {
      const message = "Connect your wallet before playing.";
      setError(message);
      throw new Error(message);
    }

    if (!publicClient) {
      const message = "Celo RPC is not ready yet.";
      setError(message);
      throw new Error(message);
    }

    setError(null);
    setIsSuccess(false);
    setLastAction("start");
    setLastTxHash(null);
    setStartStage("requesting");

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: StackBallGameABI,
        functionName: "startGame",
        chainId: CHAIN_ID,
      });

      setLastTxHash(hash);
      setStartStage("hash_received");
      setIsConfirming(true);
      setStartStage("waiting_receipt");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setStartStage("reading_session");
      const startedLogs = parseEventLogs({
        abi: StackBallGameABI,
        eventName: "GameStarted",
        logs: receipt.logs,
      });
      const startedLog = startedLogs.find(
        (log) => log.args.player?.toLowerCase() === address.toLowerCase(),
      );
      const nextSessionId =
        startedLog?.args.sessionId ??
        ((await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: StackBallGameABI,
          functionName: "activeSession",
          args: [address],
        })) as Hex);

      setSessionId(nextSessionId);
      setIsConfirming(false);
      setIsSuccess(true);
      setStartStage("idle");
      void activeSessionQuery.refetch();
      return nextSessionId;
    } catch (err) {
      return handleError(err);
    }
  }, [
    activeSessionQuery,
    address,
    handleError,
    publicClient,
    writeContractAsync,
  ]);

  const submitScore = useCallback(
    async (score: number, sessionIdOverride?: Hex) => {
      if (!address) {
        const message = "Connect your wallet before submitting.";
        setError(message);
        throw new Error(message);
      }

      if (!publicClient) {
        const message = "Celo RPC is not ready yet.";
        setError(message);
        throw new Error(message);
      }

      const activeSession = sessionIdOverride ?? sessionId;

      if (!activeSession || activeSession === ZERO_BYTES32) {
        const message = "Start a game before submitting a score.";
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setIsSuccess(false);
      setLastAction("submit");
      setLastTxHash(null);

      try {
        const gameHash = createGameHash(address, score, activeSession);
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: StackBallGameABI,
          functionName: "submitScore",
          args: [BigInt(score), gameHash],
          chainId: CHAIN_ID,
        });

        setLastTxHash(hash);
        setIsConfirming(true);
        await publicClient.waitForTransactionReceipt({ hash });
        setIsConfirming(false);
        setIsSuccess(true);
        void activeSessionQuery.refetch();
        return hash;
      } catch (err) {
        return handleError(err);
      }
    },
    [
      activeSessionQuery,
      address,
      handleError,
      publicClient,
      sessionId,
      writeContractAsync,
    ],
  );

  const currentSession = currentSessionQuery.data;
  const currentSessionStartTime =
    currentSession && typeof currentSession[1] === "bigint"
      ? Number(currentSession[1]) * 1000
      : null;
  const currentSessionIsActive = Boolean(currentSession?.[2]);

  return {
    startGame,
    submitScore,
    sessionId,
    activeSession,
    hasActiveSession: activeSession !== ZERO_BYTES32,
    currentSessionStartTime,
    currentSessionIsActive,
    isPeriodExpired: Boolean(expiredQuery.data),
    isPending,
    isConfirming,
    isSuccess,
    error,
    lastTxHash,
    lastAction,
    startStage,
    refetchActiveSession: activeSessionQuery.refetch,
    refetchCurrentSession: currentSessionQuery.refetch,
    refetchPeriodExpired: expiredQuery.refetch,
  };
}
