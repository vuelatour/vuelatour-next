"use client";

import { useEffect } from "react";

/**
 * Filosofía §8 del DESIGN_SYSTEM: el admin siempre vive en dark mode
 * (navy-950 background, navy-900 surface). Este componente fuerza la clase
 * .dark en el <html> mientras el usuario esté dentro del área admin, y la
 * restaura según localStorage al salir.
 *
 * El script inline en root layout ya hace el primer paint correcto leyendo
 * la URL — esto solo se encarga de la transición client-side entre páginas.
 */
export function ForceDarkMode() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      try {
        const stored = localStorage.getItem("vt-theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const shouldStayDark = stored === "dark" || (!stored && prefersDark);
        if (!shouldStayDark) {
          document.documentElement.classList.remove("dark");
        }
      } catch {
        // no-op
      }
    };
  }, []);
  return null;
}
