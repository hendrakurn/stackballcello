"use client";

//import { Leaderboard } from "@/app/components/game/leaderboard";
import { GameController } from "@/components/game/GameController";
import { useWallet } from "@/hooks/useWallet";

export default function Home() {
  const { isReady, isConnected, isMiniPayUser, connectWallet, isConnecting } = useWallet();

  if (!isReady) {
    return (
      <main className="stackball-connectShell">
        <div className="stackball-connectPanel">Loading...</div>
      </main>
    );
  }

  if (isMiniPayUser && !isConnected) {
    return (
      <main className="stackball-connectShell">
        <div className="stackball-connectPanel">Connecting MiniPay...</div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="stackball-connectShell">
        <div className="stackball-connectLayout">
          <section className="stackball-connectPanel">
            <p className="stackball-kicker">Onchain arcade</p>
            <h1>Stack Ball Celo</h1>
            <p className="stackball-connectCopy">
              Break stacks. Submit your score. Top 3 win CELO every 7 days.
            </p>
            <div className="stackball-prizeStrip" aria-label="Prize pool">
              <span>1st 10 CELO</span>
              <span>2nd 7 CELO</span>
              <span>3rd 5 CELO</span>
            </div>
            {!isMiniPayUser ? (
              <button
                type="button"
                className="stackball-connectButton"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect Wallet to Play"}
              </button>
            ) : null}
            <small>Pay only gas fee</small>
          </section>

          <aside className="stackball-connectSide">
            <div className="stackball-connectSideStack">
         
            </div>
          </aside>
        </div>
      </main>
    );
  }

  return <GameController />;
}
