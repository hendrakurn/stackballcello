"use client";

import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useContractEvents } from "@/hooks/useContractEvents";
import { formatAddress } from "@/lib/minipay";

const PRIZE_BADGES = ["1st 10 CELO", "2nd 7 CELO", "3rd 5 CELO"] as const;

export function Leaderboard() {
  const { top10, isLoading, refetch } = useLeaderboard();

  useContractEvents({
    onScoreSubmitted: () => void refetch(),
    onLeaderboardReset: () => void refetch(),
    onPeriodFinalized: () => void refetch(),
    onRewardClaimed: () => void refetch(),
  });

  return (
    <section className="stackball-leaderboard" aria-label="Leaderboard">
      <div className="stackball-leaderboardHeader">
        <div className="stackball-leaderboardTitle">Leaderboard</div>
        <div className="stackball-leaderboardMeta">Top 10 this period</div>
      </div>

      <div className="stackball-leaderboardColumns" aria-hidden="true">
        <span>Rank</span>
        <span>Address</span>
        <span>Score</span>
        <span>Prize</span>
      </div>

      {isLoading ? (
        <div className="stackball-leaderboardRows">
          {Array.from({ length: 10 }, (_, index) => (
            <div
              className="stackball-leaderboardRow stackball-skeletonRow"
              key={index}
            />
          ))}
        </div>
      ) : top10.length === 0 ? (
        <div className="stackball-empty">No scores this period yet</div>
      ) : (
        <div className="stackball-leaderboardRows">
          {top10.map((entry) => (
            <div
              className={
                entry.isCurrentUser
                  ? "stackball-leaderboardRow is-current"
                  : "stackball-leaderboardRow"
              }
              key={`${entry.player}-${entry.rank}`}
            >
              <span className="stackball-rowRank">#{entry.rank}</span>
              <span className="stackball-rowAddress">
                {formatAddress(entry.player)}
                {entry.isCurrentUser ? <em>YOU</em> : null}
              </span>
              <strong>{entry.score.toLocaleString()}</strong>
              <span className="stackball-rowPrize">
                {PRIZE_BADGES[entry.rank - 1] ?? "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
