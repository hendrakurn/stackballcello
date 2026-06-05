"use client";

import { useEffect, useRef, useState } from "react";

type PlatformSegment = {
  start: number;
  end: number;
  kind: "safe" | "danger";
};

type Platform = {
  id: number;
  y: number;
  rotation: number;
  rotationSpeed: number;
  cleared: boolean;
  destroyed: boolean;
  segments: PlatformSegment[];
};

type Status = "ready" | "playing" | "won" | "lost";

type GameState = {
  level: number;
  score: number;
  ballY: number;
  ballVelocity: number;
  isPressing: boolean;
  status: Status;
  streak: number;
  heat: number;
  destroyedCount: number;
  invincibleUntil: number;
  platforms: Platform[];
};

type RenderState = {
  level: number;
  score: number;
  status: Status;
  ballY: number;
  streak: number;
  heatRatio: number;
  invincibleRatio: number;
  isInvincible: boolean;
  isPressing: boolean;
  platforms: Platform[];
};

const PLATFORM_COUNT = 9;
const PLATFORM_SPACING = 130;
const PLATFORM_RADIUS = 132;
const BALL_RADIUS = 24;
const BALL_SCREEN_Y = 146;
const HEAT_TO_INVINCIBLE = 4;
const INVINCIBLE_MS = 3200;
const BOUNCE_VELOCITY = -940;
const FALL_ACCELERATION = 1950;
const SMASH_ACCELERATION = 4100;
const MAX_FALL_SPEED = 1180;
const COLLISION_EPSILON = 0.1;
const DANGER_EDGE_GRACE = 3;

function normalizeAngle(angle: number) {
  let normalized = angle % 360;

  if (normalized < 0) {
    normalized += 360;
  }

  return normalized;
}

function angleWithin(angle: number, start: number, end: number, inset = 0) {
  const span = normalizeAngle(end - start);
  const distanceFromStart = normalizeAngle(angle - start);

  return (
    span > inset * 2 &&
    distanceFromStart >= inset &&
    distanceFromStart <= span - inset
  );
}

function getSegmentAtAngle(platform: Platform, angle: number) {
  return platform.segments.find((segment) =>
    angleWithin(angle, segment.start, segment.end),
  );
}

function createPlatform(index: number, level: number): Platform {
  const slotCount = 8;
  const step = 360 / slotCount;
  const segmentWidth = step;
  const dangerAnchor = (index * 3 + level) % slotCount;
  const dangerCount = Math.min(3, 1 + Math.floor((level + index) / 4));
  const dangerIndexes = new Set<number>();

  for (let offset = 0; offset < slotCount && dangerIndexes.size < dangerCount; offset++) {
    const candidate = (dangerAnchor + offset * 2) % slotCount;

    dangerIndexes.add(candidate);
  }

  const segments: PlatformSegment[] = [];

  for (let slot = 0; slot < slotCount; slot++) {
    const center = slot * step;
    const start = normalizeAngle(center - segmentWidth / 2);
    const end = normalizeAngle(center + segmentWidth / 2);

    segments.push({
      start,
      end,
      kind: dangerIndexes.has(slot) ? "danger" : "safe",
    });
  }

  return {
    id: index,
    y: (index + 1) * PLATFORM_SPACING,
    rotation: (index * 33) % 360,
    rotationSpeed: index % 2 === 0 ? 38 + index * 1.8 : -42 - index * 1.6,
    cleared: false,
    destroyed: false,
    segments,
  };
}

function createGameState(level = 1): GameState {
  return {
    level,
    score: 0,
    ballY: 0,
    ballVelocity: 0,
    isPressing: false,
    status: "ready",
    streak: 0,
    heat: 0,
    destroyedCount: 0,
    invincibleUntil: 0,
    platforms: Array.from({ length: PLATFORM_COUNT }, (_, index) =>
      createPlatform(index, level),
    ),
  };
}

function toRenderState(state: GameState, now: number): RenderState {
  const invincibleLeft = Math.max(0, state.invincibleUntil - now);

  return {
    level: state.level,
    score: state.score,
    status: state.status,
    ballY: state.ballY,
    streak: state.streak,
    heatRatio: Math.min(1, state.heat / HEAT_TO_INVINCIBLE),
    invincibleRatio: invincibleLeft > 0 ? invincibleLeft / INVINCIBLE_MS : 0,
    isInvincible: invincibleLeft > 0,
    isPressing: state.isPressing,
    platforms: state.platforms,
  };
}

