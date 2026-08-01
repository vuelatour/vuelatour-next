"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Arrastres de menos de esto son un clic (no deben cerrar por accidente). */
const UMBRAL_ARRASTRE_PX = 4;

/**
 * Miniatura que, al hacer clic, abre la imagen en un MODAL con zoom y
 * ARRASTRE: con zoom se recorre la foto con el mouse (o el dedo). Antes el
 * zoom era solo `scale()` y la parte ampliada quedaba fuera de la pantalla sin
 * forma de alcanzarla — leer un ticket o un tacómetro de cerca era imposible.
 *
 * Reutilizable para comprobantes, tacómetros, vouchers, etc. Usa URLs firmadas
 * (bucket privado).
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
  // Escala y desplazamiento viven JUNTOS: el zoom al cursor necesita los dos a
  // la vez, y separarlos obligaba a anidar actualizaciones de estado (que
  // React puede repetir y aplicaría el desplazamiento dos veces).
  const [vista, setVista] = useState({ scale: 1, x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const scale = vista.scale;
  const offset = { x: vista.x, y: vista.y };

  const areaRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Punto donde inició el arrastre + desplazamiento acumulado (para saber si
  // fue clic o arrastre al soltar).
  const arrastre = useRef({ x: 0, y: 0, offX: 0, offY: 0, movido: 0 });

  const close = useCallback(() => setOpen(false), []);
  const [descargando, setDescargando] = useState(false);

  /**
   * Descarga la imagen con nombre legible. La URL es firmada (bucket
   * privado) y cruza de dominio, así que `<a download>` directo la abriría en
   * vez de bajarla: se trae como blob y se dispara la descarga local. Si la
   * red falla, plan B: abrirla en otra pestaña.
   */
  const descargar = useCallback(async () => {
    setDescargando(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const ext = blob.type.includes("png")
        ? "png"
        : blob.type.includes("webp")
          ? "webp"
          : "jpg";
      const base =
        alt
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9 _-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .toLowerCase() || "imagen";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank", "noopener");
    } finally {
      setDescargando(false);
    }
  }, [src, alt]);

  const reset = useCallback(() => setVista({ scale: 1, x: 0, y: 0 }), []);

  /**
   * Impide arrastrar la foto fuera de la vista: el desplazamiento se limita a
   * lo que sobra de la imagen ampliada respecto al área visible.
   */
  const limitar = useCallback(
    (x: number, y: number, s: number) => {
      const area = areaRef.current;
      const img = imgRef.current;
      if (!area || !img) return { x, y };
      const maxX = Math.max(0, (img.offsetWidth * s - area.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * s - area.clientHeight) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [],
  );

  /**
   * Zoom manteniendo fijo el punto señalado (cursor o centro): al acercar, lo
   * que estabas viendo NO se escapa de la pantalla.
   */
  const zoomEn = useCallback(
    (nuevaEscala: number, clientX?: number, clientY?: number) => {
      setVista((v) => {
        const s2 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nuevaEscala));
        if (s2 <= MIN_ZOOM) return { scale: MIN_ZOOM, x: 0, y: 0 };
        const area = areaRef.current;
        if (!area || clientX == null || clientY == null) {
          const p = limitar(v.x, v.y, s2);
          return { scale: s2, ...p };
        }
        const r = area.getBoundingClientRect();
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height / 2);
        const k = s2 / v.scale;
        const p = limitar(dx - (dx - v.x) * k, dy - (dy - v.y) * k, s2);
        return { scale: s2, ...p };
      });
    },
    [limitar],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "+" || e.key === "=") zoomEn(scale + 0.25);
      if (e.key === "-") zoomEn(scale - 0.25);
      if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, zoomEn, reset, scale]);

  // El arrastre se sigue a nivel ventana: si el cursor sale del área (o del
  // navegador) la foto no se queda pegada al mouse.
  useEffect(() => {
    if (!arrastrando) return;
    const onMove = (e: MouseEvent) => {
      const d = arrastre.current;
      const nx = d.offX + (e.clientX - d.x);
      const ny = d.offY + (e.clientY - d.y);
      d.movido = Math.max(
        d.movido,
        Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y),
      );
      setVista((v) => ({ ...v, ...limitar(nx, ny, v.scale) }));
    };
    const onUp = () => setArrastrando(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [arrastrando, limitar, scale]);

  const puedeArrastrar = scale > MIN_ZOOM;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
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
          role="dialog"
          aria-modal="true"
        >
          {/* Barra de controles */}
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-medium truncate">{alt}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => zoomEn(scale - 0.5)}
                className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40"
                disabled={scale <= MIN_ZOOM}
                title="Alejar (−)"
              >
                <MagnifyingGlassMinusIcon className="h-5 w-5" />
              </button>
              <span className="w-14 text-center text-xs tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomEn(scale + 0.5)}
                className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40"
                disabled={scale >= MAX_ZOOM}
                title="Acercar (+)"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-md p-2 hover:bg-white/15"
                title="Ajustar a la pantalla (0)"
              >
                <ArrowsPointingOutIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void descargar()}
                disabled={descargando}
                className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40"
                title="Descargar imagen"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
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

          {/* Área de la imagen: con zoom se arrastra con el mouse o el dedo. */}
          <div
            ref={areaRef}
            className="relative flex-1 overflow-hidden select-none"
            style={{
              cursor: puedeArrastrar
                ? arrastrando
                  ? "grabbing"
                  : "grab"
                : "zoom-in",
              touchAction: puedeArrastrar ? "none" : "auto",
            }}
            onClick={(e) => {
              // Cierra solo al hacer clic en el FONDO: sobre la foto no (con
              // zoom uno hace clic para fijar la vista, no para salir), y
              // tampoco cuando el clic fue en realidad el fin de un arrastre.
              if (arrastre.current.movido > UMBRAL_ARRASTRE_PX) return;
              const r = imgRef.current?.getBoundingClientRect();
              if (
                r &&
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                return;
              }
              close();
            }}
            onWheel={(e) => {
              const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
              zoomEn(scale * factor, e.clientX, e.clientY);
            }}
            onDoubleClick={(e) => {
              if (scale > MIN_ZOOM) reset();
              else zoomEn(2.5, e.clientX, e.clientY);
            }}
            onMouseDown={(e) => {
              if (!puedeArrastrar || e.button !== 0) return;
              e.preventDefault();
              arrastre.current = {
                x: e.clientX,
                y: e.clientY,
                offX: offset.x,
                offY: offset.y,
                movido: 0,
              };
              setArrastrando(true);
            }}
            onTouchStart={(e) => {
              if (!puedeArrastrar || e.touches.length !== 1) return;
              const t = e.touches[0];
              arrastre.current = {
                x: t.clientX,
                y: t.clientY,
                offX: offset.x,
                offY: offset.y,
                movido: 0,
              };
            }}
            onTouchMove={(e) => {
              if (!puedeArrastrar || e.touches.length !== 1) return;
              const t = e.touches[0];
              const d = arrastre.current;
              setVista((v) => ({
                ...v,
                ...limitar(d.offX + (t.clientX - d.x), d.offY + (t.clientY - d.y), v.scale),
              }));
            }}
          >
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={src}
                alt={alt}
                draggable={false}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transition: arrastrando ? "none" : "transform 120ms ease-out",
                }}
                className="max-h-full max-w-full origin-center object-contain"
              />
            </div>
            {puedeArrastrar && (
              <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/80">
                Arrastra para moverte · doble clic para ajustar
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
