"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Group, MathUtils } from "three";
import {
  calculateRoundScore,
  type GameAction,
  type RoundResult,
} from "@/lib/scoring";
import { Ball } from "./ball";
import {
  type GameRuntime,
  type GameSnapshot,
  type HelixPlatform,
  type HelixSegment,
  type ScoringInput,
  type ScoringReceipt,
} from "./game-types";
import { HelixTower } from "./helix-tower";

const UNITY_GRAVITY = -9.81;
const UNITY_JUMP_FORCE = 5;
const UNITY_SMASH_SPEED = 15;
const UNITY_PLATFORM_OFFSET_HEIGHT = 0.4;
const UNITY_PLATFORM_OFFSET_ANGLE = 2;
const PLATFORM_SAFE_PARTS = 2;
const PLATFORM_PARTS = 10;
const DISPLAY_SCALE = 1.16;
const BALL_RENDER_RADIUS = 0.28;
const BALL_RADIUS_UNITY = BALL_RENDER_RADIUS / DISPLAY_SCALE;
const PLATFORM_RENDER_THICKNESS = 0.28;
const PLATFORM_TOP_OFFSET = PLATFORM_RENDER_THICKNESS / DISPLAY_SCALE / 2;
const PLATFORM_COUNT = 50;
const FINISH_PLATFORM_OFFSET = UNITY_PLATFORM_OFFSET_HEIGHT;
const BALL_TRACK_Y = 1.8;
const BALL_ANGLE = (Math.PI * 3) / 2;
const SECONDS_PER_PLATFORM = 0.15;
const INVINCIBLE_SECONDS = 3;
const PLATFORMS_TO_ENABLE_INDICATOR = 10;
const SECONDS_TO_ENABLE_INVINCIBLE = 4;
const MAX_FRAME_DELTA = 1 / 30;
const COLLISION_EPSILON = 0.0001;
const DANGER_COLLISION_GRACE = MathUtils.degToRad(2.5);
const MOBILE_CAMERA_WIDTH = 768;
const MOBILE_PORTRAIT_RATIO = 0.72;
const MOBILE_SMASH_WINDOW_MS = 180;

type StackBallEngineProps = {
  initialLevel?: HelixPlatform[];
  enabled?: boolean;
  resetToken?: number;
  onRoundEnd?: (result: RoundResult) => void;
  onScoreReceipt?: (receipt: ScoringReceipt) => void;
};

function createRuntime(levelNumber = 1): GameRuntime {
  return {
    ballY: 0.9,
    velocityY: 0,
    isSmashing: false,
    status: "ready",
    levelNumber,
    score: 0,
    combo: 0,
    destroyedIds: new Set<string>(),
    clearedIds: new Set<string>(),
    destroyedForCharge: 0,
    chargeSeconds: 0,
    invincibleSecondsLeft: 0,
    contactSeconds: 0,
    crashBursts: [],
  };
}

function createSnapshot(runtime: GameRuntime, platformCount: number): GameSnapshot {
  return {
    status: runtime.status,
    levelNumber: runtime.levelNumber,
    score: runtime.score,
    combo: runtime.combo,
    progress: runtime.clearedIds.size / platformCount,
    chargeRatio: Math.min(1, runtime.chargeSeconds / SECONDS_TO_ENABLE_INVINCIBLE),
    invincibleRatio: runtime.invincibleSecondsLeft / INVINCIBLE_SECONDS,
    destroyedIds: new Set(runtime.destroyedIds),
    clearedIds: new Set(runtime.clearedIds),
    crashBursts: runtime.crashBursts.map((burst) => ({ ...burst })),
    isSmashing: runtime.isSmashing,
  };
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2;
  let normalized = angle % fullTurn;

  if (normalized < 0) {
    normalized += fullTurn;
  }

  return normalized;
}

function angleInSegment(angle: number, segment: HelixSegment, inset = 0) {
  const start = normalizeAngle(segment.startAngle);
  const span = normalizeAngle(segment.endAngle - segment.startAngle);
  const distanceFromStart = normalizeAngle(angle - start);

  return (
    span > inset * 2 &&
    distanceFromStart >= inset &&
    distanceFromStart <= span - inset
  );
}

function segmentAtBallAngle(platform: HelixPlatform, towerRotation: number) {
  const localAngle = normalizeAngle(BALL_ANGLE - towerRotation - platform.baseRotation);
  const segment = platform.segments.find((candidate) =>
    angleInSegment(localAngle, candidate),
  );

  return segment ? { segment, localAngle } : null;
}

