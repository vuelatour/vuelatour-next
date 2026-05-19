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
import { getDashboardOverview } from "@/lib/api/dashboards-server";
import { fmtUsd, fmtInt } from "@/lib/format";

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

export default async function DashboardsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fallback = currentMonth();
  const desde = sp.desde || fallback.desde;
  const hasta = sp.hasta || fallback.hasta;

  const data = await getDashboardOverview({ desde, hasta });
  const { resumen, operacion, por_avion, top_clientes } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Finanzas</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Tablero ejecutivo
        </h1>
      </div>

      <PeriodSelector initial={{ desde, hasta }} />

      {/* KPIs financieros */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ingresos cobrados" value={fmtUsd(resumen.ingresos_cobrados_usd)} />
        <Kpi
          label="Saldo disponible"
          value={fmtUsd(resumen.saldo_disponible_usd)}
          accent={resumen.saldo_disponible_usd < 0 ? "text-destructive" : undefined}
        />
        <Kpi label="Gastos del periodo" value={fmtUsd(resumen.gastos_totales_usd)} />
        <Kpi
          label="Pendiente de cobro"
          value={fmtUsd(resumen.ingresos_pendientes_usd)}
          accent={
            resumen.ingresos_pendientes_usd > 0
              ? "text-amber-600 dark:text-amber-400"
              : undefined
          }
        />
      </div>

      {/* Pipeline operativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operación</CardTitle>
          <CardDescription>
            Pipeline actual y vuelos del periodo seleccionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Mini label="Solicitudes" value={operacion.solicitudes} />
            <Mini label="Cotizaciones" value={operacion.cotizaciones} />
            <Mini label="Confirmados" value={operacion.confirmados} />
            <Mini label="En vuelo" value={operacion.en_vuelo} />
            <Mini label="Completados" value={operacion.completados_periodo} />
            <Mini label="Cancelados" value={operacion.cancelados_periodo} />
          </div>
        </CardContent>
      </Card>

      {/* Por avión */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado por aeronave</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {por_avion.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Sin aeronaves activas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead className="text-right">Vuelos</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_avion.map((a) => (
                  <TableRow key={a.aeronave_id}>
                    <TableCell>
                      <span className="font-mono text-sm">{a.matricula}</span>
                      <span className="text-xs text-muted-foreground"> · {a.modelo}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtInt(a.vuelos)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(a.ingresos_cobrado_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {fmtUsd(a.gastos_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className={a.saldo_usd < 0 ? "text-destructive" : ""}>
                        {fmtUsd(a.saldo_usd)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top clientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top clientes del periodo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {top_clientes.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Sin vuelos en el periodo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Vuelos</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top_clientes.map((c) => (
                  <TableRow key={c.cliente_id}>
                    <TableCell className="text-sm">{c.nombre}</TableCell>
                    <TableCell className="text-right text-sm">{fmtInt(c.vuelos)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(c.ingresos_usd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Ingresos = vuelos cobrados. Los reportes exportables (Excel / PDF) y el
        dashboard de horas de piloto llegarán con el microservicio Python y la captura
        de tacómetros.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
