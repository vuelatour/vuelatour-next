"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ArrowDownTrayIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  crearFotoFirmada,
  esBucketFirmable,
  esPathFirmable,
  type ConfigFoto,
  type EstadoFoto,
  type FotoFirmada,
} from "@/lib/admin/foto-firmada";
import { pedirUrlFirmada } from "@/lib/storage/url-firmada";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Arrastres de menos de esto son un clic (no deben cerrar por accidente). */
const UMBRAL_ARRASTRE_PX = 4;

/** Tooltip de la miniatura cuando la foto no cargó (ni con una firma nueva). */
export const TITULO_FOTO_NO_CARGO = "No se pudo cargar la foto · clic para reintentar";
/** Mensaje del visor cuando la foto no cargó. */
export const TEXTO_FOTO_NO_CARGO = "No se pudo cargar la foto";
/** Mientras se pide otra firma. */
export const TEXTO_FOTO_CARGANDO = "Cargando la foto…";

const THUMB_DEFAULT =
  "h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500";

/**
 * Una foto (miniatura + visor) con su URL firmada: la renueva al fallar y
 * antes de abrir/descargar una URL vieja. La lógica vive PURA en
 * `crearFotoFirmada` (`lib/admin/foto-firmada.ts`, con pruebas); aquí solo se
 * conecta a React. Props nuevas (p. ej. `router.refresh()` al volver a la
 * pestaña firma otra vez) reinician la máquina sin cerrar el visor.
 */
function useFotoFirmada(config: ConfigFoto): [FotoFirmada, EstadoFoto] {
  const [foto] = useState(() =>
    crearFotoFirmada(config, { pedirUrl: pedirUrlFirmada }),
  );
  const { src, bucket, path, firmadaEn } = config;
  useEffect(() => {
    foto.configurar({ src, bucket, path, firmadaEn });
  }, [foto, src, bucket, path, firmadaEn]);
  const estado = useSyncExternalStore(foto.suscribir, foto.estado, foto.estado);
  return [foto, estado];
}

/** ¿La URL actual se puede pintar? (nunca una que ya falló). */
function urlPintable(estado: EstadoFoto): string | null {
  return estado.url && estado.fase === "lista" && !estado.rota ? estado.url : null;
}

/**
 * Miniatura: la foto (clic = abrir el visor) o, si no cargó, un placeholder
 * gris (clic = reintentar). Mientras se pide otra firma tras un fallo, el
 * placeholder late. Exportada para probar el marcado de cada estado.
 */
export function MiniaturaFoto({
  estado,
  alt,
  thumbClassName = THUMB_DEFAULT,
  onAbrir,
  onReintentar,
  onFallo,
  onCarga,
}: {
  estado: EstadoFoto;
  alt: string;
  thumbClassName?: string;
  onAbrir: () => void;
  onReintentar: () => void;
  onFallo: (url: string) => void;
  onCarga: (url: string) => void;
}) {
  // Durante una renovación PROACTIVA (al abrir el visor) la miniatura que ya
  // cargó se queda: solo se esconde una URL que falló.
  const url =
    estado.url && estado.fase !== "fallo" && !estado.rota ? estado.url : null;
  if (url) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        title="Ver imagen"
        className="inline-flex shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <Image
          key={estado.intento}
          src={url}
          alt={alt}
          width={40}
          height={40}
          unoptimized
          className={thumbClassName}
          onError={() => onFallo(url)}
          onLoad={() => onCarga(url)}
        />
      </button>
    );
  }
  const cargando = estado.fase === "renovando";
  const titulo = cargando ? TEXTO_FOTO_CARGANDO : TITULO_FOTO_NO_CARGO;
  return (
    <button
      type="button"
      onClick={onReintentar}
      disabled={cargando}
      title={titulo}
      aria-label={`${alt}: ${titulo}`}
      data-foto-placeholder={cargando ? "cargando" : "fallo"}
      className={cn(
        thumbClassName,
        "inline-flex shrink-0 cursor-pointer items-center justify-center bg-muted text-muted-foreground/60 min-h-8 min-w-8 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait",
      )}
    >
      <PhotoIcon className={cn("h-4 w-4", cargando && "animate-pulse")} aria-hidden />
    </button>
  );
}

/**
 * Contenido del visor cuando NO hay foto que pintar: «Cargando la foto…»
 * mientras se pide otra firma, o «No se pudo cargar la foto» + «Reintentar».
 */
export function VisorSinFoto({
  estado,
  onReintentar,
}: {
  estado: EstadoFoto;
  onReintentar: () => void;
}) {
  if (estado.fase !== "fallo") {
    return <p className="text-sm text-white/80">{TEXTO_FOTO_CARGANDO}</p>;
  }
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-3 text-center text-white">
      <PhotoIcon className="h-10 w-10 text-white/50" aria-hidden />
      <p className="text-sm font-medium">{TEXTO_FOTO_NO_CARGO}</p>
      <button
        type="button"
        onClick={(e) => {
          // El clic en el fondo cierra el visor: este no.
          e.stopPropagation();
          onReintentar();
        }}
        className="cursor-pointer rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25"
      >
        Reintentar
      </button>
    </div>
  );
}

