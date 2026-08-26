"use client";

import { useSyncExternalStore } from "react";
import { LottieSvg } from "lottie-react";
import animationData from "../../../public/animations/airplane-animation.json";

/** Suscripción a prefers-reduced-motion (patrón useSyncExternalStore: sin
 *  setState en effects). En el SERVER reporta `true` → se pinta el fallback
 *  estático (cero flash) y el Lottie entra al hidratar si hay movimiento. */
function suscribir(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const leer = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const leerServer = () => true;

/**
 * El avión de la marca volando (Lottie subido por el cliente,
 * public/animations/airplane-animation.json — loop de 2s, colores brand).
 * Con `prefers-reduced-motion` (o en SSR) se muestra el `fallback` estático.
 */
export function VtPlaneLottie({
  fallback,
  className,
}: {
  fallback: React.ReactNode;
  className?: string;
}) {
  const reducido = useSyncExternalStore(suscribir, leer, leerServer);
  if (reducido) return <>{fallback}</>;
  return (
    <LottieSvg
      src={animationData}
      loop
      autoplay
      className={className}
      aria-hidden="true"
    />
  );
}
