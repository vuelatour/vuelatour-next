import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { VuelosSemanaTable } from "@/components/admin/dashboards/vuelos-semana-table";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { getMe } from "@/lib/api/me";
import {
  getDashboardGastos,
  getDashboardHorasPiloto,
  getDashboardOperativo,
  getDashboardOverview,
  getDashboardTarjetas,
} from "@/lib/api/dashboards-server";
import { fmtUsd, fmtInt, fmtDecimal, fmtPercent } from "@/lib/format";
import { startOfMonthCancun, todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Rol } from "@/types/me";

export const dynamic = "force-dynamic";

type TabKey = "ejecutivo" | "operativo" | "gastos" | "tarjetas" | "horas";

interface TabDef {
  key: TabKey;
  label: string;
  roles: Rol[];
}

// Cada tablero es visible para ADMIN + el rol dueño (doc 5.10). SOCIO: solo ejecutivo.
const TABS: TabDef[] = [
  { key: "ejecutivo", label: "Ejecutivo", roles: ["ADMIN", "ANALISTA", "SOCIO"] },
  { key: "operativo", label: "Operativo", roles: ["ADMIN", "COORDINADOR"] },
  { key: "gastos", label: "Gastos", roles: ["ADMIN", "ANALISTA"] },
  { key: "tarjetas", label: "Gastos por tarjeta", roles: ["ADMIN"] },
  { key: "horas", label: "Horas de piloto", roles: ["ADMIN", "COORDINADOR"] },
];

function currentMonth(): { desde: string; hasta: string } {
  // Mes corriente en hora CANCÚN (no UTC): de 19:00 a 24:00 Cancún el UTC ya
  // va en el día/mes siguiente y los tableros abrían en un periodo vacío.
  return { desde: startOfMonthCancun(), hasta: todayCancun() };
}

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string; tab?: string }>;
}

