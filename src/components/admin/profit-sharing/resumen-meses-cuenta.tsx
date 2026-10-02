import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUsd } from "@/lib/format";
import {
  ETIQUETA_COLUMNA_ENTREGADO_POR_FECHA,
  etiquetaMes,
  fmtPct,
} from "@/lib/admin/reparto-pagos";
import type { ResumenMesCuenta } from "@/types/reparto-pagos";

/**
 * «Por mes»: la utilidad que generó el socio cada mes (y de qué avión) y lo
 * que se le entregó EN ese mes calendario — por FECHA de entrega, como lo
 * agrupa el API (una entrega del 1-oct por septiembre cae en octubre), y así
 * lo dice la columna. Números del API (`por_mes` del estado de cuenta); el
 * mes en curso va marcado.
 */
export function ResumenMesesCuenta({ meses }: { meses: ResumenMesCuenta[] }) {
  if (meses.length === 0) return null;
  return (
    <Table data-tabla-por-mes>
      <TableHeader>
        <TableRow>
          <TableHead>Mes</TableHead>
          <TableHead>Aviones</TableHead>
          <TableHead className="text-right">Utilidad</TableHead>
          <TableHead className="text-right">{ETIQUETA_COLUMNA_ENTREGADO_POR_FECHA}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meses.map((m) => (
          <TableRow key={m.mes} data-mes-cuenta={m.mes}>
            <TableCell className="whitespace-nowrap text-sm font-medium">
              {etiquetaMes(m.mes)}
              {m.en_curso && (
                <span className="ml-1.5 inline-block rounded border border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                  en curso
                </span>
              )}
            </TableCell>
            <TableCell className="whitespace-normal text-xs text-muted-foreground">
              {m.por_avion.length === 0
                ? "—"
                : m.por_avion
                    .map(
                      (a) =>
                        `${a.aeronave.matricula} ${fmtPct(a.porcentaje)} · ${fmtUsd(a.monto_usd)}`,
                    )
                    .join(" | ")}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">{fmtUsd(m.utilidad_usd)}</TableCell>
            <TableCell className="text-right font-mono text-sm">{fmtUsd(m.entregado_usd)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
