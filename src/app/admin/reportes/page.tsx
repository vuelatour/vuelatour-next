import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { CierreRepartoSection } from "@/components/admin/profit-sharing/mes-reporte-select";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import {
  FlightReportPicker,
  type FlightPickItem,
} from "@/components/admin/flights/flight-report-picker";
import {
  AircraftBalancePicker,
  type AircraftPickItem,
} from "@/components/admin/reportes/aircraft-balance-picker";
import { listFlights } from "@/lib/api/flights-server";
import { fmtDate } from "@/lib/datetime";
import { listAircraft } from "@/lib/api/aircraft";
import { PreCierreCard } from "@/components/admin/reportes/pre-cierre-card";

export const dynamic = "force-dynamic";

function currentMonth(): { desde: string; hasta: string } {
  // Mes corriente en hora Cancún (no UTC): el día 1 en la madrugada UTC aún
  // es el mes anterior para la operación.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cancun",
  }).format(new Date());
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

export default async function ReportesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fb = currentMonth();
  const desde = sp.desde || fb.desde;
  const hasta = sp.hasta || fb.hasta;

  // Vuelos recientes para el selector del reporte por vuelo.
  let flightsPick: FlightPickItem[] = [];
  try {
    const res = await listFlights({ limit: 100, offset: 0 });
    flightsPick = res.data.map((f) => {
      const ruta =
        f.ruta_iatas && f.ruta_iatas.length > 0
          ? f.ruta_iatas.join(" → ")
          : `${f.origen_iata} → ${f.destino_iata}`;
      // Fecha en el label: con varias idas a la misma ruta, el folio solo no
      // alcanza para encontrar el vuelo (y el buscador filtra por texto).
      const fecha = f.fecha_vuelo ? ` · ${fmtDate(f.fecha_vuelo)}` : "";
      return {
        id: f.id,
        folio: f.folio,
        label: `#${f.folio} · ${ruta}${fecha}`,
      };
    });
  } catch {
    flightsPick = [];
  }

  // Aeronaves para el balance por avión (todas: un avión inactivo puede
  // necesitar su libro histórico).
  let aircraftPick: AircraftPickItem[] = [];
  try {
    const res = await listAircraft({ limit: 100, offset: 0 });
    aircraftPick = res.data.map((a) => ({
      id: a.id,
      matricula: a.matricula,
      modelo: a.modelo,
    }));
  } catch {
    aircraftPick = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Tesorería</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Genera y descarga los reportes del cierre y de operación. Elige el periodo abajo.
        </p>
      </div>

      <PeriodSelector initial={{ desde, hasta }} />

      <PreCierreCard desde={desde} hasta={hasta} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cierre y reparto del periodo</CardTitle>
          <CardDescription>
            Elige el mes y descarga: PDF de reparto para socios, reporte mensual por avión en
            Excel, libro «Dinero» y el paquete de cierre (.zip con el Excel + XML/PDF de las
            facturas timbradas del periodo). Los estados de cuenta del banco se anexan a mano
            (no se almacenan en el sistema).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CierreRepartoSection desde={desde} hasta={hasta} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reporte por vuelo</CardTitle>
          <CardDescription>
            Reporte consolidado de un vuelo (cotización, ingreso, tacómetro,
            combustible y gastos) en PDF y Excel. Independiente del periodo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FlightReportPicker flights={flightsPick} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance por avión</CardTitle>
          <CardDescription>
            Libro completo de un avión en el periodo: reporte de horas
            (ventas, tacómetros, costos por vuelo), cobranza, combustible,
            gastos indirectos (incluye la parte repartida a mano), refacciones
            de bodega, permisos y balance con socios. Incluye la hoja de
            pendientes de captura para completar el mes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AircraftBalancePicker
            aircraft={aircraftPick}
            desde={desde}
            hasta={hasta}
          />
        </CardContent>
      </Card>

      {/* Consolidado de la flota: apartado propio (antes era una opción
          centinela dentro del selector de aviones de arriba y se confundía
          con el libro individual). Mismo periodo que el resto de la página. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance general VuelaTour</CardTitle>
          <CardDescription>
            Consolidado de toda la flota en el periodo, en un solo libro:
            resumen por avión, reporte de horas de todos los aviones (filas
            coloreadas por matrícula), otros movimientos, cobranza, otros
            gastos de la empresa, repartidos a aviones, inventario de bodega,
            balance por avión con sus socios y pendientes de captura. Es el
            cierre de la empresa; el libro de un solo avión se descarga arriba.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcelExportButton
            path="/v1/aircraft/balance-general.xlsx"
            filename={`balance-general-vuelatour-${desde}-${hasta}.xlsx`}
            label="Descargar balance general VuelaTour (Excel)"
            query={{ desde, hasta }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exports de operación</CardTitle>
          <CardDescription>
            Inventario y cardex son a la fecha; horas por piloto y gastos respetan el periodo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <ExcelExportButton
            path="/v1/inventory/items/export"
            filename="inventario-valorizado.xlsx"
            label="Inventario valorizado"
          />
          <ExcelExportButton
            path="/v1/inventory/movimientos/export"
            filename="cardex.xlsx"
            label="Cardex"
          />
          <ExcelExportButton
            path="/v1/dashboards/horas-piloto/export"
            filename="horas-por-piloto.xlsx"
            label="Horas por piloto"
            query={{ desde, hasta }}
          />
          <ExcelExportButton
            path="/v1/expenses/export"
            filename="gastos.xlsx"
            label="Gastos"
            query={{ desde, hasta }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
