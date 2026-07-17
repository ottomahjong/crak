// Optional haptics via the Vibration API. No-op where unsupported/disabled.

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function vibrate(pattern: number | number[]) {
  if (!enabled || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  tap: () => vibrate(10),
  combine: () => vibrate(18),
  target: () => vibrate([12, 30, 12]),
  mahj: () => vibrate([20, 40, 20, 40, 40]),
  gameover: () => vibrate([60, 40, 120]),
};
