"use client";

import Link from "next/link";
import {
  ArrowPathRoundedSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { tituloOpcionCapacidad } from "@/lib/admin/grupos-ui";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CapacidadArmado, OpcionDobleRotacion } from "@/types/grupos";

/**
 * Σ pasajeros vs total del grupo + opciones del server cuando faltan
 * asientos (doble vuelta con su costo, reactivar un avión, externo). El
 * conteo local (Σ pax capturados) se pinta al instante; los asientos y las
 * opciones vienen del armador.
 */
export function CapacidadCard({
  pasajerosTotal,
  paxCapturados,
  capacidad,
  stale,
  onDobleRotacion,
  disabled = false,
  lectura = false,
}: {
  pasajerosTotal: number;
  /** Σ pax de las filas capturadas (conteo, no dinero). */
  paxCapturados: number;
  /** Del último armado; null = aún no calcula. */
  capacidad: CapacidadArmado | null;
  /** El armado no corresponde a lo capturado ahora mismo. */
  stale: boolean;
  /** Un clic: rotaciones = 2 y pax = los suyos + los que faltan. */
  onDobleRotacion: (op: OpcionDobleRotacion) => void;
  disabled?: boolean;
  /** Página única en lectura: el consejo remite a «Revisar». */
  lectura?: boolean;
}) {
  const faltan = pasajerosTotal - paxCapturados;
  const asientos = capacidad?.asientos_total ?? null;

  const resumen = (
    <p className="text-sm">
      <span className="font-mono font-semibold">{paxCapturados}</span> de{" "}
      <span className="font-mono font-semibold">{pasajerosTotal || "—"}</span> pasajeros
      acomodados
      {asientos != null && (
        <span className="text-muted-foreground">
          {" "}
          · {asientos} {asientos === 1 ? "asiento" : "asientos"} en la flota elegida
        </span>
      )}
    </p>
  );

  if (!pasajerosTotal) {
    return (
      <div className="rounded-lg border border-border bg-navy-800/50 px-3 py-2">
        {resumen}
      </div>
    );
  }

  if (faltan === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400">
        <CheckCircleIcon className="h-5 w-5 shrink-0" />
        {resumen}
      </div>
    );
  }

  if (faltan < 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            Sobran {-faltan} {-faltan === 1 ? "pasajero" : "pasajeros"}
          </p>
          {resumen}
          <p className="text-xs">
            {lectura
              ? "Usa «Revisar» para cuadrar los pasajeros por avión con el total del grupo."
              : "Baja los pasajeros de algún avión o sube el total del grupo: para guardar deben coincidir."}
          </p>
        </div>
      </div>
    );
  }

  // Faltan > 0: opciones del server (solo cuando el armado está fresco y
  // coincide con lo capturado; si no, se muestra el conteo y se espera).
  const opciones = capacidad && !stale && capacidad.faltan === faltan ? capacidad.opciones : [];
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            Faltan {faltan} {faltan === 1 ? "pasajero" : "pasajeros"} por acomodar
          </p>
          {resumen}
        </div>
      </div>
      {opciones.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Opciones para acomodarlos:</p>
          {opciones.map((op, i) => {
            if (op.tipo === "DOBLE_ROTACION") {
              return (
                <div
                  key={`dr-${op.aeronave_id}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{tituloOpcionCapacidad(op)}</p>
                    <p className="text-xs text-muted-foreground">
                      Avión {op.posicion}: {op.pax} pax en dos vueltas (
                      {op.pax_por_rotacion.join(" + ")}) · {fmtDecimal(op.horas_hr)} hr ·
                      total del avión {fmtUsd(op.total_hijo_usd)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onDobleRotacion(op)}
                    className="gap-1.5"
                  >
                    <ArrowPathRoundedSquareIcon className="h-3.5 w-3.5" />
                    Doble vuelta
                  </Button>
                </div>
              );
            }
            if (op.tipo === "REACTIVAR") {
              return (
                <div
                  key={`re-${op.aeronave_id}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", !op.cubre && "text-muted-foreground")}>
                      {tituloOpcionCapacidad(op)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Está dado de baja: reactívalo en Aeronaves y vuelve aquí para
                      agregarlo al grupo.
                    </p>
                  </div>
                  <Link
                    href={`/admin/aircraft/${op.aeronave_id}`}
                    target="_blank"
                    className="text-xs font-medium underline underline-offset-2 text-brand-600 dark:text-brand-400"
                  >
                    Abrir en Aeronaves
                  </Link>
                </div>
              );
            }
            return (
              <div
                key={`ex-${i}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <p className="text-sm font-medium">{tituloOpcionCapacidad(op)}</p>
                <p className="text-xs text-muted-foreground">{op.detalle}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {lectura
            ? "Usa «Revisar» para acomodarlos: subir pasajeros de un avión con lugar, agregar otro avión o doble vuelta."
            : "Sube los pasajeros de un avión con lugar, agrega otro avión o usa doble vuelta en uno que regrese por más."}
        </p>
      )}
    </div>
  );
}
