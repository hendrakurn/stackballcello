"use client";

import { usePrizePool } from "@/hooks/usePrizePool";

export function PrizePool() {
  const { prize1, prize2, prize3, balance, isLoading } = usePrizePool();
  const prizes = [
    ["1st", prize1],
    ["2nd", prize2],
    ["3rd", prize3],
  ] as const;

  return (
    <section className="stackball-infoPanel">
      <div className="stackball-infoTitle">Prize Pool</div>
      <div className="stackball-prizeCards">
        {prizes.map(([place, prize]) => (
          <div key={place}>
            <span>{place}</span>
            <strong>{isLoading ? "..." : prize} CELO</strong>
          </div>
        ))}
      </div>
      <div className="stackball-poolBalance">
        Total pool <strong>{isLoading ? "..." : balance} CELO</strong>
      </div>
    </section>
  );
}
