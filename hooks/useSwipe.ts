"use client";

import { useEffect, useRef } from "react";
import type { Direction } from "@/types";

type Options = {
  onSwipe: (dir: Direction) => void;
  enabled?: boolean;
  threshold?: number;
};

/**
 * Pointer/touch swipe recognition for the board, plus arrow + WASD keys.
 * Prevents the page from scrolling while a swipe is in progress over the board.
 */
export function useSwipe<T extends HTMLElement>({ onSwipe, enabled = true, threshold = 22 }: Options) {
  const ref = useRef<T | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onSwipe);
  cb.current = onSwipe;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onDown = (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      fired.current = false;
    };

    const evaluate = (x: number, y: number) => {
      if (!start.current || fired.current) return;
      const dx = x - start.current.x;
      const dy = y - start.current.y;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      fired.current = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        cb.current(dx > 0 ? "right" : "left");
      } else {
        cb.current(dy > 0 ? "down" : "up");
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!start.current) return;
      evaluate(e.clientX, e.clientY);
    };
    const onUp = () => {
      start.current = null;
    };

    // Stop the page from scrolling / rubber-banding during a board swipe.
    const onTouchMove = (e: TouchEvent) => {
      if (start.current) e.preventDefault();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [enabled, threshold]);

  return ref;
}

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

export function useKeyboard(onSwipe: (dir: Direction) => void, enabled = true) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key];
      if (dir) {
        e.preventDefault();
        cb.current(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
