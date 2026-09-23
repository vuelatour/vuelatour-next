"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import type { RutaSugerida } from "@/app/admin/quotes/actions";
import { QuotePlegable } from "./quote-plegable";
import type { RouteOption } from "./quote-form-types";

/** "CUN → HOL → CUN" de una ruta del catálogo (mismo texto del selector). */
export function rutaPathTexto(r: RouteOption): string {
  return r.tramos.length > 0
    ? [r.tramos[0]?.origen_iata, ...r.tramos.map((t) => t.destino_iata)].filter(Boolean).join(" → ")
    : `${r.origen_iata} → ${r.destino_iata}`;
}

/**
 * PLANTILLA DE RUTA del catálogo, en un `<details>` DEBAJO del papel (Fase
 * 2.3, 22-sep-2026; antes vivía en el panel lateral «Interno · no se
 * imprime»).
 *
 * Aquí y no dentro del documento porque NO es un dato de la cotización: es un
 * punto de PARTIDA para cargar tramos («suele pedir CUN → HOL → CUN») y un
 * sitio donde guardar el itinerario de hoy como ruta nueva. Los tramos que
 * PRECIAN se editan en la tabla del papel; esto solo los carga y la ruta
 * guardada del catálogo nunca se modifica sola.
 *
 * El contenido no se desmonta al plegarse (`QuotePlegable` es un `<details>`
 * nativo), así que el selector conserva su estado.
 */
export function QuotePlantillaRuta({
  lectura,
  rutas,
  sugeridas,
  rutaSeleccionada,
  rutaId,
  escalasClave,
  hayEscalas,
  itinerarioAjustado,
  onAplicarSugerencia,
  onSeleccionarRuta,
  onCrearRuta,
  onGuardarComoRuta,
  savingRoute,
}: {
  /** Cotización bloqueada: la plantilla se LEE, no se aplica. */
  lectura: boolean;
  rutas: RouteOption[];
  sugeridas: RutaSugerida[];
  rutaSeleccionada?: RouteOption;
  rutaId: string;
  /** Firma «CUN-HOL|HOL-CUN» del itinerario vivo (marca la sugerencia activa). */
  escalasClave: string;
  hayEscalas: boolean;
  /** El itinerario de esta cotización difiere de la ruta guardada. */
  itinerarioAjustado: boolean;
  onAplicarSugerencia: (s: RutaSugerida) => void;
  onSeleccionarRuta: (id: string) => void;
  onCrearRuta: () => void;
  onGuardarComoRuta: () => void;
  savingRoute: boolean;
}) {
  const resumen = rutaSeleccionada
    ? `${rutaPathTexto(rutaSeleccionada)}${itinerarioAjustado ? " · el itinerario difiere de la ruta guardada" : ""}`
    : "Itinerario propio (sin ruta del catálogo)";

  return (
    <QuotePlegable id="plantilla" titulo="Plantilla de ruta" resumen={resumen}>
      {lectura ? (
        <p className="text-xs text-muted-foreground">
          {rutaSeleccionada
            ? `Ruta guardada: ${rutaPathTexto(rutaSeleccionada)}.`
            : "Esta cotización no salió de una ruta del catálogo."}
          {rutaSeleccionada && itinerarioAjustado
            ? " El itinerario de esta cotización difiere de la ruta guardada."
            : ""}
        </p>
      ) : (
        <>
          {sugeridas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-foreground/70">
                Suele pedir:
              </span>
              {sugeridas.map((s) => {
                const activa = hayEscalas && s.clave === escalasClave;
                return (
                  <button
                    key={s.clave}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => onAplicarSugerencia(s)}
                    title={
                      s.ultima_fecha
                        ? `Última vez: ${new Date(s.ultima_fecha).toLocaleDateString("es-MX", { dateStyle: "medium" })}`
                        : undefined
                    }
                    className={cn(
                      "max-w-[16rem] truncate rounded-full border px-2.5 py-1 font-mono text-xs transition-colors",
                      activa
                        ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {s.etiqueta}
                    {s.veces > 1 && <span className="ml-1 opacity-70">×{s.veces}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <SearchableSelect
            options={rutas.map((r) => ({
              value: r.id,
              label: rutaPathTexto(r),
              description: `${r.millas_nauticas} NM · ${r.tramos.length} ${
                r.tramos.length === 1 ? "tramo" : "tramos"
              }`,
            }))}
            value={rutaId}
            onChange={onSeleccionarRuta}
            placeholder="Plantilla: ruta guardada del catálogo"
            emptyText="Sin rutas — créala aquí"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCrearRuta}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-600/80"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Crear ruta
            </button>
            {itinerarioAjustado && hayEscalas && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onGuardarComoRuta}
                disabled={savingRoute}
                className="h-7 text-xs"
                title="Este itinerario difiere de la ruta guardada: guárdalo en el catálogo (la original no se toca)."
              >
                {savingRoute ? "Guardando…" : "Guardar como nueva ruta"}
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Los tramos se editan en la tabla de la hoja: la plantilla solo los carga como punto de
            partida.
          </p>
        </>
      )}
    </QuotePlegable>
  );
}
