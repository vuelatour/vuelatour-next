import Link from "next/link";
import { BeakerIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import type { CombustibleMensualResponse } from "@/lib/api/aircraft";

/**
 * Detalle del gasto de combustible del avión POR MES (regla 26-ago-2026: el
 * gas se controla por avión, ya no por vuelo). Server component: la página lo
 * alimenta best-effort desde /v1/aircraft/:id/combustible-mensual (roles
 * financieros — sin permiso la card no se pinta). Montos en moneda NATIVA:
 * la conversión formal vive en el balance (Excel), no se duplica aquí.
 */

/** "2026-08" → "agosto 2026" (es-MX; el guion evita corrimiento UTC). */
function labelDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AircraftFuelCard({
  aircraftId,
  data,
}: {
  aircraftId: string;
  data: CombustibleMensualResponse;
}) {
  const meses = data.meses;
  const hayUsd = meses.some((m) => m.usd > 0);
  const tot = meses.reduce(
    (acc, m) => ({
      cargas: acc.cargas + m.cargas,
      litros: acc.litros + m.litros,
      sin_litros: acc.sin_litros + m.sin_litros,
      mxn: acc.mxn + m.mxn,
      usd: acc.usd + m.usd,
    }),
    { cargas: 0, litros: 0, sin_litros: 0, mxn: 0, usd: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BeakerIcon className="h-5 w-5 text-muted-foreground" />
          Combustible por mes
        </CardTitle>
        <CardDescription>
          Gasto de combustible del avión agrupado por mes de la carga (últimos
          12 meses, moneda original). Es el mismo dinero que la hoja
          «combustible» del Balance (Excel). Toca un mes para ver sus cargas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {meses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin cargas de combustible en los últimos 12 meses.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Cargas</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Gasto MXN</TableHead>
                  {hayUsd && (
                    <TableHead className="text-right">Gasto USD</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {meses.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell>
                      <Link
                        href={`/admin/combustibles?mes=${m.mes}&aeronave_id=${aircraftId}`}
                        className="font-medium capitalize text-primary hover:underline"
                      >
                        {labelDeMes(m.mes)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.cargas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.litros > 0 ? `${fmtDecimal(m.litros)} L` : "—"}
                      {m.sin_litros > 0 && (
                        <span
                          className="ml-1 text-xs text-amber-600 dark:text-amber-400"
                          title="Cargas capturadas sin litros: el total de litros del mes queda corto (el dinero sí está completo)."
                        >
                          · {m.sin_litros} sin litros
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.mxn > 0 ? fmtMxn(m.mxn) : "—"}
                    </TableCell>
                    {hayUsd && (
                      <TableCell className="text-right tabular-nums">
                        {m.usd > 0 ? fmtUsd(m.usd) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>Total 12 meses</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tot.cargas}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tot.litros > 0 ? `${fmtDecimal(tot.litros)} L` : "—"}
                    {tot.sin_litros > 0 && (
                      <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                        · {tot.sin_litros} sin litros
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tot.mxn > 0 ? fmtMxn(tot.mxn) : "—"}
                  </TableCell>
                  {hayUsd && (
                    <TableCell className="text-right tabular-nums">
                      {tot.usd > 0 ? fmtUsd(tot.usd) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
