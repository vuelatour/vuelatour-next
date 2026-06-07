import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { ReportDownloads } from "@/components/admin/profit-sharing/report-downloads";
import { ExcelExportButton } from "@/components/admin/excel-export-button";

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

export default async function ReportesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const fb = currentMonth();
  const desde = sp.desde || fb.desde;
  const hasta = sp.hasta || fb.hasta;

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cierre y reparto del periodo</CardTitle>
          <CardDescription>
            PDF de reparto para socios, reporte mensual por avión en Excel, y el paquete de
            cierre (.zip con el Excel + XML/PDF de las facturas timbradas del periodo). Los
            estados de cuenta del banco se anexan a mano (no se almacenan en el sistema).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportDownloads desde={desde} hasta={hasta} />
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
