"use client";

import { useMemo } from "react";
import { ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { AutoMatchButton } from "@/components/admin/conciliacion/auto-match-button";
import { AbonoAcciones } from "@/components/admin/ingresos/abono-acciones";
import { SugerenciasAbonosBoton } from "@/components/admin/ingresos/sugerencias-abonos-dialog";
import type { CatalogosIngreso } from "@/components/admin/ingresos/registrar-ingreso-dialog";
import {
  CLASE_TONO,
  TEXTO_DUPLICADO,
  etiquetaMotivoAbono,
  tituloDuplicado,
} from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { AbonoPendiente, AbonosPendientesRespuesta } from "@/types/ingresos";

/**
 * «Por conciliar» (24-sep-2026): los ABONOS del banco que el sistema no ha
 * identificado. El motivo, el cliente sugerido, el posible duplicado y la
 * categoría sugerida los calcula el API (`GET conciliacion/abonos-pendientes`):
 * aquí solo se pintan. Sin motivos calculados el badge dice «Pendiente» a
 * secas (nunca un «Sin candidato» inventado).
 */
export function AbonosPendientesTable({
  respuesta,
  catalogos,
  cuentasIa,
  cuentaId,
  desde,
  hasta,
}: {
  respuesta: AbonosPendientesRespuesta;
  catalogos: CatalogosIngreso;
  /** Cuentas para los selectores de «Cruzar pendientes» y la IA. */
  cuentasIa: { id: string; label: string }[];
  cuentaId?: string;
  desde: string;
  hasta: string;
}) {
  const calculados = respuesta.motivos_calculados;
  const traspasos = respuesta.data.filter((a) => a.patron === "TRASPASO").length;

  const columns = useMemo<Array<DataTableColumn<AbonoPendiente>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (a) => fmtDateOnly(a.fecha),
      },
      {
        key: "cuenta",
        header: "Cuenta",
        cellClassName: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (a) => a.cuenta_alias ?? "—",
      },
      {
        key: "descripcion",
        header: "Descripción del banco",
        cellClassName: "max-w-[320px]",
        cell: (a) => (
          <span className="block">
            <span className="block truncate text-sm" title={a.descripcion ?? undefined}>
              {a.descripcion ?? "—"}
            </span>
            <span className="mt-0.5 flex flex-wrap gap-1">
              {a.cliente_sugerido && (
                <Badge
                  variant="outline"
                  className="border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-300"
                  title="Cliente cuyo nombre aparece en la descripción del banco (sugerencia; no liga nada)."
                >
                  Cliente: {a.cliente_sugerido.nombre}
                </Badge>
              )}
              {a.posible_duplicado_de && (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                  title={tituloDuplicado(a.posible_duplicado_de)}
                >
                  {TEXTO_DUPLICADO}
                </Badge>
              )}
            </span>
          </span>
        ),
      },
      {
        key: "referencia",
        header: "Referencia",
        cellClassName: "text-xs text-muted-foreground max-w-[140px] truncate",
        cell: (a) => a.referencia ?? "—",
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        cell: (a) => (
          <span className="block font-mono">
            {fmtMonto(a.monto, a.cuenta_moneda ?? undefined)}
            {a.monto_bruto != null && a.monto_bruto > 0 && (
              <span className="block text-[10px] font-sans text-muted-foreground">
                bruto {fmtMonto(a.monto_bruto)}
                {a.comision_monto != null && a.comision_monto > 0 ? ` · comisión ${fmtMonto(a.comision_monto)}` : ""}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "motivo",
        header: "Motivo",
        cell: (a) => {
          const m = etiquetaMotivoAbono(a, calculados);
          return (
            <Badge
              variant="outline"
              className={cn("max-w-[220px] whitespace-normal text-left leading-tight", CLASE_TONO[m.tono])}
              title={m.titulo}
            >
              {m.texto}
            </Badge>
          );
        },
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        cell: (a) => <AbonoAcciones abono={a} catalogos={catalogos} cuentasIa={cuentasIa} />,
      },
    ],
    [calculados, catalogos, cuentasIa],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Abonos del banco que el sistema no ha identificado. Elige qué es cada uno: el cobro de un
          vuelo, un anticipo, otro ingreso, un traspaso entre cuentas o el reverso de un cargo.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <AutoMatchButton cuentas={cuentasIa} cuentaId={cuentaId} desde={desde} hasta={hasta} tipo="ABONO" />
          <SugerenciasAbonosBoton
            cuentas={cuentasIa}
            abonos={respuesta.data}
            catalogos={catalogos}
            cuentaId={cuentaId}
            desde={desde}
            hasta={hasta}
          />
        </div>
      </div>

      {traspasos > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {traspasos === 1
              ? "1 parece traspaso entre cuentas: pulsa «Cruzar pendientes» y se clasifica solo."
              : `${traspasos} parecen traspasos entre cuentas: pulsa «Cruzar pendientes» y se clasifican solos.`}
          </span>
        </div>
      )}
      {!calculados && respuesta.data.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No se pudo calcular por qué sigue pendiente cada abono (la lectura de candidatos falló o se
          recortó): se marcan «Pendiente» a secas. Vuelve a cargar o acota el periodo.
        </p>
      )}
      {respuesta.truncado && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <span>
            Mostrando {respuesta.data.length} de {respuesta.total} abonos pendientes: acota el periodo
            o elige una cuenta para ver el resto.
          </span>
        </div>
      )}
      {respuesta.por_moneda.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sin identificar en el periodo:{" "}
          {respuesta.por_moneda
            .map((m) => `${m.n} ${m.n === 1 ? "abono" : "abonos"} · ${fmtMonto(m.monto, m.moneda)}`)
            .join(" · ")}
          .
        </p>
      )}

      {respuesta.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No hay abonos sin identificar en el periodo. Sube el estado de cuenta para traer los
          movimientos del banco.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <DataTable
            syncId="ab"
            columns={columns}
            rows={respuesta.data}
            rowKey={(a) => a.id}
            searchText={(a) =>
              `${a.descripcion ?? ""} ${a.referencia ?? ""} ${a.monto} ${a.cuenta_alias ?? ""} ${
                a.cliente_sugerido?.nombre ?? ""
              }`
            }
            searchPlaceholder="Buscar abono (descripción, referencia, monto, cliente)…"
            huboCorte={respuesta.truncado}
          />
        </div>
      )}
    </div>
  );
}
