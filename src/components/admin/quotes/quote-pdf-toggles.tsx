"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QuotePlegable } from "./quote-plegable";

/**
 * QUÉ SE IMPRIME EN EL PDF DEL CLIENTE, en un `<details>` DEBAJO del papel
 * (Fase 2.3, 22-sep-2026; antes vivía en el panel lateral «Interno · no se
 * imprime»).
 *
 * Fuera del documento a propósito: estos switches no cambian NI UN PESO —
 * cambian lo que el cliente ve en SU hoja (la tarifa por hora junto a
 * «Servicio aéreo» y la tabla de tramos). Ponerlos dentro del papel interno,
 * que no los obedece, haría creer que afectan a este documento.
 *
 * El guardado NO cambia: siguen siendo `pdf_mostrar_tarifa` /
 * `pdf_mostrar_itinerario` del formulario, y cuando son lo ÚNICO que cambió,
 * Guardar hace `PATCH /v1/quotes/:id/pdf-visibilidad` SIN versión nueva
 * (`soloPresentacion`, D5). El contenido no se desmonta al plegarse.
 */
export function QuotePdfToggles({
  lectura,
  mostrarTarifa,
  mostrarItinerario,
  onMostrarTarifa,
  onMostrarItinerario,
  isRevise,
  avisoTramosCambiaron = false,
  notaTramos,
}: {
  lectura: boolean;
  mostrarTarifa: boolean;
  mostrarItinerario: boolean;
  onMostrarTarifa: (v: boolean) => void;
  onMostrarItinerario: (v: boolean) => void;
  isRevise: boolean;
  /** Se cambiaron los tramos: los toggles por tramo esperan al guardado. */
  avisoTramosCambiaron?: boolean;
  /** Leyenda de los toggles ojito/fecha por tramo (la arma el workspace). */
  notaTramos?: ReactNode;
}) {
  const resumen = [
    mostrarTarifa ? "con tarifa por hora" : "sin tarifa por hora",
    mostrarItinerario ? "con itinerario" : "sin itinerario",
  ].join(" · ");

  return (
    <QuotePlegable
      id="pdf"
      titulo="PDF del cliente: qué se imprime"
      resumen={resumen}
      aviso={avisoTramosCambiaron ? "tramos sin guardar" : null}
    >
      {lectura ? (
        <div className="space-y-0.5 text-sm">
          <p>
            Mostrar tarifa por hora:{" "}
            <span className="font-medium">{mostrarTarifa ? "Sí" : "No"}</span>
          </p>
          <p>
            Mostrar itinerario de tramos:{" "}
            <span className="font-medium">{mostrarItinerario ? "Sí" : "No"}</span>
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Mostrar tarifa por hora</Label>
              <p className="text-xs text-muted-foreground">
                «Servicio aéreo (1.6 h × $1,650/hr)». Apagado, solo el monto. El documento interno
                imprime siempre «Servicio aéreo» a secas.
              </p>
            </div>
            <Switch checked={mostrarTarifa} onCheckedChange={onMostrarTarifa} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Mostrar itinerario de tramos</Label>
              <p className="text-xs text-muted-foreground">
                La tabla de tramos de la hoja 1 del cliente; apagado queda solo el mapa.
              </p>
            </div>
            <Switch checked={mostrarItinerario} onCheckedChange={onMostrarItinerario} />
          </div>
          {isRevise && (
            <p className="text-[11px] text-muted-foreground">
              Estos toggles y las notas del cliente se guardan sin versión nueva cuando son lo único
              que cambia.
            </p>
          )}
          {avisoTramosCambiaron && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Cambiaste los tramos: la fecha y el ojito del PDF por tramo se habilitan al guardar la
              versión.
            </p>
          )}
          {!isRevise && (
            <p className="text-[10px] text-muted-foreground">
              La fecha y el ojito de cada tramo (en el detalle «⋯» de su fila) son SOLO para el PDF
              del cliente: un tramo oculto no sale en la hoja pero se sigue cobrando.
            </p>
          )}
        </>
      )}
      {notaTramos}
    </QuotePlegable>
  );
}
