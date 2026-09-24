import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { fmtMonto } from "@/lib/format";
import {
  UMBRAL_SALTO_GRANDE,
  hrefFacturas,
  textoHuecos,
  type AlertaFiltro,
  type FiltrosFacturas,
} from "@/lib/admin/facturas-emitidas";
import type {
  EstatusFacturaEmitida,
  ListaFacturasEmitidas,
} from "@/types/facturas-emitidas";

interface ChipResumen {
  label: string;
  valor: number;
  /** Cambio de filtro al hacer clic (null = no filtra, p. ej. «Registradas»). */
  estatus?: EstatusFacturaEmitida;
  alerta?: AlertaFiltro;
  /** Chips de ALERTA: ámbar cuando hay algo. */
  alertaTono?: boolean;
}

/**
 * Resumen DISCRETO del registro (24-sep-2026): una línea de chips que ponen
 * el filtro en la URL (los de valor 0 van en gris y no se pulsan), los
 * totales vigentes por moneda (jamás sumando USD con MXN) y los HUECOS de la
 * numeración por razón social + serie. El resumen es GLOBAL (todo el
 * registro); lo del filtro se dice aparte.
 */
export function RegistroFacturasResumen({
  lista,
  filtros,
}: {
  lista: Pick<ListaFacturasEmitidas, "resumen" | "filtrado">;
  filtros: FiltrosFacturas;
}) {
  const r = lista.resumen;
  const chips: ChipResumen[] = [
    { label: "Registradas", valor: r.registradas },
    { label: "Vigentes", valor: r.vigentes, estatus: "VIGENTE" },
    { label: "Canceladas", valor: r.canceladas, estatus: "CANCELADA" },
    { label: "Sin PDF", valor: r.sin_pdf, alerta: "sin_pdf", alertaTono: true },
    { label: "Sin vuelo", valor: r.sin_vuelo, alerta: "sin_vuelo", alertaTono: true },
    {
      label: "Vuelos con 2 facturas",
      valor: r.vuelos_con_varias,
      alerta: "duplicado_vuelo",
      alertaTono: true,
    },
    {
      label: "En vuelo cancelado",
      valor: r.en_vuelo_cancelado,
      alerta: "vuelo_cancelado",
      alertaTono: true,
    },
  ];

  const hayFiltroDeResumen = !!filtros.estatus || !!filtros.alerta;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {chips.map((c) => {
          const activo =
            (c.estatus && filtros.estatus === c.estatus) ||
            (c.alerta && filtros.alerta === c.alerta) ||
            (!c.estatus && !c.alerta && !hayFiltroDeResumen);
          const clase = cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 tabular-nums",
            c.valor === 0
              ? "border-border text-muted-foreground/70"
              : c.alertaTono
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border bg-muted/30 text-foreground",
            activo && c.valor > 0 && "ring-2 ring-brand-500/40",
          );
          const contenido = (
            <>
              {c.label} <span className="font-semibold">{c.valor}</span>
            </>
          );
          if (c.valor === 0) {
            return (
              <span key={c.label} className={clase}>
                {contenido}
              </span>
            );
          }
          const href = hrefFacturas(filtros, {
            estatus: c.estatus,
            alerta: c.alerta,
          });
          return (
            <Link
              key={c.label}
              href={href}
              className={cn(clase, "cursor-pointer hover:bg-muted/60")}
              title={
                c.estatus || c.alerta
                  ? `Ver solo: ${c.label.toLowerCase()}`
                  : "Quitar los filtros de estatus y alerta"
              }
            >
              {contenido}
            </Link>
          );
        })}
        {r.totales_vigentes.length > 0 && (
          <span className="ml-1 text-muted-foreground">
            Vigentes:{" "}
            {r.totales_vigentes.map((t) => fmtMonto(t.total, t.moneda)).join(" · ")}
          </span>
        )}
      </div>

      {r.huecos.length > 0 && (
        <ul className="space-y-1">
          {r.huecos.map((h) => (
            <li
              key={`${h.emisora?.id ?? "-"}|${h.serie ?? "-"}`}
              className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {h.total_faltantes > UMBRAL_SALTO_GRANDE ? (
                // Un folio con un dígito de más no llena la pantalla de
                // «faltantes»: se avisa que probablemente se capturó mal.
                <span>{textoHuecos(h)}</span>
              ) : (
                <span>
                  <span className="font-medium">
                    Faltan en la numeración
                    {h.serie || h.emisora ? ` (serie ${h.etiqueta_serie})` : ""}:
                  </span>{" "}
                  {textoHuecos(h).replace(/^Faltan /, "")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
