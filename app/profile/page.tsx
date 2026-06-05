"use client";

import Link from "next/link";
import { PlayerStats } from "@/app/components/game/player-stats";
import { RewardClaimPanel } from "@/app/components/game/reward-claim-panel";
import { useWallet } from "@/hooks/useWallet";
import { formatAddress } from "@/lib/minipay";

export default function ProfilePage() {
  const { address, isConnected, isConnecting, connectWallet } = useWallet();

  return (
    <main className="stackball-pageShell">
      <section className="stackball-pageHeader">
        <div>
          <h1>Profile</h1>
        </div>
        <Link className="stackball-pageBack" href="/">
          Back to Game
        </Link>
      </section>

      <section className="stackball-profilePanel">
        <div className="stackball-profileIdentity">
          <span>Wallet</span>
          {isConnected ? (
            <strong>{formatAddress(address ?? "")}</strong>
          ) : (
            <button
              type="button"
              className="stackball-primary"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
              <small>View your stats</small>
            </button>
          )}
        </div>
        {isConnected ? <PlayerStats /> : null}
        {isConnected ? <RewardClaimPanel forceVisible /> : null}
      </section>
    </main>
  );
}
