"use client";

import Link from "next/link";
import { GameTimer } from "@/app/components/game/game-timer";
import { Leaderboard } from "@/app/components/game/leaderboard";
import { PrizePool } from "@/app/components/game/prize-pool";

export default function LeaderboardPage() {
  return (
    <main className="stackball-pageShell">
      <section className="stackball-pageHeader">
        <div>
          <h1>Leaderboard</h1>
        </div>
        <Link className="stackball-pageBack" href="/">
          Back to Game
        </Link>
      </section>

      <section className="stackball-pageGrid stackball-pageGridLeaderboard">
        <div className="stackball-pageMain">
          <Leaderboard />
        </div>
        <aside className="stackball-pageSide">
          <GameTimer />
          <PrizePool />
        </aside>
      </section>
    </main>
  );
}
