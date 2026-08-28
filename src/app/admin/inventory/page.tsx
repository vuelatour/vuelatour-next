import Link from "next/link";
import {
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ItemsTable } from "@/components/admin/inventory/items-table";
import { ItemCreateButton } from "@/components/admin/inventory/item-create-button";
import { ImportCompraButton } from "@/components/admin/inventory/import-compra-button";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { listInventario } from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import { listAircraft } from "@/lib/api/aircraft";

export const dynamic = "force-dynamic";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

export default async function InventoryPage() {
  const [{ data: items, count, valor_total_mxn }, providersRes, aircraftRes] =
    await Promise.all([
      listInventario({ limit: 500 }),
      listProviders({ limit: 200 }),
      listAircraft({ limit: 100 }),
    ]);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const bajos = items.filter((i) => i.bajo_stock).length;
  // Categorías existentes (únicas) para el selector del formulario: elegir
  // una evita fragmentar el catálogo ("Aceite" vs "Aceites").
  const categorias = [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Bodega</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "ítem activo" : "ítems activos"} · valorizado {mxn(valor_total_mxn)} MXN (FIFO).
            El consumo se carga al avión al registrar la salida.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Compras de refacciones: factura + envío + impuestos → costo real
              en bodega. Sin submenú en el sidebar; la entrada es este botón. */}
          <Link
            href="/admin/inventory/compras"
            className={buttonVariants({ variant: "outline", className: "gap-2" })}
          >
            <ShoppingCartIcon className="h-4 w-4" />
            Compras
          </Link>
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
          <ItemCreateButton categorias={categorias} />
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
            <ItemsTable
              items={items}
              aircraft={aircraft}
              providers={providers}
              categorias={categorias}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
