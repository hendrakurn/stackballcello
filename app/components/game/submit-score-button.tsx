"use client";

type SubmitScoreButtonProps = {
  score: number;
  onSubmit: () => void;
  disabled?: boolean;
  isBusy?: boolean;
};

export function SubmitScoreButton({
  score,
  onSubmit,
  disabled = false,
  isBusy = false,
}: SubmitScoreButtonProps) {
  return (
    <button
      type="button"
      className="stackball-primary"
      onClick={onSubmit}
      disabled={disabled || isBusy}
    >
      {isBusy ? "Submitting..." : "Submit Score"}
      <small>{score.toLocaleString()} points</small>
    </button>
  );
}
