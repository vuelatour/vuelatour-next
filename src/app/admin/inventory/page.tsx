import Link from "next/link";
import { ArchiveBoxIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { ItemActions } from "@/components/admin/inventory/item-actions";
import { ItemCreateButton } from "@/components/admin/inventory/item-create-button";
import { ImportCompraButton } from "@/components/admin/inventory/import-compra-button";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { listInventario } from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import { listAircraft } from "@/lib/api/aircraft";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

export default async function InventoryPage() {
  const [{ data: items, count, valor_total_usd }, providersRes, aircraftRes] =
    await Promise.all([
      listInventario({ limit: 500 }),
      listProviders({ limit: 200 }),
      listAircraft({ limit: 100 }),
    ]);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const bajos = items.filter((i) => i.bajo_stock).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Bodega</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "ítem activo" : "ítems activos"} · valorizado {usd(valor_total_usd)} USD (FIFO).
            El consumo se carga al avión al registrar la salida.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExcelExportButton
            path="/v1/inventory/items/export"
            filename="inventario-valorizado.xlsx"
            label="Valorizado"
          />
          <ExcelExportButton
            path="/v1/inventory/movimientos/export"
            filename="cardex.xlsx"
            label="Cardex"
          />
          <ImportCompraButton providers={providers} />
          <ItemCreateButton />
        </div>
      </div>

      {bajos > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          {bajos} {bajos === 1 ? "ítem está" : "ítems están"} por debajo del stock mínimo.
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <ArchiveBoxIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Sin ítems en bodega</CardTitle>
            <CardDescription>
              Crea el primer ítem para empezar a registrar entradas y salidas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Costo FIFO</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <Link
                        href={`/admin/inventory/${it.id}`}
                        className="font-medium hover:text-brand-600 hover:underline"
                      >
                        {it.nombre}
                      </Link>
                      {(it.numero_parte || it.codigo) && (
                        <span className="block text-xs text-muted-foreground font-mono">
                          {[it.numero_parte, it.codigo].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{it.categoria}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {num(it.stock)}
                        {it.unidad && (
                          <span className="ml-1 text-xs text-muted-foreground">{it.unidad}</span>
                        )}
                        {it.bajo_stock && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            Bajo
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {it.stock_minimo != null ? num(it.stock_minimo) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {it.costo_fifo_actual ? `${usd(it.costo_fifo_actual)} USD` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(it.valor_usd)} USD</TableCell>
                    <TableCell>
                      <ItemActions item={it} aircraft={aircraft} providers={providers} />
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
