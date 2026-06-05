"use client";

import { usePrizePool } from "@/hooks/usePrizePool";

export function GameTimer() {
  const { countdown, isPeriodExpired } = usePrizePool();

  return (
    <section className="stackball-infoPanel stackball-timerPanel">
      <span>Period Reset</span>
      <strong>
        {isPeriodExpired ? "Period Ended - Awaiting Finalization" : countdown}
      </strong>
    </section>
  );
}
