import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isApiError } from "@/lib/api/errors";
import { getInventarioItem } from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { MovimientoButton } from "@/components/admin/inventory/movimiento-button";
import type { InventarioItemDetail, TipoMovimiento } from "@/types/inventory";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
const fmtDate = (s: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const TIPO_STYLE: Record<TipoMovimiento, { label: string; cls: string }> = {
  ENTRADA: { label: "Entrada", cls: "border-emerald-500/50 text-emerald-600" },
  SALIDA: { label: "Salida", cls: "border-brand-600/50 text-brand-600" },
  DEVOLUCION: { label: "Devolución", cls: "border-sky-500/50 text-sky-600" },
  AJUSTE: { label: "Ajuste", cls: "border-navy-400/50 text-muted-foreground" },
};

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item: InventarioItemDetail;
  let aircraft: { id: string; matricula: string }[];
  let providers: { id: string; nombre: string }[];
  try {
    const [itemRes, aircraftRes, providersRes] = await Promise.all([
      getInventarioItem(id),
      listAircraft({ limit: 100 }),
      listProviders({ limit: 200 }),
    ]);
    item = itemRes;
    aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
    providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Inventario
        </Link>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">{item.categoria}</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{item.nombre}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {item.numero_parte ? `Parte ${item.numero_parte} · ` : ""}
              {item.codigo ? `SKU ${item.codigo} · ` : ""}
              {item.ubicacion ?? "Bodega Cancún"}
            </p>
          </div>
          <MovimientoButton
            itemId={item.id}
            itemNombre={item.nombre}
            aircraft={aircraft}
            providers={providers}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Stock actual" value={num(item.stock)} highlight={item.bajo_stock} />
          <Stat label="Stock mínimo" value={item.stock_minimo != null ? num(item.stock_minimo) : "—"} />
          <Stat label="Costo FIFO" value={item.costo_fifo_actual ? usd(item.costo_fifo_actual) : "—"} />
          <Stat label="Valorizado" value={usd(item.valor_usd)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cardex</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {item.movimientos.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Sin movimientos todavía. Registra una entrada para dar de alta stock.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo unit.</TableHead>
                    <TableHead>Avión / Proveedor</TableHead>
                    <TableHead>Ref.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.movimientos.map((m) => {
                    const style = TIPO_STYLE[m.tipo];
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(m.fecha_movimiento)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={style.cls}>
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.tipo === "SALIDA" ? "−" : "+"}
                          {num(m.cantidad)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {usd(m.costo_unitario_usd)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.aeronave?.matricula ?? m.proveedor?.nombre ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {m.referencia ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold tabular-nums mt-1 ${highlight ? "text-amber-600" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
