"use client";

import { useEffect, useRef, type Ref } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import {
  direccionDeTecla,
  hrefCotizacion,
  subtituloFlechaApagada,
  textoCortoVecino,
  tituloFlecha,
  type DireccionFlecha,
} from "@/lib/admin/quote-navegacion";
import type { QuoteVecino, QuoteVecinos } from "@/types/quote-vecinos";

/**
 * Capas abiertas en las que ←/→ NO deben brincar de cotización (diálogos,
 * menús, listas desplegables: Base UI las pinta con estos roles).
 */
const CAPAS_ABIERTAS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
/** Contenedores cuyo `role` hace que las flechas del teclado sean suyas. */
const GRUPOS_CON_FLECHAS =
  '[role="radiogroup"], [role="tablist"], [role="grid"], [role="listbox"], [role="menu"]';

/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» del detalle de una cotización
 * (24-sep-2026, pedido de Itzi). Estilo de los botones de día de
 * `/admin/taco-live`. Orden CRONOLÓGICO por fecha de vuelo (lo decide el
 * API): como la lista pinta lo más reciente ARRIBA, «Siguiente» es la fila de
 * ARRIBA — por eso en pantallas medianas el destino se VE sin pasar el mouse
 * («#338 · 19 sep»), y el tooltip completo dice también el cliente.
 *
 * Reglas:
 *  - Las flechas son `<Link>` (un `<a href>`), NUNCA `router.push`: el guard
 *    de cambios sin guardar del cotizador (`useCambiosSinGuardar`) intercepta
 *    en captura todo clic en un `<a>` interno y pide confirmación.
 *  - `replace`: brincar entre cotizaciones NO apila historial, así «←
 *    Cotizaciones» (y el «atrás» del navegador) regresan a la LISTA con sus
 *    filtros, su búsqueda y su página, no a la cotización anterior.
 *  - Se precargan las dos vecinas al montar (`router.prefetch`).
 *  - Sin vecino ⇒ la flecha se pinta APAGADA con el porqué; cotización sin
 *    fecha ⇒ las dos apagadas con «ponle fecha para brincar entre vuelos».
 *  - ←/→ del teclado disparan el MISMO clic (pasa por el guard), solo cuando
 *    el foco no está en un campo ni hay un diálogo o menú abiertos
 *    (`direccionDeTecla`).
 */
export function QuoteNavegacion({
  vecinos,
  qs,
}: {
  vecinos: QuoteVecinos;
  /** Filtros de la lista (sin «?»), los mismos que conserva cada flecha. */
  qs: string;
}) {
  const router = useRouter();
  const refAnterior = useRef<HTMLAnchorElement>(null);
  const refSiguiente = useRef<HTMLAnchorElement>(null);
  const sinFecha = vecinos.sin_fecha === true;
  const conFiltros = qs.length > 0;
  const hrefAnterior =
    !sinFecha && vecinos.anterior ? hrefCotizacion(vecinos.anterior.id, qs) : null;
  const hrefSiguiente =
    !sinFecha && vecinos.siguiente ? hrefCotizacion(vecinos.siguiente.id, qs) : null;

  useEffect(() => {
    if (hrefAnterior) router.prefetch(hrefAnterior);
    if (hrefSiguiente) router.prefetch(hrefSiguiente);
  }, [router, hrefAnterior, hrefSiguiente]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activo = document.activeElement as HTMLElement | null;
      const foco = activo && activo !== document.body ? activo : null;
      const dir = direccionDeTecla(e, {
        etiqueta: foco?.tagName ?? null,
        editable: foco?.isContentEditable === true,
        rol:
          foco?.getAttribute("role") ??
          foco?.closest(GRUPOS_CON_FLECHAS)?.getAttribute("role") ??
          null,
        hayCapaAbierta: document.querySelector(CAPAS_ABIERTAS) != null,
      });
      if (!dir) return;
      const a = dir === "anterior" ? refAnterior.current : refSiguiente.current;
      if (!a) return;
      e.preventDefault();
      // El MISMO clic del mouse: si hay cambios sin guardar, el guard lo
      // intercepta y pregunta antes de salir.
      a.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav aria-label="Brincar entre cotizaciones" className="flex items-center gap-2">
      <Flecha
        dir="anterior"
        vecino={sinFecha ? null : vecinos.anterior}
        href={hrefAnterior}
        sinFecha={sinFecha}
        conFiltros={conFiltros}
        refLink={refAnterior}
      />
      <Flecha
        dir="siguiente"
        vecino={sinFecha ? null : vecinos.siguiente}
        href={hrefSiguiente}
        sinFecha={sinFecha}
        conFiltros={conFiltros}
        refLink={refSiguiente}
      />
    </nav>
  );
}

const CLASE_FLECHA =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm";

function Flecha({
  dir,
  vecino,
  href,
  sinFecha,
  conFiltros,
  refLink,
}: {
  dir: DireccionFlecha;
  vecino: QuoteVecino | null;
  href: string | null;
  sinFecha: boolean;
  conFiltros: boolean;
  refLink: Ref<HTMLAnchorElement>;
}) {
  const esAnterior = dir === "anterior";
  const titulo = tituloFlecha(dir, vecino, { sinFecha, conFiltros });
  const icono = esAnterior ? (
    <ChevronLeftIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
  ) : (
    <ChevronRightIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
  );
  const textos = (
    <span
      className={`flex flex-col leading-tight ${esAnterior ? "items-start" : "items-end"}`}
    >
      <span className="hidden sm:inline">{esAnterior ? "Anterior" : "Siguiente"}</span>
      <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
        {vecino && href ? textoCortoVecino(vecino) : subtituloFlechaApagada({ sinFecha })}
      </span>
    </span>
  );
  const contenido = esAnterior ? (
    <>
      {icono}
      {textos}
    </>
  ) : (
    <>
      {textos}
      {icono}
    </>
  );

  if (vecino && href) {
    return (
      <Link
        ref={refLink}
        href={href}
        replace
        title={titulo}
        aria-label={titulo}
        data-flecha={dir}
        className={`${CLASE_FLECHA} hover:bg-muted transition-colors cursor-pointer`}
      >
        {contenido}
      </Link>
    );
  }
  return (
    <span
      role="link"
      aria-disabled="true"
      title={titulo}
      aria-label={titulo}
      data-flecha={dir}
      className={`${CLASE_FLECHA} opacity-50 cursor-not-allowed`}
    >
      {contenido}
    </span>
  );
}
