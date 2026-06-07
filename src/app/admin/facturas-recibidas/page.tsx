import { InboxArrowDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
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
import { listRecibidas } from "@/lib/api/invoices-server";
import { listGastos } from "@/lib/api/expenses-server";
import { RecibidaUploadButton } from "@/components/admin/recibidas/recibida-upload-button";
import { RecibidaActions } from "@/components/admin/recibidas/recibida-actions";
import type { FacturaRecibida } from "@/types/invoices";

export const dynamic = "force-dynamic";

const ESTADO: Record<FacturaRecibida["estado"], { label: string; cls: string }> = {
  SIN_CLASIFICAR: {
    label: "Sin clasificar",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  CLASIFICADA: {
    label: "Clasificada",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  DESCARTADA: { label: "Descartada", cls: "bg-muted text-muted-foreground border-border" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

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
      (g.proveedor?.nombre ? ` · ${g.proveedor.nombre}` : ""),
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
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <InboxArrowDownIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Buzón vacío</CardTitle>
            <CardDescription>Sube el primer XML de un proveedor para empezar.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emisor</TableHead>
                  <TableHead>Conceptos</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Gasto</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recibidas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.emisor_nombre ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{r.emisor_rfc ?? ""}</p>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm truncate">{r.conceptos_resumen ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(r.fecha_emision)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtMoney(r.total, r.moneda)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.gasto
                        ? `${r.gasto.categoria} · ${fmtMoney(r.gasto.monto, r.gasto.moneda)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ESTADO[r.estado].cls}>
                        {ESTADO[r.estado].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RecibidaActions recibida={r} gastos={gastos} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
