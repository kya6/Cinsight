"use client";

import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Skip the animation when motion is reduced or nobody can see it (a background tab pauses animation frames). */
const skipAnimation = () =>
  typeof window === "undefined" ||
  document.hidden ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts up to `value` when it first appears (and eases to new values after).
 * Screen readers get only the final value; with "reduce motion" the final value shows at once.
 */
export function CountUp({ value, format, duration = 800 }: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (skipAnimation()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const next = origin + (value - origin) * easeOutCubic(t);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
