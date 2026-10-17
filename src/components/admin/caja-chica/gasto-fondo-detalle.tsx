"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { FacturacionBadge } from "@/components/admin/expenses/facturacion-badge";
import { EnlacesBalanceGasto } from "@/components/admin/conciliacion/enlaces-balance-gasto";
import { fmtMonto } from "@/lib/format";
import {
  ETIQUETA_AVION_VUELATOUR,
  ETIQUETA_FALTA_AVION,
  ETIQUETA_REPARTIDO,
  MATRICULA_DESCONOCIDA,
  TEXTO_VER_AVION,
  TITULO_FALTA_AVION_FUERA_DE_GASTOS,
  TITULO_REFERENCIA_AVION,
  textoReferenciaAvion,
  tituloRemanenteReparto,
  type EstadoAvionGasto,
} from "@/lib/admin/gasto-avion";
import type { DetalleGastoFondo } from "@/lib/admin/caja-chica-gasto";
import type { Gasto } from "@/types/expenses";

const CLASE_AVION_LINK =
  "cursor-pointer font-mono text-brand-600 hover:underline dark:text-brand-400";

/**
 * «Avión · vuelo» EN LÍNEA: los MISMOS textos y titles de la columna de
 * Gastos (`expenses-table.tsx`, constantes de `lib/admin/gasto-avion.ts`),
 * compactos para caber en «Concepto». Salvo el title de «Falta avión»:
 * aquí va `TITULO_FALTA_AVION_FUERA_DE_GASTOS` (en el fondo no hay pestaña
 * «Pendientes» ni «Sugerir asignaciones», solo el menú ⋯ del renglón). El
 * vuelo NO se repite: el folio del renglón ya liga a su detalle.
 */
function AvionEnLinea({ e, moneda }: { e: EstadoAvionGasto; moneda: string }) {
  if (e.tipo === "REPARTIDO") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <span>{ETIQUETA_REPARTIDO}</span>
        {e.partes.map((p) => (
          <Link
            key={p.aeronaveId}
            href={`/admin/aircraft/${p.aeronaveId}`}
            className={CLASE_AVION_LINK}
            title={fmtMonto(p.monto, moneda)}
          >
            {p.matricula ?? MATRICULA_DESCONOCIDA}
          </Link>
        ))}
        {e.remanente > 0.004 && (
          <span title={tituloRemanenteReparto(e.remanente, moneda)}>{ETIQUETA_AVION_VUELATOUR}</span>
        )}
      </span>
    );
  }
  if (e.tipo === "FUERA_DEL_AVION") {
    return (
      <span>
        <span title={e.titulo}>
          {e.etiqueta}
          {/* «pago de AFAC» (16-oct-2026, invariante 90): lo paga VuelaTour. */}
          {e.detalle ? ` · ${e.detalle}` : null}
          <span className="sr-only"> · {e.titulo}</span>
        </span>
        {e.referencia && (
          <span title={TITULO_REFERENCIA_AVION}> ({textoReferenciaAvion(e.referencia)})</span>
        )}
      </span>
    );
  }
  if (e.tipo === "AVION") {
    return (
      <Link href={`/admin/aircraft/${e.aeronaveId}`} className={CLASE_AVION_LINK}>
        {e.matricula ?? TEXTO_VER_AVION}
      </Link>
    );
  }
  return (
    <span className="text-amber-600 dark:text-amber-400" title={TITULO_FALTA_AVION_FUERA_DE_GASTOS}>
      {ETIQUETA_FALTA_AVION}
      <span className="sr-only"> · {TITULO_FALTA_AVION_FUERA_DE_GASTOS}</span>
    </span>
  );
}

/**
 * Bajo el renglón de un gasto en efectivo del historial del fondo
 * (15-oct-2026): categoría · avión · proveedor/lugar · comprobante ·
 * facturación (el semáforo de un clic de Gastos, compacto), la hoja del
 * Excel del balance donde vive y los enlaces «Ver en balance…» (pestaña
 * nueva, en la celda del gasto; solo para quien abre balances). Todo envuelve
 * dentro de la celda «Concepto»: la tabla no se ensancha.
 *
 * La categoría no se repite si la descripción del renglón ya es ella (gasto
 * sin notas: el API manda la etiqueta de la categoría como descripción).
 */
export function GastoFondoDetalle({
  detalle,
  gasto,
  descripcion,
}: {
  detalle: DetalleGastoFondo;
  gasto: Gasto | null;
  descripcion: string | null;
}) {
  const piezas: { key: string; nodo: ReactNode }[] = [];
  if (detalle.categoria && detalle.categoria !== descripcion?.trim()) {
    piezas.push({ key: "categoria", nodo: <span>{detalle.categoria}</span> });
  }
  if (detalle.avion) {
    piezas.push({ key: "avion", nodo: <AvionEnLinea e={detalle.avion} moneda={detalle.moneda} /> });
  }
  if (detalle.proveedorOLugar) {
    piezas.push({ key: "proveedor", nodo: <span className="break-words">{detalle.proveedorOLugar}</span> });
  }
  if (detalle.comprobante) {
    piezas.push({ key: "comprobante", nodo: <span>{detalle.comprobante}</span> });
  }
  return (
    <>
      {(piezas.length > 0 || gasto) && (
        <span
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
          data-detalle-gasto=""
        >
          {piezas.map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && <span aria-hidden="true">·</span>}
              {p.nodo}
            </Fragment>
          ))}
          {gasto && <FacturacionBadge gasto={gasto} compacta />}
        </span>
      )}
      {detalle.hojaBalance && (
        <span className="text-[11px] leading-4 text-muted-foreground" data-hoja-balance="">
          {detalle.hojaBalance}
        </span>
      )}
      {detalle.enlacesBalance && <EnlacesBalanceGasto enlaces={detalle.enlacesBalance} />}
    </>
  );
}