function getPlatformGradient(platform: Platform, hue: number) {
  const safeColor = `hsl(${hue} 86% 58%)`;
  const dangerColor = "hsl(220 18% 12%)";
  const slices = [...platform.segments]
    .sort((left, right) => left.start - right.start)
    .map((segment) => {
      const color = segment.kind === "danger" ? dangerColor : safeColor;
      const start = segment.start.toFixed(2);
      const end = segment.end.toFixed(2);

      return `transparent ${start}deg, ${color} ${start}deg ${end}deg, transparent ${end}deg`;
    });

  return `conic-gradient(from 0deg, ${slices.join(", ")})`;
}

export function StackBallGame() {
  const initialState = createGameState();
  const stateRef = useRef<GameState>(initialState);
  const lastFrameRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [renderState, setRenderState] = useState<RenderState>(() =>
    toRenderState(initialState, 0),
  );

  useEffect(() => {
    const step = (now: number) => {
      const state = stateRef.current;
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.024, (now - last) / 1000);

      lastFrameRef.current = now;

      for (const platform of state.platforms) {
        platform.rotation = normalizeAngle(
          platform.rotation + platform.rotationSpeed * dt,
        );
      }

      if (state.status === "playing") {
        const wasInvincible = now < state.invincibleUntil;
        const previousBallY = state.ballY;
        const acceleration = state.isPressing ? SMASH_ACCELERATION : FALL_ACCELERATION;

        state.ballVelocity = Math.min(
          MAX_FALL_SPEED,
          state.ballVelocity + acceleration * dt,
        );
        state.ballY += state.ballVelocity * dt;

        const platforms = state.platforms
          .filter((platform) => platform.cleared === false)
          .sort((left, right) => left.y - right.y);

        for (const platform of platforms) {
          const crossedDown =
            previousBallY + BALL_RADIUS <= platform.y + COLLISION_EPSILON &&
            state.ballY + BALL_RADIUS >= platform.y - COLLISION_EPSILON;
          const crossedUp =
            previousBallY - BALL_RADIUS >= platform.y - COLLISION_EPSILON &&
            state.ballY - BALL_RADIUS <= platform.y + COLLISION_EPSILON;

          if (crossedDown === false && crossedUp === false) {
            continue;
          }

          const angle = normalizeAngle(90 - platform.rotation);
          const segment = getSegmentAtAngle(platform, angle);

          if (!segment) {
            platform.cleared = true;
            platform.destroyed = true;
            state.destroyedCount += 1;

            if (state.destroyedCount === state.platforms.length) {
              state.status = "won";
              state.isPressing = false;
              state.ballVelocity = 0;
              break;
            }

            continue;
          }

          if (crossedUp) {
            state.ballY = platform.y + BALL_RADIUS;
            state.ballVelocity = Math.abs(BOUNCE_VELOCITY) * 0.65;
            state.streak = 0;
            break;
          }

          if (state.isPressing) {
            const isInvincible = now < state.invincibleUntil;
            const hitDangerCore =
              segment.kind === "danger" &&
              angleWithin(
                angle,
                segment.start,
                segment.end,
                DANGER_EDGE_GRACE,
              );

            if (hitDangerCore && isInvincible === false) {
              state.status = "lost";
              state.isPressing = false;
              state.ballVelocity = 0;
              break;
            }

            platform.cleared = true;
            platform.destroyed = true;
            state.destroyedCount += 1;
            state.streak += 1;
            state.score += isInvincible ? 2 : 1;

            if (isInvincible === false) {
              state.heat += 1;

              if (state.heat >= HEAT_TO_INVINCIBLE) {
                state.invincibleUntil = now + INVINCIBLE_MS;
                state.heat = 0;
              }
            }

            if (state.destroyedCount === state.platforms.length) {
              state.status = "won";
              state.isPressing = false;
              state.ballVelocity = 0;
              break;
            }

            continue;
          }

          state.ballY = platform.y - BALL_RADIUS;
          state.ballVelocity = BOUNCE_VELOCITY;
          state.streak = 0;

          if (wasInvincible === false) {
            state.heat = Math.max(0, state.heat - 0.35);
          }

          break;
        }
      }

      setRenderState(toRenderState(state, now));
      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const release = () => {
      stateRef.current.isPressing = false;
    };

    const press = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();

      if (stateRef.current.status === "ready") {
        stateRef.current.status = "playing";
      }

      stateRef.current.isPressing = true;
    };

    const lift = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();
      release();
    };

    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("keyup", lift);
    window.addEventListener("keydown", press);

    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keyup", lift);
      window.removeEventListener("keydown", press);
    };
  }, []);

  const handlePress = () => {
    if (stateRef.current.status === "ready") {
      stateRef.current.status = "playing";
    }

    if (stateRef.current.status === "lost" || stateRef.current.status === "won") {
      return;
    }

    stateRef.current.isPressing = true;
  };

  const handleRelease = () => {
    stateRef.current.isPressing = false;
  };

  const restart = () => {
    const nextLevel =
      stateRef.current.status === "won"
        ? Math.min(stateRef.current.level + 1, 99)
        : stateRef.current.level;

    stateRef.current = createGameState(nextLevel);
    lastFrameRef.current = null;
    setRenderState(toRenderState(stateRef.current, performance.now()));
  };

  return (
    <main className="stackball-shell">
      <section className="stackball-panel">
        <header className="stackball-header">
          <div>
            <p className="stackball-label">Next.js Port</p>
            <h1 className="stackball-title">Stack Balls</h1>
          </div>
          <button className="stackball-reset" type="button" onClick={restart}>
            {renderState.status === "won" ? "Level berikutnya" : "Mulai ulang"}
          </button>
        </header>

        <div
          className="stackball-stage"
          onPointerDown={handlePress}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
        >
          <div className="stackball-hud">
            <div className="stackball-stat">
              <span className="stackball-statLabel">Level</span>
              <strong>{renderState.level}</strong>
            </div>
            <div className="stackball-stat">
              <span className="stackball-statLabel">Score</span>
              <strong>{renderState.score}</strong>
            </div>
            <div className="stackball-stat">
              <span className="stackball-statLabel">Streak</span>
              <strong>{renderState.streak}</strong>
            </div>
          </div>

          <div className="stackball-meter">
            <div
              className={`stackball-meterFill ${renderState.isInvincible ? "is-invincible" : ""}`}
              style={{
                width: `${(renderState.isInvincible
                  ? renderState.invincibleRatio
                  : renderState.heatRatio) * 100}%`,
              }}
            />
          </div>

          <div className="stackball-statusPill">
            {renderState.isInvincible ? "Invincible" : "Charge smash"}
          </div>

          <div className="stackball-shaft" />

          {renderState.platforms.map((platform, index) => {
            const top = BALL_SCREEN_Y + (platform.y - renderState.ballY) * 0.72;
            const hue = 20 + ((index * 31 + renderState.level * 18) % 260);

            return (
              <div
                key={platform.id}
                className={`stackball-platform ${platform.destroyed ? "is-destroyed" : ""}`}
                style={{
                  top: `${top}px`,
                  width: `${PLATFORM_RADIUS * 2}px`,
                  height: `${PLATFORM_RADIUS * 2}px`,
                  transform: `translateX(-50%) rotate(${platform.rotation}deg) scaleY(0.27)`,
                }}
              >
                <div
                  className="stackball-platformRing"
                  style={{ backgroundImage: getPlatformGradient(platform, hue) }}
                />
              </div>
            );
          })}

          <div
            className={`stackball-ball ${renderState.isPressing ? "is-pressed" : ""} ${renderState.isInvincible ? "is-invincible" : ""}`}
            style={{ top: `${BALL_SCREEN_Y}px` }}
          />

          {renderState.status !== "playing" ? (
            <div className="stackball-overlay">
              <p className="stackball-overlayKicker">
                {renderState.status === "ready"
                  ? "Tahan untuk menghancurkan stack"
                  : renderState.status === "won"
                    ? "Level selesai"
                    : "Game over"}
              </p>
              <h2 className="stackball-overlayTitle">
                {renderState.status === "ready"
                  ? "Tekan dan tahan untuk mulai"
                  : renderState.status === "won"
                    ? "Turun bersih sampai dasar"
                    : "Kena segmen gelap"}
              </h2>
              <button className="stackball-overlayButton" type="button" onClick={restart}>
                {renderState.status === "ready"
                  ? "Main"
                  : renderState.status === "won"
                    ? "Lanjut level"
                    : "Coba lagi"}
              </button>
            </div>
          ) : null}
        </div>

        <footer className="stackball-footer">
          <p>Klik atau tahan layar untuk smash. Lepaskan untuk bounce di segmen aman.</p>
          <p>Segmen gelap mematikan kecuali meter penuh dan mode invincible aktif.</p>
        </footer>
      </section>
    </main>
  );
}
