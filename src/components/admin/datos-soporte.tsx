"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ETIQUETA_CODIGO,
  ETIQUETA_HORA,
  ETIQUETA_RUTA,
  horaCancun,
  rutaActual,
} from "@/lib/admin/pantalla-error";

/** La ruta no cambia mientras esta pantalla está viva: no hay a qué suscribirse. */
const SIN_SUSCRIPCION = () => () => {};

/**
 * Los tres datos que sistemas necesita para buscar un fallo en los logs:
 * CÓDIGO (el `digest` de Next, o el detalle técnico cuando no hay boundary),
 * HORA de Cancún y PANTALLA (la ruta con sus filtros — muchas veces el
 * parámetro inválido ES la causa).
 *
 * Vive aparte porque lo usan DOS pantallas distintas y el operador no debería
 * ver una con los datos y la otra sin ellos: el error boundary
 * (`PantallaError`) y la pantalla del layout cuando `/v1/me` no responde
 * (`UnknownErrorScreen`) — que es, con el API caído del todo, la ÚNICA que
 * llega a verse (medido con el arnés el 21-sep-2026: ninguna pantalla de
 * `/admin` alcanza su propio boundary porque el layout falla antes).
 */
export function DatosSoporte({
  codigo,
  etiquetaCodigo = ETIQUETA_CODIGO,
}: {
  codigo: string;
  /** «Código» por defecto; «Detalle» cuando lo que hay es el error del API. */
  etiquetaCodigo?: string;
}) {
  // La hora se congela al montar: es el momento del fallo, no el de cada
  // re-render.
  const [hora] = useState(horaCancun);

  // La RUTA solo existe en el navegador. Cuando esta pantalla se pinta en el
  // SERVIDOR (la del layout, con el API caído), el HTML sale con «—» y React
  // NO lo corrige al hidratar si el nodo va con `suppressHydrationWarning`:
  // se quedaría el texto del servidor y el operador mandaría a sistemas un
  // «Pantalla —» inservible. `useSyncExternalStore` es justo el mecanismo
  // para un dato que solo existe en el cliente: pinta el snapshot del
  // servidor y React vuelve a renderizar con el del navegador al hidratar.
  const ruta = useSyncExternalStore(
    SIN_SUSCRIPCION,
    () => rutaActual(window.location),
    () => "—",
  );

  const fila = (etiqueta: string, valor: string, extra = "") => (
    <div className="flex gap-2">
      <dt className="text-muted-foreground shrink-0 w-24">{etiqueta}</dt>
      <dd className={`font-mono break-all ${extra}`} suppressHydrationWarning>
        {valor}
      </dd>
    </div>
  );

  return (
    <dl className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1.5 text-left">
      {fila(etiquetaCodigo, codigo, "select-all")}
      {fila(ETIQUETA_HORA, hora)}
      {fila(ETIQUETA_RUTA, ruta)}
    </dl>
  );
}
