import { useEffect, useState } from "react";
import { TUTORIAL_STEPS } from "../game/tutorial";
import { NeonButton } from "./ui";

// Find the step's target on screen and follow it as the page moves. A step
// may list several selectors: the first one on screen wins.
function useTargetRect(target) {
  const selector = Array.isArray(target) ? target.join("|") : target;
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return undefined;
    }
    let frame;
    let scrolled = false;
    const update = () => {
      const element = selector.split("|").map((entry) => document.querySelector(entry)).find(Boolean);
      const box = element?.getBoundingClientRect();
      if (element && !scrolled) {
        scrolled = true;
        element.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }
      setRect((previous) => {
        if (!box) return null;
        const next = { top: box.top, left: box.left, width: box.width, height: box.height };
        return previous && Object.keys(next).every((key) => Math.abs(previous[key] - next[key]) < 0.5) ? previous : next;
      });
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return rect;
}

// The tutorial's coach mark: a glowing frame around what to look at, and a
// card that explains it. The card sits at the bottom unless the target is in
// the lower part of the screen (a step can pin it with `placement`).
// Everything else stays clickable.
export default function TutorialOverlay({ step, index, onNext, onSkip }) {
  const rect = useTargetRect(step.target);
  const lowTarget = rect && rect.top + rect.height / 2 > window.innerHeight * 0.55;
  const top = step.placement === "top" || (step.placement !== "bottom" && lowTarget);
  const position = step.placement === "under-header" ? "top-14" : top ? "top-2" : "bottom-2";
  const pad = 6;
  return (
    <>
      {rect && (
        <div
          className="pointer-events-none fixed z-[96] rounded-lg border-2 border-yellow-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.35),0_0_18px_rgba(253,224,71,0.8)] transition-all duration-150"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          data-testid="tutorial-highlight"
        />
      )}
      <div
        className={`fixed inset-x-2 z-[97] mx-auto max-w-md rounded-lg border border-yellow-300/80 bg-[#0d0b05]/95 p-3 shadow-2xl ${position}`}
        data-testid="tutorial-card"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-yellow-200">{step.title}</h2>
          <span className="font-mono-g text-[10px] text-slate-500">{index + 1}/{TUTORIAL_STEPS.length}</span>
        </div>
        <p className="mt-1 font-mono-g text-[11px] leading-snug text-slate-200">{step.text}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" className="font-mono-g text-[10px] text-slate-500 underline" onClick={onSkip} data-testid="tutorial-skip">
            {index === TUTORIAL_STEPS.length - 1 ? "" : "Skip tutorial"}
          </button>
          {step.next && <NeonButton color="#FDE047" onClick={onNext} data-testid="tutorial-next">{step.next}</NeonButton>}
        </div>
      </div>
    </>
  );
}
