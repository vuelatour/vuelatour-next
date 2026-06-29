"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";

/**
 * Miniatura que, al hacer clic, abre la imagen en un MODAL con zoom (+/−, rueda
 * del mouse) y cerrar (botón, fondo o tecla Esc). Reutilizable para comprobantes,
 * tacómetros, vouchers, etc. Usa URLs firmadas (bucket privado).
 */
export function ImagePreview({
  src,
  alt,
  thumbClassName = "h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500",
}: {
  src: string;
  alt: string;
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(5, s + 0.25));
      if (e.key === "-") setScale((s) => Math.max(1, s - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setScale(1);
          setOpen(true);
        }}
        title="Ver imagen"
        className="inline-flex shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <Image
          src={src}
          alt={alt}
          width={40}
          height={40}
          unoptimized
          className={thumbClassName}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          {/* Barra de controles */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-medium truncate">{alt}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(1, s - 0.25))}
                className="rounded-md p-2 hover:bg-white/15"
                title="Alejar (−)"
              >
                <MagnifyingGlassMinusIcon className="h-5 w-5" />
              </button>
              <span className="w-12 text-center text-xs tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(5, s + 0.25))}
                className="rounded-md p-2 hover:bg-white/15"
                title="Acercar (+)"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1)}
                className="rounded-md p-2 hover:bg-white/15"
                title="Restablecer"
              >
                <ArrowsPointingOutIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={close}
                className="ml-1 rounded-md p-2 hover:bg-white/15"
                title="Cerrar (Esc)"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Imagen (scroll para desplazarse cuando hay zoom) */}
          <div
            className="flex-1 overflow-auto p-4"
            onClick={close}
            onWheel={(e) => {
              if (e.deltaY < 0) setScale((s) => Math.min(5, s + 0.15));
              else setScale((s) => Math.max(1, s - 0.15));
            }}
          >
            <div className="flex min-h-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                style={{ transform: `scale(${scale})` }}
                className="max-h-[80vh] max-w-full origin-center object-contain transition-transform duration-150"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
