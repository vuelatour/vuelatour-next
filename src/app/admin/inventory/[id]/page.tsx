import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { getInventarioItem } from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { MovimientoButton } from "@/components/admin/inventory/movimiento-button";
import { CardexTable } from "@/components/admin/inventory/cardex-table";
import type { InventarioItemDetail } from "@/types/inventory";

export const dynamic = "force-dynamic";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

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
        <BackLink
          href="/admin/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          iconClassName="h-4 w-4"
        >
          Inventario
        </BackLink>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {item.foto_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.foto_url}
                alt={item.nombre}
                className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-border"
              />
            )}
          <div>
            <p className="text-sm text-muted-foreground">{item.categoria}</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{item.nombre}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {item.numero_parte ? `Parte ${item.numero_parte} · ` : ""}
              {item.codigo ? `SKU ${item.codigo} · ` : ""}
              {item.ubicacion ?? "Bodega Cancún"}
            </p>
          </div>
          </div>
          <MovimientoButton
            itemId={item.id}
            itemNombre={item.nombre}
            aircraft={aircraft}
            providers={providers}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Stock actual" value={`${num(item.stock)}${item.unidad ? ` ${item.unidad}` : ""}`} highlight={item.bajo_stock} />
          <Stat label="Stock mínimo" value={item.stock_minimo != null ? num(item.stock_minimo) : "—"} />
          <Stat label="Costo FIFO" value={item.costo_fifo_mxn_actual ? `${mxn(item.costo_fifo_mxn_actual)} MXN` : "—"} />
          <Stat label="Valorizado" value={`${mxn(item.valor_mxn)} MXN`} />
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
              <CardexTable movimientos={item.movimientos} />
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
