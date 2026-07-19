"use client";

import type { LearningStage } from "@/types";

type Props = {
  bonus: number;
  round: number;
  learning?: LearningStage;
  onContinue: () => void;
};

const LEARN_NEXT: Record<LearningStage, string> = {
  1: "Next: build a Run.",
  2: "Next: meet the Dragons.",
  3: "Next: the Joker.",
  4: "You've learned it all — endless mode unlocks next.",
};

export function MahjOverlay({ bonus, round, learning, onContinue }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Hand complete">
      <div className="overlay__card celebrate">
        <div className="mahj-word">MAHJ!</div>
        <p className="overlay__sub">You filled every slot in the hand.</p>
        <div className="mahj-bonus">+{bonus.toLocaleString()}</div>
        {learning ? (
          <p className="overlay__note">{LEARN_NEXT[learning]}</p>
        ) : (
          <p className="overlay__note">
            Round {round + 1} begins — your four sets cash in for room.
          </p>
        )}
        <button className="btn btn--primary" onClick={onContinue} autoFocus>
          {learning === 4 ? "Enter endless mode" : learning ? "Next hand" : "Keep playing"}
        </button>
      </div>
    </div>
  );
}
