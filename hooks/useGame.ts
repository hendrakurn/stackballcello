"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  totalAccumulatedScore,
  type GameAction,
  type RoundResult,
} from "@/lib/scoring";
import { useWallet } from "./useWallet";
import { useGameSession } from "./useGameSession";

export type GamePhase =
  | "idle"
  | "starting"
  | "playing"
  | "round_over"
  | "submitting"
  | "done";

export function useGame() {
  const { address } = useWallet();
  const gameSession = useGameSession();
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [sessionId, setSessionId] = useState<`0x${string}` | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [txError, setTxError] = useState<string | null>(null);
  const allActions = useRef<GameAction[]>([]);
  const minimumDuration = 10_000;

  useEffect(() => {
    if (phase !== "round_over") {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(interval);
  }, [phase]);

  const elapsed = sessionStartedAt ? now - sessionStartedAt : 0;
  const submitWaitSeconds =
    phase === "round_over" && sessionStartedAt
      ? Math.max(0, Math.ceil((minimumDuration - elapsed) / 1000))
      : 0;
  const canSubmitScore = submitWaitSeconds === 0;

  const startGame = useCallback(async () => {
    if (!address) return;

    if (gameSession.isPeriodExpired) {
      setTxError("Period ended, waiting for reset.");
      return;
    }

    setTxError(null);
    setPhase("starting");

    try {
      const nextSessionId = await gameSession.startGame();
      setSessionId(nextSessionId);
      setSessionStartedAt(Date.now());
      setResetToken((token) => token + 1);
      setPhase("playing");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Transaction rejected";
      setTxError(message);
      setPhase(rounds.length > 0 ? "round_over" : "idle");
    }
  }, [address, gameSession, rounds.length]);

  const recordAction = useCallback((action: GameAction) => {
    allActions.current.push(action);
  }, []);

  const onRoundEnd = useCallback((result: RoundResult) => {
    setRounds((prev) => [...prev, result]);
    allActions.current.push(...result.actions);
    setNow(Date.now());
    setPhase("round_over");
  }, []);

  const continueGame = useCallback(async () => {
    await startGame();
  }, [startGame]);

  const submitScore = useCallback(async () => {
    if (!address) return;
    if (gameSession.isPeriodExpired) {
      setTxError("Period ended, waiting for reset.");
      return;
    }

    const total = totalAccumulatedScore(rounds);
    if (total <= 0) {
      setTxError("Score must be greater than zero");
      return;
    }

    if (!sessionId) {
      setTxError("Start a game before submitting a score.");
      return;
    }

    const elapsedBeforeSubmit = Date.now() - (sessionStartedAt ?? Date.now());

    if (elapsedBeforeSubmit < minimumDuration) {
      setTxError(
        `Play at least 10 seconds before submitting. Wait ${Math.ceil(
          (minimumDuration - elapsedBeforeSubmit) / 1000,
        )}s.`,
      );
      return;
    }

    setTxError(null);
    setPhase("submitting");

    try {
      await gameSession.submitScore(total, sessionId);
      setPhase("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      setTxError(message);
      setPhase("round_over");
    }
  }, [address, gameSession, rounds, sessionId, sessionStartedAt]);

  const resetSession = useCallback(() => {
    setPhase("idle");
    setRounds([]);
    setSessionId(null);
    setSessionStartedAt(null);
    setTxError(null);
    allActions.current = [];
    setResetToken((token) => token + 1);
  }, []);

  return {
    phase,
    rounds,
    totalScore: totalAccumulatedScore(rounds),
    roundCount: rounds.length,
    resetToken,
    txError: txError ?? gameSession.error,
    sessionId,
    hasActiveSession: false,
    isPeriodExpired: gameSession.isPeriodExpired,
    isPending: gameSession.isPending,
    isConfirming: gameSession.isConfirming,
    isSuccess: gameSession.isSuccess,
    lastTxHash: gameSession.lastTxHash,
    lastAction: gameSession.lastAction,
    startStage: gameSession.startStage,
    canSubmitScore,
    submitWaitSeconds,
    startGame,
    continueGame,
    submitScore,
    onRoundEnd,
    recordAction,
    resetSession,
  };
}
