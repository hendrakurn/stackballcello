"use client";

import { useContractEvents } from "@/hooks/useContractEvents";
import { useRewardClaim } from "@/hooks/useRewardClaim";
import { useWallet } from "@/hooks/useWallet";

type RewardClaimPanelProps = {
  className?: string;
  forceVisible?: boolean;
};

function rankLabel(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return "-";
}

export function RewardClaimPanel({
  className,
  forceVisible = false,
}: RewardClaimPanelProps) {
  const { isConnected, isConnecting, connectWallet } = useWallet();
  const {
    latestPeriodId,
    isPeriodExpired,
    canFinalize,
    hasReward,
    winningRank,
    isClaimed,
    isFinalized,
    claimableAmount,
    latestWinners,
    isPending,
    isConfirming,
    isSuccess,
    error,
    finalizePeriod,
    claimReward,
    refetch,
  } = useRewardClaim();

  useContractEvents({
    onPeriodFinalized: () => void refetch(),
    onRewardClaimed: () => void refetch(),
    onLeaderboardReset: () => void refetch(),
  });

  const shouldRender =
    forceVisible ||
    isConnected ||
    isPeriodExpired ||
    latestPeriodId > 0;

  if (!shouldRender) {
    return null;
  }

  const busyLabel =
    isConfirming || isPending
      ? isConfirming
        ? "Waiting for Celo confirmation..."
        : "Check your wallet..."
      : null;

  return (
    <section
      className={
        className ? `stackball-infoPanel stackball-rewardPanel ${className}` : "stackball-infoPanel stackball-rewardPanel"
      }
      aria-label="Reward claim"
    >
      <div className="stackball-infoTitle">Reward Claim</div>

      <div className="stackball-rewardStatus">
        {isPeriodExpired ? (
          <strong>Period ended</strong>
        ) : hasReward && !isClaimed ? (
          <strong>{rankLabel(winningRank)} place reward ready</strong>
        ) : hasReward && isClaimed ? (
          <strong>Reward claimed</strong>
        ) : latestPeriodId > 0 ? (
          <strong>No reward available</strong>
        ) : (
          <strong>No finalized rewards yet</strong>
        )}

        <span>
          {isPeriodExpired
            ? canFinalize
              ? "Finalize this period to lock winners and unlock claims."
              : "Waiting for the owner to finalize the reward period."
            : hasReward && !isClaimed
              ? `Claim ${claimableAmount} CELO from period #${latestPeriodId}.`
              : hasReward && isClaimed
                ? `Your ${claimableAmount} CELO reward for period #${latestPeriodId} was already claimed.`
                : latestPeriodId > 0
                  ? `This wallet did not win a reward in period #${latestPeriodId}.`
                  : "Rewards appear here after a period is finalized."}
        </span>
      </div>

      {latestPeriodId > 0 ? (
        <div className="stackball-rewardMeta">
          <div>
            <span>Latest Period</span>
            <strong>#{latestPeriodId}</strong>
          </div>
          <div>
            <span>Rank</span>
            <strong>{winningRank > 0 ? rankLabel(winningRank) : "-"}</strong>
          </div>
          <div>
            <span>Reward</span>
            <strong>{hasReward ? `${claimableAmount} CELO` : "-"}</strong>
          </div>
        </div>
      ) : null}

      {latestWinners.length > 0 ? (
        <div className="stackball-rewardWinners">
          {latestWinners.map((entry) => (
            <div key={`${entry.rank}-${entry.winner}`}>
              <span>{rankLabel(entry.rank)}</span>
              <strong>{entry.reward} CELO</strong>
            </div>
          ))}
        </div>
      ) : null}

      {!isConnected ? (
        <button
          type="button"
          className="stackball-primary"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
          <small>Check claim status</small>
        </button>
      ) : canFinalize ? (
        <button
          type="button"
          className="stackball-secondary"
          onClick={() => void finalizePeriod()}
          disabled={isPending || isConfirming}
        >
          Finalize Period
          <small>Lock winners and open claims</small>
        </button>
      ) : hasReward && !isClaimed && isFinalized ? (
        <button
          type="button"
          className="stackball-primary"
          onClick={() => void claimReward()}
          disabled={isPending || isConfirming}
        >
          Claim Reward
          <small>{claimableAmount} CELO</small>
        </button>
      ) : null}

      {busyLabel ? <div className="stackball-rewardNotice">{busyLabel}</div> : null}
      {isSuccess ? <div className="stackball-rewardNotice is-success">Reward state updated onchain.</div> : null}
      {error ? <div className="stackball-rewardNotice is-error">{error}</div> : null}
    </section>
  );
}