export default async function DashboardsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fallback = currentMonth();
  const desde = sp.desde || fallback.desde;
  const hasta = sp.hasta || fallback.hasta;

  const me = await getMe();
  const tabs = TABS.filter((t) => t.roles.includes(me.rol));

  // Tab activa: la solicitada si el rol la permite, si no la primera disponible.
  const requested = tabs.find((t) => t.key === sp.tab)?.key;
  const active: TabKey | undefined = requested ?? tabs[0]?.key;

  const qs = (tab: TabKey) =>
    `/admin/dashboards?tab=${tab}&desde=${desde}&hasta=${hasta}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Reportes</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Dashboards
        </h1>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={qs(t.key)}
              className={cn(
                "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active === t.key
                  ? "bg-brand-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <PeriodSelector initial={{ desde, hasta }} />

      {active === "ejecutivo" && <Ejecutivo desde={desde} hasta={hasta} />}
      {active === "operativo" && <Operativo desde={desde} hasta={hasta} />}
      {active === "gastos" && <Gastos desde={desde} hasta={hasta} />}
      {active === "tarjetas" && <Tarjetas desde={desde} hasta={hasta} />}
      {active === "horas" && <HorasPiloto desde={desde} hasta={hasta} />}
      {!active && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No tienes tableros disponibles.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Tablero ejecutivo (Ale / Pablo / Socios)
// ============================================================

async function Ejecutivo({ desde, hasta }: { desde: string; hasta: string }) {
  const data = await getDashboardOverview({ desde, hasta });
  const { resumen, operacion, por_avion, top_clientes } = data;

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado por aeronave</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {por_avion.length === 0 ? (
            <Empty>Sin aeronaves activas.</Empty>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top clientes del periodo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {top_clientes.length === 0 ? (
            <Empty>Sin vuelos en el periodo.</Empty>
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
    </div>
  );
}

// ============================================================
// Tablero operativo (Itzel / Coordinador)
// ============================================================

async function Operativo({ desde, hasta }: { desde: string; hasta: string }) {
  const data = await getDashboardOperativo({ desde, hasta });
  const { hoy, conversion, vuelos_semana } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Solicitudes de hoy" value={fmtInt(hoy.solicitudes_del_dia)} />
        <Kpi
          label="Cotizaciones pendientes"
          value={fmtInt(hoy.cotizaciones_pendientes)}
          accent={
            hoy.cotizaciones_pendientes > 0
              ? "text-amber-600 dark:text-amber-400"
              : undefined
          }
        />
        <Kpi
          label="Tasa de conversión"
          value={fmtPercent(conversion.tasa_conversion_pct)}
        />
        <Kpi label="Vuelos esta semana" value={fmtInt(data.vuelos_semana_total)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline en vivo</CardTitle>
          <CardDescription>Estado actual de las operaciones.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Mini label="Solicitudes abiertas" value={hoy.solicitudes_abiertas} />
            <Mini label="Cotizaciones" value={hoy.cotizaciones_pendientes} />
            <Mini label="Confirmados" value={hoy.confirmados} />
            <Mini label="En vuelo" value={hoy.en_vuelo} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversión del periodo</CardTitle>
          <CardDescription>
            Cotizaciones que avanzaron a confirmado o más, sobre el total que llegó
            al menos a cotización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Mini label="Base cotizados" value={conversion.base_cotizados} />
            <Mini label="Convertidos" value={conversion.convertidos} />
            <Mini label="Cancelados" value={conversion.cancelados} />
            <div className="rounded-lg border border-border p-3">
              <p className="text-xl font-semibold">
                {fmtPercent(conversion.tasa_conversion_pct)}
              </p>
              <p className="text-[11px] text-muted-foreground">Conversión</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vuelos de la semana</CardTitle>
          <CardDescription>
            Confirmados y en vuelo en los próximos 7 días.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {vuelos_semana.length === 0 ? (
            <Empty>Sin vuelos programados para la semana.</Empty>
          ) : (
            <VuelosSemanaTable vuelos={vuelos_semana} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tablero de gastos (Jimmy / Analista)
// ============================================================

async function Gastos({ desde, hasta }: { desde: string; hasta: string }) {
  const data = await getDashboardGastos({ desde, hasta });
  const { resumen, por_avion } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Gastos totales" value={fmtUsd(resumen.gastos_totales_usd)} />
        <Kpi label="Gastos por avión" value={fmtUsd(resumen.gastos_avion_usd)} />
        <Kpi label="Horas voladas" value={fmtDecimal(resumen.horas_voladas, 1)} />
        <Kpi
          label="Costo / hora promedio"
          value={
            resumen.costo_hora_promedio_usd != null
              ? fmtUsd(resumen.costo_hora_promedio_usd)
              : "—"
          }
        />
      </div>

      {resumen.gastos_sin_avion_usd > 0 && (
        <p className="text-xs text-muted-foreground">
          {fmtUsd(resumen.gastos_sin_avion_usd)} en gastos sin avión asignado (no se
          imputan a ninguna aeronave).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costo y utilidad por avión</CardTitle>
          <CardDescription>
            Horas voladas de vuelos completados en el periodo. Costo/hora = gastos ÷
            horas; utilidad/hora = (ingresos cobrados − gastos) ÷ horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {por_avion.length === 0 ? (
            <Empty>Sin aeronaves activas.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Costo/hr</TableHead>
                  <TableHead className="text-right">Utilidad/hr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_avion.map((a) => (
                  <TableRow key={a.aeronave_id}>
                    <TableCell>
                      <span className="font-mono text-sm">{a.matricula}</span>
                      <span className="text-xs text-muted-foreground"> · {a.modelo}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtDecimal(a.horas_voladas, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {fmtUsd(a.gastos_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className={a.utilidad_usd < 0 ? "text-destructive" : ""}>
                        {fmtUsd(a.utilidad_usd)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {a.costo_hora_usd != null ? fmtUsd(a.costo_hora_usd) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {a.utilidad_hora_usd != null ? (
                        <span className={a.utilidad_hora_usd < 0 ? "text-destructive" : ""}>
                          {fmtUsd(a.utilidad_hora_usd)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Gastos por tarjeta corporativa (Ale / Admin)
// ============================================================

async function Tarjetas({ desde, hasta }: { desde: string; hasta: string }) {
  const data = await getDashboardTarjetas({ desde, hasta });
  const { resumen, por_tarjeta, por_persona, por_categoria } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Gasto total (tarjetas)" value={fmtUsd(resumen.gasto_total_usd)} />
        <Kpi label="Movimientos" value={fmtInt(resumen.movimientos)} />
        <Kpi label="Tarjetas con gasto" value={fmtInt(resumen.tarjetas_con_gasto)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tarjeta</CardTitle>
          <CardDescription>
            Gasto con tarjeta corporativa por terminación en el periodo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {por_tarjeta.length === 0 ? (
            <Empty>Sin gastos con tarjeta en el periodo.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarjeta</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead className="text-right">Movs</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_tarjeta.map((t) => (
                  <TableRow key={t.terminacion}>
                    <TableCell className="font-mono text-sm">
                      {t.terminacion === "SIN_TARJETA" ? "Sin terminación" : `•••• ${t.terminacion}`}
                    </TableCell>
                    <TableCell className="text-sm">{t.titular ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{fmtInt(t.movimientos)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(t.gasto_usd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por persona</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {por_persona.length === 0 ? (
              <Empty>Sin datos.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-right">Movs</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {por_persona.map((p) => (
                    <TableRow key={p.usuario_id ?? "sin"}>
                      <TableCell className="text-sm">{p.nombre}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(p.movimientos)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtUsd(p.gasto_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por categoría</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {por_categoria.length === 0 ? (
              <Empty>Sin datos.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Movs</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {por_categoria.map((c) => (
                    <TableRow key={c.categoria}>
                      <TableCell className="text-sm">{c.categoria}</TableCell>
                      <TableCell className="text-right text-sm">{fmtInt(c.movimientos)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtUsd(c.gasto_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Horas de piloto (Coordinador / Admin)
// ============================================================

async function HorasPiloto({ desde, hasta }: { desde: string; hasta: string }) {
  const data = await getDashboardHorasPiloto({ desde, hasta });
  const { resumen, pilotos, limite_horas_mes } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExcelExportButton
          path="/v1/dashboards/horas-piloto/export"
          filename="horas-por-piloto.xlsx"
          label="Exportar Excel"
          query={{ desde, hasta }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Horas del periodo"
          value={fmtDecimal(resumen.horas_periodo_total, 1)}
        />
        <Kpi label="Pilotos con actividad" value={fmtInt(resumen.pilotos_con_actividad)} />
        <Kpi
          label={`Sobre límite (${limite_horas_mes} hrs/mes)`}
          value={fmtInt(resumen.pilotos_sobre_limite)}
          accent={
            resumen.pilotos_sobre_limite > 0
              ? "text-amber-600 dark:text-amber-400"
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horas por piloto</CardTitle>
          <CardDescription>
            Horas de vuelos completados en el periodo, con el acumulado del mes en
            curso. El límite de {limite_horas_mes} hrs/mes es informativo y no bloquea.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pilotos.length === 0 ? (
            <Empty>Sin horas registradas en el periodo.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Piloto</TableHead>
                  <TableHead className="text-right">Vuelos</TableHead>
                  <TableHead className="text-right">Horas periodo</TableHead>
                  <TableHead className="text-right">Horas mes</TableHead>
                  <TableHead className="text-right">Límite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pilotos.map((p) => (
                  <TableRow key={p.piloto_id}>
                    <TableCell className="text-sm">{p.nombre}</TableCell>
                    <TableCell className="text-right text-sm">{fmtInt(p.vuelos_periodo)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtDecimal(p.horas_periodo, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span
                        className={
                          p.excede_limite ? "text-amber-600 dark:text-amber-400 font-medium" : ""
                        }
                      >
                        {fmtDecimal(p.horas_mes_actual, 1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.excede_limite ? (
                        <Badge variant="destructive">Excede</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">
                          {fmtDecimal(p.horas_restantes_mes, 1)} h
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Subcomponentes compartidos
// ============================================================

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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 pb-6 text-sm text-muted-foreground">{children}</p>;
}
