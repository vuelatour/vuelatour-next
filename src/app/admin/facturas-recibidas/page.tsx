import { InboxArrowDownIcon } from "@heroicons/react/24/outline";
import { fmtDateOnly } from "@/lib/datetime";
import { Card, CardContent } from "@/components/ui/card";
import { listRecibidas } from "@/lib/api/invoices-server";
import { listGastos } from "@/lib/api/expenses-server";
import { RecibidaUploadButton } from "@/components/admin/recibidas/recibida-upload-button";
import { RecibidasTable } from "@/components/admin/recibidas/recibidas-table";
import type { FacturaRecibida } from "@/types/invoices";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const fmtDate = fmtDateOnly;

function fmtMoney(v: string | null, moneda: string | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda ?? ""}`.trim();
}

export default async function FacturasRecibidasPage() {
  const [recibidasRes, gastosRes] = await Promise.all([
    listRecibidas().catch(() => ({ data: [] as FacturaRecibida[], count: 0, limit: 0, offset: 0 })),
    listGastos({ limit: 200 }).catch(() => ({ data: [], count: 0, limit: 0, offset: 0 })),
  ]);
  const recibidas = recibidasRes.data;
  const sinClasificar = recibidas.filter((r) => r.estado === "SIN_CLASIFICAR").length;

  const gastos = gastosRes.data.map((g) => ({
    id: g.id,
    label:
      `${fmtDate(g.fecha_gasto)} · ${g.categoria} · ${fmtMoney(g.monto, g.moneda)}` +
      (g.aeronave?.matricula ? ` · ${g.aeronave.matricula}` : "") +
      (g.lugar ? ` · ${g.lugar}` : "") +
      (g.proveedor?.nombre ? ` · ${g.proveedor.nombre}` : ""),
    monto: Number(g.monto),
    moneda: g.moneda,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Facturas recibidas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sube los XML (CFDI) de proveedores; se extraen sus datos y los amarras a un gasto.
            {sinClasificar > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> {sinClasificar} sin clasificar.</span>
            )}
          </p>
        </div>
        <RecibidaUploadButton />
      </div>

      {recibidas.length === 0 ? (
        <EmptyState
            icon={InboxArrowDownIcon}
            title="Buzón vacío"
            description="Sube el primer XML de un proveedor para empezar."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <RecibidasTable recibidas={recibidas} gastos={gastos} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
