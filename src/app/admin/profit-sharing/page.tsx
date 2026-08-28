import {
  ChartPieIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { ReportDownloads } from "@/components/admin/profit-sharing/report-downloads";
import { KpiStrip } from "@/components/admin/profit-sharing/kpi-strip";
import { AvionRepartoCard } from "@/components/admin/profit-sharing/avion-reparto-card";
import { getProfitSharing } from "@/lib/api/profit-sharing-server";
import { getMe } from "@/lib/api/me";
import { startOfMonthCancun, todayCancun } from "@/lib/datetime";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

export const dynamic = "force-dynamic";

function currentMonth(): { desde: string; hasta: string } {
  // Mes corriente en hora CANCÚN (no UTC): de 19:00 a 24:00 Cancún el UTC ya
  // va en el día/mes siguiente y el reparto abría en un periodo vacío.
  return { desde: startOfMonthCancun(), hasta: todayCancun() };
}

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

export default async function ProfitSharingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fallback = currentMonth();
  let desde = sp.desde || fallback.desde;
  let hasta = sp.hasta || fallback.hasta;
  // Rango invertido (dedazo del selector): se normaliza en vez de dejar que
  // el 400 del API tumbe la página completa — selector incluido.
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const [result, me] = await Promise.all([
    getProfitSharing({ desde, hasta }),
    getMe(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Finanzas</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Reparto de utilidades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cascada del saldo, desglose y reparto a socios por aeronave.
          </p>
        </div>
        <ReportDownloads desde={desde} hasta={hasta} rol={me.rol} />
      </div>

      <PeriodSelector initial={{ desde, hasta }} />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <InformationCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Cálculo en vivo</span>{" "}
            — solo se reparte lo cobrado; la reserva de overhaul sale de las
            horas de tacómetro del periodo. Descarga el PDF para socios o los
            Excel con los botones de arriba y de cada avión.
          </p>
          {(result.gastos_sin_tc?.count ?? 0) > 0 && (
            <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
              {result.gastos_sin_tc.count} gasto(s) fijo(s) en MXN sin tipo de
              cambio ({fmtDecimal(result.gastos_sin_tc.monto_mxn)} MXN) quedaron
              fuera del cálculo.
            </p>
          )}
        </div>
      </div>

      {result.aviones.length === 0 ? (
        <EmptyState
          icon={ChartPieIcon}
          title="Sin aeronaves activas"
          description="No hay datos para repartir en el periodo."
        />
      ) : (
        <>
          <KpiStrip
            aviones={result.aviones}
            otrosIngresos={result.otros_ingresos_vuelatour}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {result.aviones.map((a) => (
              <AvionRepartoCard
                key={a.aeronave.id}
                avion={a}
                desde={desde}
                hasta={hasta}
                puedeDescargarBalance={me.rol === "ADMIN" || me.rol === "ANALISTA"}
              />
            ))}
          </div>
        </>
      )}

      {result.externos && result.externos.vuelos > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PaperAirplaneIcon className="h-4 w-4 text-muted-foreground" />
              Vuelos externos del periodo
            </CardTitle>
            <CardDescription>
              Vuelos cubiertos con avión de otro operador: su dinero no
              pertenece a ningún avión de la flota, por eso NO entra a las
              cards ni al reparto de socios. Se muestra aquí para que no se
              pierda de vista.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Vuelos
                </p>
                <p className="font-semibold">{result.externos.vuelos}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cobrado
                </p>
                <p className="font-semibold font-mono">
                  {fmtUsd(result.externos.cobrado_usd)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Costo del operador
                </p>
                <p className="font-semibold font-mono">
                  {fmtUsd(result.externos.costo_usd)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Utilidad externa
                </p>
                <p
                  className={`font-semibold font-mono ${result.externos.utilidad_usd < 0 ? "text-destructive" : ""}`}
                >
                  {fmtUsd(result.externos.utilidad_usd)}
                </p>
              </div>
            </div>
            {result.externos.sin_costo_count > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                {result.externos.sin_costo_count} vuelo(s) externo(s) sin costo
                del operador capturado: la utilidad externa está incompleta.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
