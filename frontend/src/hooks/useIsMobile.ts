"use client";

import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const isSmallScreen = window.innerWidth < breakpoint;
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      setIsMobile(isSmallScreen || isTouch);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}
