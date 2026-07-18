"use client";

import Lottie from "lottie-react";
import animationData from "./loadingAnimation.json";

/**
 * The delivery-truck loading animation, self-hosted: the Lottie JSON is
 * bundled from this folder and played by the npm lottie-react package, so
 * no CDN script or remote animation fetch is needed and the strict CSP
 * stays intact. Decorative only — pair it with visible loading text.
 */
export function LoadingAnimation({ size = 180 }: { size?: number }) {
  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      style={{ width: size, height: size }}
      className="mx-auto"
      aria-hidden
    />
  );
}
