import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { desgloseSaldosPorAvion } from "@/lib/admin/reparto-pagos";
import type { ResumenCuentaSocio } from "@/types/reparto-pagos";

/**
 * Desglose corto POR AVIÓN bajo el «por entregar» de un socio (10-nov-2026,
 * API 0.0.134): «N4142R $18,798.71 MXN · XB-ANU -$3,862.60 MXN», cada saldo
 * con el color de siempre (ámbar por entregar, azul en negativo), para ver
 * de un vistazo qué avión debe y cuál va en negativo. Solo en cuentas que se
 * llevan por avión (`cuenta_por_avion`); en las demás no pinta NADA. Los
 * números son los del API (`por_avion`): aquí no se suma ni se resta.
 *
 * Va dentro de la celda del saldo (que es mono, negrita y de color): por eso
 * fija su propia tipografía y su propio color.
 */
export function DesgloseSaldosPorAvion({
  cuenta,
}: {
  cuenta: Pick<ResumenCuentaSocio, "por_avion" | "cuenta_por_avion">;
}) {
  const piezas = desgloseSaldosPorAvion(cuenta);
  if (!piezas) return null;
  return (
    <span
      className="mt-1 block whitespace-normal font-sans text-[10px] font-normal leading-snug text-muted-foreground"
      data-saldos-por-avion
    >
      {piezas.map((p, i) => (
        <Fragment key={p.clave}>
          {i > 0 && <span aria-hidden> · </span>}
          <span className="whitespace-nowrap" title={p.titulo} data-saldo-avion={p.clave}>
            {p.nombre}{" "}
            <span className={cn("font-mono font-medium", p.clase || "text-foreground")}>{p.monto}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}