function createPlatform(index: number, levelNumber: number): HelixPlatform {
  const step = (Math.PI * 2) / PLATFORM_PARTS;
  const segmentArc = step;
  const dangerAnchor = (index * 3 + levelNumber) % PLATFORM_PARTS;
  const samePlatformDangerParts = Math.min(
    PLATFORM_PARTS - PLATFORM_SAFE_PARTS,
    1 + Math.floor((levelNumber + index) / 15),
  );
  const dangerIndexes = new Set(
    Array.from({ length: PLATFORM_PARTS }, (_, slot) => slot)
      .sort(
        (left, right) =>
          ((left - dangerAnchor + PLATFORM_PARTS) % PLATFORM_PARTS) -
          ((right - dangerAnchor + PLATFORM_PARTS) % PLATFORM_PARTS),
      )
      .slice(0, samePlatformDangerParts),
  );

  return {
    id: `platform-${levelNumber}-${index}`,
    index,
    y: -index * UNITY_PLATFORM_OFFSET_HEIGHT,
    baseRotation: MathUtils.degToRad(index * UNITY_PLATFORM_OFFSET_ANGLE),
    color: `hsl(${(185 + index * 9 + levelNumber * 17) % 360}, 78%, 54%)`,
    segments: Array.from({ length: PLATFORM_PARTS }, (_, slot) => {
      const center = slot * step;

      return {
        id: `segment-${levelNumber}-${index}-${slot}`,
        startAngle: center - segmentArc / 2,
        endAngle: center + segmentArc / 2,
        kind: dangerIndexes.has(slot) ? "danger" : "safe",
      } satisfies HelixSegment;
    }),
  };
}

function getFinishY(level: HelixPlatform[]) {
  const lowestPlatform = level.at(-1);

  return lowestPlatform ? lowestPlatform.y - FINISH_PLATFORM_OFFSET : -FINISH_PLATFORM_OFFSET;
}

export function createHelixLevel(
  platformCount = PLATFORM_COUNT,
  levelNumber = 1,
): HelixPlatform[] {
  return Array.from({ length: platformCount }, (_, index) =>
    createPlatform(index + 1, levelNumber),
  );
}

export async function handleScoring(points: ScoringInput): Promise<ScoringReceipt> {
  const payload = JSON.stringify({
    points: points.points,
    platformId: points.platformId,
    level: points.level,
    combo: points.combo,
    destroyedAt: points.destroyedAt,
  });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    ...points,
    hash,
  };
}

