"use client";

import { useState } from "react";
import type { TargetPattern, TargetRequirement } from "@/types";
import { explainRequirement } from "@/data/targets";
import { RequirementIcon } from "./RequirementIcon";

/**
 * "Build this hand" — the four requirement slots assemble left→right into MAHJ.
 * During learning, plain-language labels lead ("TWO MATCHING TILES") with the
 * Mahjong term beneath. Tap any slot for a one-sentence explanation.
 */
export function TargetHand({
  target,
  learning,
  onExplainOpen,
}: {
  target: TargetPattern;
  learning?: boolean;
  onExplainOpen?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const reqs = target.requirements;
  const filled = reqs.filter((r) => r.filledBy).length;
  const total = reqs.length;
  const oneLeft = filled === total - 1;

  const toggle = (id: string) => {
    setOpenId((cur) => {
      const next = cur === id ? null : id;
      if (next && onExplainOpen) onExplainOpen();
      return next;
    });
  };

  return (
    <section className="target-hand" aria-label={`Build this hand: ${target.name}`}>
      <div className="target-hand__head">
        <span className="target-hand__name">
          <span className="target-hand__kicker">BUILD THIS HAND</span>
          {target.name}
        </span>
        <span className="target-hand__progress" aria-live="polite">
          {filled} of {total}
        </span>
      </div>

      <ol className="target-hand__slots" data-count={total}>
        {reqs.map((req) => (
          <Slot
            key={req.id}
            req={req}
            learning={learning}
            open={openId === req.id}
            onToggle={() => toggle(req.id)}
          />
        ))}
        <li className="target-mahj" aria-hidden>
          <span className={filled === total ? "target-mahj__flag target-mahj__flag--on" : "target-mahj__flag"}>
            MAHJ
          </span>
        </li>
      </ol>

      {oneLeft && (
        <p className="target-hand__nudge" aria-live="polite">
          One more set for Mahj!
        </p>
      )}
    </section>
  );
}

function Slot({
  req,
  learning,
  open,
  onToggle,
}: {
  req: TargetRequirement;
  learning?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const done = !!req.filledBy;
  const primary = learning && req.plain ? req.plain : req.label;
  const secondary = learning && req.plain ? req.label : undefined;

  return (
    <li className={`target-slot ${done ? "target-slot--done" : ""}`}>
      <button
        type="button"
        className="target-slot__btn"
        aria-expanded={open}
        aria-label={`${req.label}${done ? ", complete" : ", not yet"}. Tap for how it works.`}
        onClick={onToggle}
      >
        <span className="target-slot__icon" aria-hidden>
          {done ? <span className="target-slot__check">✓</span> : <RequirementIcon req={req} />}
        </span>
        <span className="target-slot__text">
          <span className="target-slot__label">{primary}</span>
          {secondary && <span className="target-slot__sub">{secondary}</span>}
        </span>
      </button>
      {open && <p className="target-slot__explain">{explainRequirement(req)}</p>}
    </li>
  );
}
