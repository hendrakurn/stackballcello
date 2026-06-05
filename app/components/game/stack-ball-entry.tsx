"use client";

import dynamic from "next/dynamic";
import type { RoundResult } from "@/lib/scoring";

type StackBallEntryProps = {
  enabled?: boolean;
  resetToken?: number;
  onRoundEnd?: (result: RoundResult) => void;
};

export const StackBallEntry = dynamic<StackBallEntryProps>(
  () => import("./stack-ball-engine").then((module) => module.StackBallEngine),
  {
    ssr: false,
    loading: () => <main className="stackball-engine" />,
  },
);