function GameScene({
  level,
  snapshot,
  runtimeRef,
  snapshotRef,
  towerRotationRef,
  roundActionsRef,
  maxComboRef,
  publishSnapshot,
  onScoreReceipt,
}: {
  level: HelixPlatform[];
  snapshot: GameSnapshot;
  runtimeRef: RefObject<GameRuntime>;
  snapshotRef: RefObject<GameSnapshot>;
  towerRotationRef: RefObject<number>;
  roundActionsRef: RefObject<GameAction[]>;
  maxComboRef: RefObject<number>;
  publishSnapshot: () => void;
  onScoreReceipt?: (receipt: ScoringReceipt) => void;
}) {
  const worldRef = useRef<Group>(null);
  const lastPublishedRef = useRef(0);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, MAX_FRAME_DELTA);
    const runtime = runtimeRef.current;
    const world = worldRef.current;

    if (!runtime) {
      return;
    }

    if (world) {
      world.position.y = BALL_TRACK_Y - runtime.ballY * DISPLAY_SCALE;
    }

    if (runtime.status !== "playing") {
      return;
    }

    const previousY = runtime.ballY;
    runtime.contactSeconds = Math.max(0, runtime.contactSeconds - frameDelta);
    runtime.crashBursts = runtime.crashBursts
      .map((burst) => ({ ...burst, age: burst.age + frameDelta }))
      .filter((burst) => burst.age < 0.62);
    runtime.invincibleSecondsLeft = Math.max(
      0,
      runtime.invincibleSecondsLeft - frameDelta,
    );

    if (runtime.isSmashing) {
      runtime.velocityY = -UNITY_SMASH_SPEED;
    } else {
      runtime.velocityY += UNITY_GRAVITY * frameDelta;
    }

    runtime.ballY += runtime.velocityY * frameDelta;

    const previousBallBottom = previousY - BALL_RADIUS_UNITY;
    const currentBallBottom = runtime.ballY - BALL_RADIUS_UNITY;
    const previousBallTop = previousY + BALL_RADIUS_UNITY;
    const currentBallTop = runtime.ballY + BALL_RADIUS_UNITY;

    for (const platform of level) {
      if (runtime.clearedIds.has(platform.id)) {
        continue;
      }

      const platformTop = platform.y + PLATFORM_TOP_OFFSET;
      const platformBottom = platform.y - PLATFORM_TOP_OFFSET;
      const crossedDown =
        previousBallBottom >= platformTop - COLLISION_EPSILON &&
        currentBallBottom <= platformTop + COLLISION_EPSILON;
      const crossedUp =
        previousBallTop <= platformBottom + COLLISION_EPSILON &&
        currentBallTop >= platformBottom - COLLISION_EPSILON;

      if (!crossedDown && !crossedUp) {
        continue;
      }

      const segment = segmentAtBallAngle(platform, towerRotationRef.current ?? 0);

      if (!segment) {
        runtime.destroyedIds.add(platform.id);
        runtime.clearedIds.add(platform.id);
        publishSnapshot();
        continue;
      }

      if (crossedUp) {
        runtime.ballY = platformBottom - BALL_RADIUS_UNITY;
        runtime.velocityY = -UNITY_JUMP_FORCE * 0.65;
        runtime.combo = 0;
        runtime.contactSeconds = 0.12;
        publishSnapshot();
        break;
      }

      if (!runtime.isSmashing) {
        runtime.ballY = platformTop + BALL_RADIUS_UNITY;
        runtime.velocityY = UNITY_JUMP_FORCE;
        runtime.combo = 0;
        runtime.contactSeconds = 0.16;
        publishSnapshot();
        break;
      }

      const isInvincible = runtime.invincibleSecondsLeft > 0;
      const isDangerHit =
        segment.segment.kind === "danger" &&
        angleInSegment(
          segment.localAngle,
          segment.segment,
          DANGER_COLLISION_GRACE,
        );

      if (isDangerHit && !isInvincible) {
        runtime.status = "lost";
        runtime.isSmashing = false;
        runtime.velocityY = 0;
        publishSnapshot();
        break;
      }

      runtime.destroyedIds.add(platform.id);
      runtime.clearedIds.add(platform.id);
      runtime.combo += 1;
      maxComboRef.current = Math.max(maxComboRef.current, runtime.combo);
      runtime.contactSeconds = 0.08;
      runtime.crashBursts.push({
        id: `burst-${platform.id}-${runtime.combo}-${Date.now()}`,
        platformId: platform.id,
        y: platform.y,
        color: segment.segment.kind === "danger" ? "#111827" : platform.color,
        seed: platform.index * 13 + runtime.combo * 7,
        age: 0,
      });

      const points = isInvincible ? 2 : 1;
      runtime.score += points;
      roundActionsRef.current.push({
        type: "stack",
        timestamp: Date.now(),
        id: platform.id,
      });

      if (!isInvincible) {
        runtime.destroyedForCharge += 1;

        if (runtime.destroyedForCharge >= PLATFORMS_TO_ENABLE_INDICATOR) {
          runtime.chargeSeconds += SECONDS_PER_PLATFORM;
        }

        if (runtime.chargeSeconds >= SECONDS_TO_ENABLE_INVINCIBLE) {
          runtime.invincibleSecondsLeft = INVINCIBLE_SECONDS;
          runtime.chargeSeconds = 0;
          runtime.destroyedForCharge = 0;
        }
      }

      void handleScoring({
        points,
        platformId: platform.id,
        level: runtime.levelNumber,
        combo: runtime.combo,
        destroyedAt: Date.now(),
      })
        .then((receipt) => onScoreReceipt?.(receipt))
        .catch(() => undefined);

      publishSnapshot();
    }

    const finishTop = getFinishY(level) + PLATFORM_TOP_OFFSET;
    const crossedFinish =
      runtime.clearedIds.size >= level.length &&
      previousBallBottom >= finishTop - COLLISION_EPSILON &&
      currentBallBottom <= finishTop + COLLISION_EPSILON;

    if (crossedFinish) {
      runtime.ballY = finishTop + BALL_RADIUS_UNITY;
      runtime.status = "won";
      runtime.isSmashing = false;
      runtime.velocityY = 0;
      publishSnapshot();
    }

    lastPublishedRef.current += frameDelta;

    if (lastPublishedRef.current >= 0.12) {
      lastPublishedRef.current = 0;
      const current = snapshotRef.current;

      if (
        current.status !== runtime.status ||
        current.isSmashing !== runtime.isSmashing ||
        current.score !== runtime.score ||
        current.combo !== runtime.combo ||
        current.progress !== runtime.clearedIds.size / level.length ||
        current.crashBursts.length !== runtime.crashBursts.length ||
        runtime.crashBursts.length > 0 ||
        current.invincibleRatio !== runtime.invincibleSecondsLeft / INVINCIBLE_SECONDS
      ) {
        publishSnapshot();
      }
    }
  });

  return (
    <group ref={worldRef}>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 7, 4]} intensity={2.2} castShadow />
      <pointLight position={[-3, 4, 3]} intensity={5} color="#55d6ff" />
      <Ball
        runtimeRef={runtimeRef}
        displayScale={DISPLAY_SCALE}
        radius={BALL_RENDER_RADIUS}
      />
      <HelixTower
        level={level}
        destroyedIds={snapshot.destroyedIds}
        crashBursts={snapshot.crashBursts}
        towerRotationRef={towerRotationRef}
        displayScale={DISPLAY_SCALE}
        finishY={getFinishY(level)}
      />
    </group>
  );
}