/**
 * Miniatura que, al hacer clic, abre la imagen en un MODAL con zoom y
 * ARRASTRE: con zoom se recorre la foto con el mouse (o el dedo). Antes el
 * zoom era solo `scale()` y la parte ampliada quedaba fuera de la pantalla sin
 * forma de alcanzarla — leer un ticket o un tacómetro de cerca era imposible.
 *
 * Reutilizable para comprobantes, tacómetros, vouchers, etc. Usa URLs firmadas
 * (bucket privado) que VENCEN (1-oct-2026, «las fotos de las facturas no
 * están cargando»): con `bucket` + `path` la foto pide otra firma al fallar
 * (reintenta UNA vez) y antes de abrir el visor o descargar con una URL vieja;
 * si aun así no carga, placeholder con «Reintentar» — nunca un `<img>` roto.
 * Sin `bucket`/`path` no hay a quién pedir otra firma: al fallar, placeholder
 * sin llamadas. TODOS los callers pasan bucket + path (los que solo tienen la
 * URL lo derivan con `pathDeUrlFirmada`).
 */
export function ImagePreview({
  src,
  alt,
  thumbClassName = THUMB_DEFAULT,
  bucket,
  path,
  firmadaEn,
}: {
  src: string;
  alt: string;
  thumbClassName?: string;
  /** Bucket privado del objeto (lista blanca de `POST /v1/storage/firmar`). */
  bucket?: string | null;
  /** Path del objeto dentro del bucket. */
  path?: string | null;
  /** Hora (epoch ms) en que se firmó `src`; sin ella, el montaje. */
  firmadaEn?: number | null;
}) {
  const [foto, estado] = useFotoFirmada({
    src,
    bucket: esBucketFirmable(bucket) ? bucket : null,
    // Un path que el API rechazaría = sin path: placeholder sin llamadas.
    path: esPathFirmable(path) ? path : null,
    firmadaEn: firmadaEn ?? null,
  });
  const visorUrl = urlPintable(estado);
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
   * red falla (o CORS), plan B: abrirla en otra pestaña. Si Storage RESPONDE
   * con error (firma vencida que no se pudo renovar), NO se abre: la pestaña
   * mostraría el JSON `InvalidJWT` — se avisa y ya.
   */
  const descargar = useCallback(async () => {
    setDescargando(true);
    let url: string | null = null;
    let respondioError = false;
    try {
      // URL VIGENTE: si la de la página ya es vieja, se renueva antes.
      url = await foto.vigente();
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) {
        respondioError = true;
        throw new Error(String(res.status));
      }
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
      const local = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = local;
      a.download = `${base}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(local);
    } catch {
      if (url && !respondioError) window.open(url, "_blank", "noopener");
      else toast.error("No se pudo descargar la foto. Inténtalo de nuevo.");
    } finally {
      setDescargando(false);
    }
  }, [foto, alt]);

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
      <MiniaturaFoto
        estado={estado}
        alt={alt}
        thumbClassName={thumbClassName}
        onAbrir={() => {
          reset();
          setOpen(true);
          // Una URL vieja se renueva ANTES de pintarla en grande.
          void foto.vigente();
        }}
        onReintentar={() => void foto.reintentar()}
        onFallo={(u) => void foto.alFallar(u)}
        onCarga={(u) => foto.alCargar(u)}
      />

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
                className="cursor-pointer rounded-md p-2 hover:bg-white/15 disabled:cursor-default disabled:opacity-40"
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
                className="cursor-pointer rounded-md p-2 hover:bg-white/15 disabled:cursor-default disabled:opacity-40"
                disabled={scale >= MAX_ZOOM}
                title="Acercar (+)"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer rounded-md p-2 hover:bg-white/15"
                title="Ajustar a la pantalla (0)"
              >
                <ArrowsPointingOutIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void descargar()}
                disabled={descargando || !visorUrl}
                className="cursor-pointer rounded-md p-2 hover:bg-white/15 disabled:cursor-default disabled:opacity-40"
                title="Descargar imagen"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={close}
                className="ml-1 cursor-pointer rounded-md p-2 hover:bg-white/15"
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
              {visorUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={estado.intento}
                  ref={imgRef}
                  src={visorUrl}
                  alt={alt}
                  draggable={false}
                  onError={() => void foto.alFallar(visorUrl)}
                  onLoad={() => foto.alCargar(visorUrl)}
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transition: arrastrando ? "none" : "transform 120ms ease-out",
                  }}
                  className="max-h-full max-w-full origin-center object-contain"
                />
              ) : (
                <VisorSinFoto
                  estado={estado}
                  onReintentar={() => void foto.reintentar()}
                />
              )}
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
