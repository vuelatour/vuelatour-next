import { Badge } from "@/components/ui/badge";
import {
  COMPRA_ESTADO_LABELS,
  COMPRA_ROL_LABELS,
  type CompraEstado,
  type CompraRol,
} from "@/types/compras";

/** Fuente única de colores de estado de compra (lista, detalle y gastos). */
const ESTADO_STYLE: Record<CompraEstado, string> = {
  ABIERTA: "border-amber-500/50 text-amber-600",
  RECIBIDA: "border-emerald-500/50 text-emerald-600",
};

export function CompraEstadoBadge({ estado }: { estado: CompraEstado }) {
  return (
    <Badge variant="outline" className={ESTADO_STYLE[estado] ?? ""}>
      {COMPRA_ESTADO_LABELS[estado] ?? estado}
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
