"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { intro } from "../../config/intro";
import { IntroSequence } from "./IntroSequence";

type Status = "checking" | "playing" | "done";

type IntroContextValue = {
  /** true from the moment ribbons start retracting (or immediately if the intro is skipped). */
  revealed: boolean;
  status: Status;
};

const IntroContext = createContext<IntroContextValue>({ revealed: true, status: "done" });

/** Landing sections call this to start their own entrance after the intro hands off. */
export const useIntro = () => useContext(IntroContext);

/**
 * Wrap the app once (see app/layout.tsx). Plays only on the student page ("/"). The landing page always renders underneath;
 * the intro is a fixed overlay on top of it.
 *
 * Dev shortcuts:  ?intro=replay  forces the intro,  ?intro=skip  disables it.
 */
export function IntroProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStudentHome = pathname === "/";
  // Admin routes (and any in-app navigation after the first load) never play the intro.
  const [status, setStatus] = useState<Status>(isStudentHome ? "checking" : "done");
  const [revealed, setRevealed] = useState(!isStudentHome);
  const { storageKey, skipAfterFirstVisit } = intro.meta;

  useEffect(() => {
    if (!isStudentHome) return;
    const force = new URLSearchParams(window.location.search).get("intro");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
    } catch {
      /* storage blocked: play the intro */
    }

    const skip =
      force === "skip" || reducedMotion || (skipAfterFirstVisit && seen && force !== "replay");

    if (skip) {
      setRevealed(true);
      setStatus("done");
    } else {
      setStatus("playing");
    }
    // decide once, on first load: later route changes must not replay it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reveal = useCallback(() => setRevealed(true), []);
  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setRevealed(true);
    setStatus("done");
  }, [storageKey]);

  // no scrolling behind the intro
  useEffect(() => {
    document.documentElement.style.overflow = status === "done" ? "" : "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [status]);

  // Escape skips
  useEffect(() => {
    if (status !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === intro.meta.skipKey) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, finish]);

  const value = useMemo(() => ({ revealed, status }), [revealed, status]);

  return (
    // reducedMotion="user": every framer-motion animation on the site drops its movement for people who ask for less
    <MotionConfig reducedMotion="user">
      <IntroContext.Provider value={value}>
        {/* inert keeps keyboard focus out of the page while the overlay covers it */}
        <div inert={status !== "done"}>{children}</div>
        {status !== "done" && (
          <IntroSequence playing={status === "playing"} onReveal={reveal} onFinish={finish} />
        )}
      </IntroContext.Provider>
    </MotionConfig>
  );
}
