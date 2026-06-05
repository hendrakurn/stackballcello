export type SegmentKind = "safe" | "danger";

export type HelixSegment = {
  id: string;
  startAngle: number;
  endAngle: number;
  kind: SegmentKind;
};

export type HelixPlatform = {
  id: string;
  index: number;
  y: number;
  baseRotation: number;
  color: string;
  segments: HelixSegment[];
};

export type CrashBurst = {
  id: string;
  platformId: string;
  y: number;
  color: string;
  seed: number;
  age: number;
};

export type GameStatus = "ready" | "playing" | "won" | "lost";

export type GameRuntime = {
  ballY: number;
  velocityY: number;
  isSmashing: boolean;
  status: GameStatus;
  levelNumber: number;
  score: number;
  combo: number;
  destroyedIds: Set<string>;
  clearedIds: Set<string>;
  destroyedForCharge: number;
  chargeSeconds: number;
  invincibleSecondsLeft: number;
  contactSeconds: number;
  crashBursts: CrashBurst[];
};

export type GameSnapshot = {
  status: GameStatus;
  levelNumber: number;
  score: number;
  combo: number;
  progress: number;
  chargeRatio: number;
  invincibleRatio: number;
  destroyedIds: Set<string>;
  clearedIds: Set<string>;
  crashBursts: CrashBurst[];
  isSmashing: boolean;
};

export type ScoringInput = {
  points: number;
  platformId: string;
  level: number;
  combo: number;
  destroyedAt: number;
};

export type ScoringReceipt = ScoringInput & {
  hash: string;
};
