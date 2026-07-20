"use client";

import { useState } from "react";
import type { TargetPattern, TargetRequirement } from "@/types";
import { shortRequirementLabel } from "@/data/targets";
import { RequirementModal } from "./RequirementModal";

/**
 * "Build this hand" — the four requirement slots assemble left→right into MAHJ.
 * Each slot is a clean, tappable chip showing the set it wants (Pair, Pung,
 * Run…). Tapping opens a modal with a worked example and a plain explanation —
 * the detail lives there, so the row itself stays uncluttered.
 */
export function TargetHand({
  target,
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

  const openReq = reqs.find((r) => r.id === openId) ?? null;

  const open = (id: string) => {
    setOpenId(id);
    onExplainOpen?.();
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
          <Slot key={req.id} req={req} onOpen={() => open(req.id)} />
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

      {openReq && (
        <RequirementModal req={openReq} done={!!openReq.filledBy} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}

function Slot({ req, onOpen }: { req: TargetRequirement; onOpen: () => void }) {
  const done = !!req.filledBy;
  return (
    <li className={`target-slot ${done ? "target-slot--done" : ""}`}>
      <button
        type="button"
        className="target-slot__btn"
        aria-haspopup="dialog"
        aria-label={`${shortRequirementLabel(req)}${done ? ", complete" : ", not yet"}. Tap for how it works.`}
        onClick={onOpen}
      >
        <span className="target-slot__pip" aria-hidden>
          {done ? "✓" : "ⓘ"}
        </span>
        <span className="target-slot__label">{shortRequirementLabel(req)}</span>
      </button>
    </li>
  );
}
