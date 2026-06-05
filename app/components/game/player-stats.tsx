"use client";

import { usePlayerStats } from "@/hooks/usePlayerStats";

export function PlayerStats() {
  const { stats, isLoading } = usePlayerStats();

  const items = [
    ["Games", stats?.totalGames ?? 0],
    ["Best", stats?.bestScore ?? 0],
    ["Rank", stats?.currentRank ? `#${stats.currentRank}` : "-"],
    ["Period", stats?.currentPeriodScore ?? 0],
  ] as const;

  return (
    <section className="stackball-infoPanel" aria-label="Player stats">
      <div className="stackball-infoTitle">Player Stats</div>
      <div className="stackball-statGrid">
        {items.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{isLoading ? "..." : value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
