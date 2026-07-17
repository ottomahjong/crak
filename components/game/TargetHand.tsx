"use client";

import type { TargetPattern } from "@/types";

export function TargetHand({ target }: { target: TargetPattern }) {
  const filled = target.requirements.filter((r) => r.filledBy).length;
  return (
    <section className="target-hand" aria-label={`Target: ${target.name}`}>
      <div className="target-hand__head">
        <span className="target-hand__name">{target.name}</span>
        <span className="target-hand__progress" aria-label={`${filled} of 4 complete`}>
          {filled}/4
        </span>
      </div>
      <ol className="target-hand__slots">
        {target.requirements.map((req) => {
          const done = !!req.filledBy;
          return (
            <li
              key={req.id}
              className={`target-slot ${done ? "target-slot--done" : ""}`}
              aria-label={`${req.label}${done ? ", complete" : ", not yet"}`}
            >
              <span className="target-slot__check" aria-hidden>
                {done ? "✓" : ""}
              </span>
              <span className="target-slot__label">{req.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
