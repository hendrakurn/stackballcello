"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { useGame } from "@/hooks/useGame";
import { formatAddress } from "@/lib/minipay";
import type { RoundResult } from "@/lib/scoring";
import { StackBallEntry } from "@/app/components/game/stack-ball-entry";
import { GameNav } from "@/app/components/game/game-nav";
import { StartGameButton } from "@/app/components/game/start-game-button";
import { SubmitScoreButton } from "@/app/components/game/submit-score-button";

export function GameController() {
  const { address, isConnected, isMiniPayUser } = useWallet();
  const {
    phase,
    totalScore,
    roundCount,
    resetToken,
    txError,
    hasActiveSession,
    isPeriodExpired,
    isPending,
    isConfirming,
    lastTxHash,
    lastAction,
    startStage,
    canSubmitScore,
    submitWaitSeconds,
    startGame,
    continueGame,
    submitScore,
    onRoundEnd,
    resetSession,
  } = useGame();

  const enabled = phase === "playing";
  const isTxBusy = isPending || isConfirming;

  const handleRoundEnd = (result: RoundResult) => {
    onRoundEnd(result);
  };

  return (
    <div className="stackball-onchainStage">
      <StackBallEntry
        enabled={enabled}
        resetToken={resetToken}
        onRoundEnd={handleRoundEnd}
      />

      <GameNav />

      {isPeriodExpired ? (
        <div className="stackball-periodBanner">
          Period ended, waiting for reward finalization
        </div>
      ) : null}

      {phase === "idle" && isConnected ? (
        <>
          <StartGameButton
            onStart={startGame}
            disabled={isPeriodExpired}
            isBusy={isTxBusy}
            isPeriodExpired={isPeriodExpired}
            hasActiveSession={hasActiveSession}
          />
          {txError && lastAction === "start" ? (
            <div className="stackball-startNotice" role="status" aria-live="polite">
              <strong>Start Game failed</strong>
              <p>{txError}</p>
              <dl>
                <dt>Stage</dt>
                <dd>{startStage}</dd>
                <dt>Hash</dt>
                <dd>{lastTxHash ?? "No hash returned"}</dd>
              </dl>
              {isMiniPayUser ? (
                <small>
                  MiniPay may show this custom contract call as an unknown transaction in dev mode.
                </small>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "starting" ? (
        <div className="stackball-chainOverlay">
          <strong>{isConfirming ? "Starting..." : "Confirming..."}</strong>
          <span>
            {isConfirming
              ? "Waiting for Celo confirmation."
              : "Approve the start transaction in your wallet."}
          </span>
          {txError ? <p>{txError}</p> : null}
        </div>
      ) : null}

      {phase === "round_over" ? (
        <div className="stackball-chainOverlay stackball-roundOverlay">
          <span>
            Total score - all {roundCount} round{roundCount === 1 ? "" : "s"}
          </span>
          <strong className="stackball-totalScore">
            {totalScore.toLocaleString()}
          </strong>
          {txError ? <p>{txError}</p> : null}
          {!txError && submitWaitSeconds > 0 ? (
            <div className="stackball-submitHint">
              Submit available in {submitWaitSeconds}s
            </div>
          ) : null}
          <div className="stackball-actionRow">
            <button
              type="button"
              className="stackball-secondary"
              onClick={continueGame}
              disabled={isPeriodExpired || isTxBusy}
            >
              Continue Playing
              <small>Gas fee required</small>
            </button>
            <SubmitScoreButton
              score={totalScore}
              onSubmit={submitScore}
              disabled={isPeriodExpired || !canSubmitScore}
              isBusy={isTxBusy}
            />
          </div>
          <small>{formatAddress(address ?? "")} on Celo</small>
        </div>
      ) : null}

      {phase === "submitting" ? (
        <div className="stackball-chainOverlay">
          <strong>{isConfirming ? "Saving Score..." : "Submitting Score..."}</strong>
          <b className="stackball-totalScore">{totalScore.toLocaleString()}</b>
          <span>
            {isConfirming
              ? "Waiting for Celo confirmation."
              : "Approve the transaction to save your score onchain."}
          </span>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="stackball-chainOverlay">
          <strong>Score Submitted</strong>
          <b className="stackball-totalScore">{totalScore.toLocaleString()}</b>
          <span>Your score is now on the Celo leaderboard.</span>
          <div className="stackball-actionRow">
            <button
              type="button"
              className="stackball-primary"
              onClick={resetSession}
            >
              Play Again
            </button>
            <Link className="stackball-secondary" href="/leaderboard">
              View Leaderboard
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
