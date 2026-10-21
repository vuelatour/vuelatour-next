import { Badge } from "@/components/ui/badge";
import {
  ETIQUETA_SIN_LINEAS,
  TITULO_SIN_LINEAS,
  gastoDe,
  recepcionDe,
  type TonoEstado,
} from "@/lib/admin/compras-estado";
import {
  COMPRA_ESTADO_LABELS,
  COMPRA_ROL_LABELS,
  type CompraEstado,
  type CompraListItem,
  type CompraRol,
} from "@/types/compras";

/** Fuente única de colores de estado de compra (lista, detalle y gastos). */
const ESTADO_STYLE: Record<CompraEstado, string> = {
  ABIERTA: "border-amber-500/50 text-amber-600",
  RECIBIDA: "border-emerald-500/50 text-emerald-600",
};

/** El estado crudo del API («Abierta» / «Recibida»): lo usa la fila del gasto en Gastos. */
export function CompraEstadoBadge({ estado }: { estado: CompraEstado }) {
  return (
    <Badge variant="outline" className={ESTADO_STYLE[estado] ?? ""}>
      {COMPRA_ESTADO_LABELS[estado] ?? estado}
    </Badge>
  );
}

/** Tonos de los badges de recepción y gasto (21-oct-2026). */
export const CLASE_TONO: Readonly<Record<TonoEstado, string>> = {
  verde: "border-emerald-500/50 text-emerald-600",
  ambar: "border-amber-500/50 text-amber-600",
  rojo: "border-red-500/50 text-red-600 dark:text-red-400",
  gris: "border-border text-muted-foreground",
};

/** «Pedida, sin recibir» / «Recibida en bodega · 12 oct 2026». */
export function RecepcionBadge({ compra }: { compra: Pick<CompraListItem, "estado" | "recibida_at"> }) {
  const r = recepcionDe(compra);
  return (
    <Badge variant="outline" className={CLASE_TONO[r.tono]} data-recepcion={r.estado}>
      {r.etiqueta}
    </Badge>
  );
}

/** «Sin gasto registrado» / «Gasto registrado · $X» / «Gasto parcial · …». */
export function GastoCompraBadge({
  compra,
}: {
  compra: Pick<CompraListItem, "gasto_estado" | "gasto_mercancia" | "gasto_faltante" | "moneda" | "n_pagos">;
}) {
  const g = gastoDe(compra);
  return (
    <Badge variant="outline" className={CLASE_TONO[g.tono]} data-gasto={g.estado}>
      {g.etiqueta}
    </Badge>
  );
}

/** La compra no tiene refacciones capturadas. */
export function SinLineasBadge() {
  return (
    <Badge variant="outline" className={CLASE_TONO.gris} title={TITULO_SIN_LINEAS} data-sin-lineas="">
      {ETIQUETA_SIN_LINEAS}
    </Badge>
  );
}

const ROL_STYLE: Record<CompraRol, string> = {
  MERCANCIA: "border-brand-600/50 text-brand-600",
  ENVIO: "border-sky-500/50 text-sky-600",
  IMPUESTOS: "border-violet-500/50 text-violet-600",
  OTRO: "border-navy-400/50 text-muted-foreground",
};

/** Qué pagó un gasto dentro de su compra. */
export function CompraRolBadge({ rol }: { rol: CompraRol }) {
  return (
    <Badge variant="outline" className={ROL_STYLE[rol] ?? ""}>
      {COMPRA_ROL_LABELS[rol] ?? rol}
    </Badge>
  );
}
