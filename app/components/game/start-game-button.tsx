"use client";

type StartGameButtonProps = {
  onStart: () => void;
  disabled?: boolean;
  isBusy?: boolean;
  isPeriodExpired?: boolean;
  hasActiveSession?: boolean;
};

export function StartGameButton({
  onStart,
  disabled = false,
  isBusy = false,
  isPeriodExpired = false,
  hasActiveSession = false,
}: StartGameButtonProps) {
  const reason = isPeriodExpired
    ? "Period ended, waiting for reset"
    : hasActiveSession
      ? "Resume your active session"
      : "Gas fee required";

  return (
    <div className="stackball-startOverlay">
      <button
        type="button"
        className="stackball-primary stackball-startButton"
        onClick={onStart}
        disabled={disabled || isBusy}
      >
        {isBusy ? "Starting..." : hasActiveSession ? "Resume Game" : "Start Game"}
        <small>{reason}</small>
      </button>
    </div>
  );
}
