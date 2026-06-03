import { encodePacked, keccak256, type Address } from "viem";
import { SCORING } from "./constants";

export interface GameAction {
  type: "stack" | "gameover" | "finish";
  timestamp: number;
  id: string;
}

export interface RoundResult {
  stacksDestroyed: number;
  timeSeconds: number;
  reachedFinish: boolean;
  comboCount: number;
  score: number;
  actions: GameAction[];
}

export function calculateRoundScore(
  stacksDestroyed: number,
  timeSeconds: number,
  reachedFinish: boolean,
  comboCount: number,
): number {
  const base = stacksDestroyed * SCORING.pointsPerStack;
  const timeBonus = reachedFinish
    ? Math.max(0, SCORING.timeBonusMax - timeSeconds * SCORING.timeBonusDivisor)
    : 0;
  const finishBonus = reachedFinish ? SCORING.finishBonus : 0;
  const mult =
    comboCount >= SCORING.comboThreshold ? SCORING.comboMultiplier : 1.0;

  return Math.floor((base + timeBonus + finishBonus) * mult);
}

export function generateGameHash(
  playerAddress: Address,
  score: number,
  sessionId: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32"],
      [playerAddress, BigInt(score), sessionId],
    ),
  );
}

export function totalAccumulatedScore(rounds: RoundResult[]): number {
  return rounds.reduce((sum, round) => sum + round.score, 0);
}