export function StackBallEngine({
  initialLevel,
  enabled = true,
  resetToken = 0,
  onRoundEnd,
  onScoreReceipt,
}: StackBallEngineProps) {
  const initialRuntime = createRuntime(1);
  const [levelNumber, setLevelNumber] = useState(1);
  const [level, setLevel] = useState<HelixPlatform[]>(
    () => initialLevel ?? createHelixLevel(PLATFORM_COUNT, 1),
  );
  const runtimeRef = useRef<GameRuntime>(initialRuntime);
  const towerRotationRef = useRef(0);
  const roundStartRef = useRef<number | null>(null);
  const roundEndedRef = useRef(false);
  const roundActionsRef = useRef<GameAction[]>([]);
  const maxComboRef = useRef(0);
  const resetTokenRef = useRef(resetToken);
  const smashStartedAtRef = useRef<number | null>(null);
  const smashReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPressingRef = useRef(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() =>
    createSnapshot(initialRuntime, level.length),
  );
  const snapshotRef = useRef(snapshot);
  const isMobilePortrait = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      window.addEventListener("resize", onStoreChange);

      return () => {
        window.removeEventListener("resize", onStoreChange);
      };
    },
    () =>
      window.innerWidth <= MOBILE_CAMERA_WIDTH &&
      window.innerWidth / Math.max(window.innerHeight, 1) < MOBILE_PORTRAIT_RATIO,
    () => false,
  );
  const cameraSettings = useMemo(
    () =>
      isMobilePortrait
        ? { position: [0, 3.15, 8.6] as [number, number, number], fov: 46 }
        : { position: [0, 3.4, 7.2] as [number, number, number], fov: 42 },
    [isMobilePortrait],
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    return () => {
      if (smashReleaseTimeoutRef.current) {
        clearTimeout(smashReleaseTimeoutRef.current);
      }
    };
  }, []);

  const publishSnapshot = useCallback(() => {
    setSnapshot(createSnapshot(runtimeRef.current, level.length));
  }, [level.length]);

  const reset = useCallback((nextLevelNumber = levelNumber) => {
    const nextLevel = createHelixLevel(PLATFORM_COUNT, nextLevelNumber);

    runtimeRef.current = createRuntime(nextLevelNumber);
    towerRotationRef.current = 0;
    roundStartRef.current = null;
    // Keep the previous round marked as ended until the next round actually starts.
    // This prevents the stale won/lost snapshot from firing onRoundEnd again
    // during the reset render after "Play Again".
    roundEndedRef.current = true;
    roundActionsRef.current = [];
    maxComboRef.current = 0;
    setLevelNumber(nextLevelNumber);
    setLevel(nextLevel);
    setSnapshot(createSnapshot(runtimeRef.current, nextLevel.length));
  }, [levelNumber]);

  useEffect(() => {
    if (resetTokenRef.current === resetToken) {
      return;
    }

    resetTokenRef.current = resetToken;
    reset(snapshotRef.current.status === "won" ? levelNumber + 1 : levelNumber);
  }, [levelNumber, reset, resetToken]);

  useEffect(() => {
    if (
      roundEndedRef.current ||
      (snapshot.status !== "lost" && snapshot.status !== "won")
    ) {
      return;
    }

    roundEndedRef.current = true;
    const now = Date.now();
    const reachedFinish = snapshot.status === "won";
    const endAction: GameAction = {
      type: reachedFinish ? "finish" : "gameover",
      timestamp: now,
      id: `${snapshot.levelNumber}-${snapshot.status}-${now}`,
    };
    const actions = [...roundActionsRef.current, endAction];
    const timeSeconds = Math.max(
      1,
      Math.round((now - (roundStartRef.current ?? now)) / 1000),
    );
    const score = calculateRoundScore(
      snapshot.score,
      timeSeconds,
      reachedFinish,
      maxComboRef.current,
    );

    onRoundEnd?.({
      stacksDestroyed: snapshot.score,
      timeSeconds,
      reachedFinish,
      comboCount: maxComboRef.current,
      score,
      actions,
    });
  }, [onRoundEnd, snapshot]);

  const startSmash = useCallback(() => {
    if (!enabled) {
      return;
    }

    const runtime = runtimeRef.current;

    if (runtime.status === "ready") {
      runtime.status = "playing";
      roundStartRef.current = Date.now();
      roundEndedRef.current = false;
      roundActionsRef.current = [];
      maxComboRef.current = 0;
    }

    if (runtime.status !== "playing") {
      return;
    }

    isPressingRef.current = true;
    smashStartedAtRef.current = Date.now();
    if (smashReleaseTimeoutRef.current) {
      clearTimeout(smashReleaseTimeoutRef.current);
      smashReleaseTimeoutRef.current = null;
    }
    runtime.isSmashing = true;
    publishSnapshot();
  }, [enabled, publishSnapshot]);

  const stopSmash = useCallback(() => {
    isPressingRef.current = false;

    if (smashReleaseTimeoutRef.current) {
      clearTimeout(smashReleaseTimeoutRef.current);
      smashReleaseTimeoutRef.current = null;
    }

    const startedAt = smashStartedAtRef.current;
    const elapsed = startedAt ? Date.now() - startedAt : MOBILE_SMASH_WINDOW_MS;
    const remaining = Math.max(0, MOBILE_SMASH_WINDOW_MS - elapsed);

    const releaseSmash = () => {
      if (isPressingRef.current) {
        return;
      }

      runtimeRef.current.isSmashing = false;
      smashReleaseTimeoutRef.current = null;
      publishSnapshot();
    };

    if (remaining === 0) {
      releaseSmash();
      return;
    }

    smashReleaseTimeoutRef.current = setTimeout(releaseSmash, remaining);
  }, [publishSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        startSmash();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        stopSmash();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startSmash, stopSmash]);

  return (
    <main
      className="stackball-engine"
      onPointerDown={startSmash}
      onPointerUp={stopSmash}
      onPointerCancel={stopSmash}
      onPointerLeave={stopSmash}
    >
      <Canvas
        shadows
        camera={cameraSettings}
        className="stackball-engineCanvas"
      >
        <fog attach="fog" args={["#8ed8ff", 8, 18]} />
        <GameScene
          level={level}
          snapshot={snapshot}
          runtimeRef={runtimeRef}
          snapshotRef={snapshotRef}
          towerRotationRef={towerRotationRef}
          roundActionsRef={roundActionsRef}
          maxComboRef={maxComboRef}
          publishSnapshot={publishSnapshot}
          onScoreReceipt={onScoreReceipt}
        />
      </Canvas>

      <section className="stackball-engineHud" aria-live="polite">
        <div>
          <span>Level</span>
          <strong>{snapshot.levelNumber}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div>
          <span>Combo</span>
          <strong>{snapshot.combo}</strong>
        </div>
      </section>

      <div className="stackball-engineMeter" aria-hidden="true">
        <div
          className={snapshot.invincibleRatio > 0 ? "is-invincible" : ""}
          style={{
            width: `${Math.max(
              snapshot.invincibleRatio,
              snapshot.chargeRatio,
            ) * 100}%`,
          }}
        />
      </div>

      {snapshot.status !== "playing" ? (
        <section className="stackball-engineOverlay">
          <p>
            {snapshot.status === "ready"
              ? "Hold to smash"
              : snapshot.status === "won"
                ? "Level cleared"
                : "Game over"}
          </p>
          {snapshot.status !== "ready" ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                reset(snapshot.status === "won" ? levelNumber + 1 : levelNumber);
              }}
            >
              {snapshot.status === "won" ? "Next level" : "Restart"}
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
