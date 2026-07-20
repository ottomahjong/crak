"use client";

import type { LearningStage } from "@/types";

// A brief "here's what this hand teaches" card. One concept, shown before the
// player plays it — never a wall of rules.
const CARDS: Record<LearningStage, { title: string; lines: string[]; goal: string }> = {
  1: {
    title: "Hand 1 — Match tiles",
    lines: [
      "Each swipe moves tiles ONE space.",
      "Nudge two matching tiles next to each other, then swipe again to make a PAIR.",
      "Add a third matching tile to make a PUNG.",
    ],
    goal: "Goal: one Pair and one Pung.",
  },
  2: {
    title: "Hand 2 — Build a Run",
    lines: [
      "New this hand: Bams.",
      "Bring 1 and 2 of a suit together to start a run…",
      "…then add the 3 to complete the RUN.",
    ],
    goal: "Goal: a Pair, a Pung and a Run.",
  },
  3: {
    title: "Hand 3 — Dragons",
    lines: [
      "New this hand: Dragons.",
      "Two matching dragons make a pair.",
      "A third makes a dragon pung. Either counts as a Dragon Set.",
    ],
    goal: "Goal: a Pair, any Set and a Dragon Set.",
  },
  4: {
    title: "Hand 4 — The Joker",
    lines: [
      "New this hand: the Joker (gold ★).",
      "A Joker completes a pung or a run.",
      "It can't start a pair, and two jokers never combine.",
    ],
    goal: "Goal: the full hand — Pair, Pung, Run, Dragon Set.",
  },
};

export function LearningIntro({
  stage,
  onStart,
}: {
  stage: LearningStage;
  onStart: () => void;
}) {
  const card = CARDS[stage];
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={card.title}>
      <div className="overlay__card learn-card celebrate">
        <span className="learn-card__step">LEARN · {stage} of 4</span>
        <h2 className="learn-card__title">{card.title}</h2>
        <ul className="learn-card__lines">
          {card.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="learn-card__goal">{card.goal}</p>
        <button className="btn btn--primary btn--lg" onClick={onStart} autoFocus>
          {stage === 1 ? "Start" : "Play this hand"}
        </button>
      </div>
    </div>
  );
}
