import { ChartPieIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { getProfitSharing } from "@/lib/api/profit-sharing-server";
import { fmtUsd, fmtDecimal } from "@/lib/format";
import type { AvionReparto } from "@/types/profit-sharing";

export const dynamic = "force-dynamic";

function currentMonth(): { desde: string; hasta: string } {
  const now = new Date();
  const desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: now.toISOString().slice(0, 10),
  };
}

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

export default async function ProfitSharingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fallback = currentMonth();
  const desde = sp.desde || fallback.desde;
  const hasta = sp.hasta || fallback.hasta;

  const result = await getProfitSharing({ desde, hasta });

  const totalSaldo = result.aviones.reduce(
    (acc, a) => acc + a.saldo_disponible_usd,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Finanzas</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Reparto de utilidades
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Saldo disponible total del periodo:{" "}
          <span className="font-medium text-foreground">{fmtUsd(totalSaldo)}</span>.
        </p>
      </div>

      <PeriodSelector initial={{ desde, hasta }} />

      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Cálculo en vivo</strong> — solo se reparte lo cobrado. La reserva de
          overhaul se mostrará completa cuando se capturen horas de tacómetro (FASE 3).
        </p>
        {result.gastos_sin_tc.count > 0 && (
          <p className="text-amber-600 dark:text-amber-400">
            {result.gastos_sin_tc.count} gasto(s) fijo(s) en MXN sin tipo de cambio
            ({fmtDecimal(result.gastos_sin_tc.monto_mxn)} MXN) quedaron fuera del cálculo.
          </p>
        )}
        <p>El reporte PDF profesional para socios se generará vía el microservicio Python.</p>
      </div>

      {result.aviones.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <ChartPieIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin aeronaves activas</CardTitle>
            <CardDescription>No hay datos para repartir en el periodo.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.aviones.map((a) => (
            <AvionCard key={a.aeronave.id} avion={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AvionCard({ avion }: { avion: AvionReparto }) {
  const positivo = avion.saldo_disponible_usd >= 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-mono">
              {avion.aeronave.matricula}
            </CardTitle>
            <CardDescription>{avion.aeronave.modelo}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Saldo disponible</p>
            <p
              className={`text-lg font-semibold ${
                positivo ? "" : "text-destructive"
              }`}
            >
              {fmtUsd(avion.saldo_disponible_usd)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <Row label="Ingresos cobrados" value={avion.ingresos.cobrado_usd} positive />
          <Row label="Gastos directos" value={-avion.gastos.directos_usd} />
          <Row label="Gastos indirectos" value={-avion.gastos.indirectos_usd} />
          <Row label="Permisos" value={-avion.gastos.permisos_usd} />
          <Row
            label="Otros gastos (prorrateados)"
            value={-avion.gastos.otros_prorrateados_usd}
          />
          <Row label="Reserva overhaul" value={-avion.reserva_overhaul_usd} />
          <div className="flex items-center justify-between border-t border-border pt-1.5 font-semibold">
            <span>Saldo disponible</span>
            <span className={positivo ? "" : "text-destructive"}>
              {fmtUsd(avion.saldo_disponible_usd)}
            </span>
          </div>
        </div>

        {avion.ingresos.pendiente_cobro_usd > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Pendiente de cobro (no se reparte aún):{" "}
            {fmtUsd(avion.ingresos.pendiente_cobro_usd)} ·{" "}
            {avion.ingresos.vuelos_pendientes} vuelo(s).
          </p>
        )}
        {avion.gastos.gastos_sin_tc_count > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            {avion.gastos.gastos_sin_tc_count} gasto(s) en MXN sin TC, excluidos.
          </p>
        )}

        <div>
          <p className="text-xs font-semibold mb-1.5">Reparto a socios</p>
          {avion.reparto.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin porcentajes de socio configurados para esta aeronave.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socio</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avion.reparto.map((r) => (
                  <TableRow key={r.socio_id}>
                    <TableCell className="text-sm">{r.socio_nombre}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtDecimal(r.porcentaje)}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(r.monto_usd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {avion.reparto.length > 0 && avion.reparto_porcentaje_total !== 100 && (
            <p className="text-xs text-destructive mt-1">
              Los porcentajes suman {fmtDecimal(avion.reparto_porcentaje_total)}% (no 100%).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  positive,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${positive ? "text-green-600 dark:text-green-400" : ""}`}>
        {fmtUsd(value)}
      </span>
    </div>
  );
}
