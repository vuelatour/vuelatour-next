import Link from "next/link";
import { CubeIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { InventoryFilterBar } from "@/components/admin/inventory/inventory-filter-bar";
import { listInventoryItems } from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { fmtDecimal, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

interface InventoryPageProps {
  searchParams: Promise<{ q?: string; categoria?: string; bajo_stock?: string }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const sp = await searchParams;

  const [itemsRes, allItemsRes, aircraftRes, providersRes] = await Promise.all([
    listInventoryItems({
      q: sp.q || undefined,
      categoria: sp.categoria || undefined,
      bajo_stock: sp.bajo_stock === "1" || undefined,
      limit: 300,
    }),
    listInventoryItems({ limit: 300 }),
    listAircraft({ limit: 100, activa: true }),
    listProviders({ limit: 300, activo: true }),
  ]);

  const items = itemsRes.data;
  const categorias = [...new Set(allItemsRes.data.map((i) => i.categoria))].sort();
  const aircraftOpts = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
  }));
  const providerOpts = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  const bajoStock = items.filter((i) => i.bajo_stock).length;
  const valorTotal = items.reduce((acc, i) => acc + i.valor_usd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} {items.length === 1 ? "insumo" : "insumos"} · valor{" "}
            {fmtUsd(valorTotal)}
            {bajoStock > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">
                  {bajoStock} en stock bajo
                </span>
              </>
            )}
            .
          </p>
        </div>
        <ItemCreateButton />
      </div>

      <InventoryFilterBar
        categorias={categorias}
        initial={{
          q: sp.q ?? "",
          categoria: sp.categoria ?? "",
          bajo_stock: sp.bajo_stock ?? "",
        }}
      />

      {items.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CubeIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin insumos</CardTitle>
            <CardDescription>
              Crea el primer insumo o ajusta los filtros.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Valor USD</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/admin/inventory/${i.id}`} className="block">
                        <p className="text-sm font-medium">{i.nombre}</p>
                        {i.numero_parte && (
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {i.numero_parte}
                          </p>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{i.categoria}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className="inline-flex items-center gap-1">
                        {i.bajo_stock && (
                          <ExclamationTriangleIcon
                            className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                            title="Stock bajo o agotado"
                          />
                        )}
                        {fmtDecimal(i.stock_actual)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {i.stock_minimo ? fmtDecimal(i.stock_minimo) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(i.valor_usd)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.ubicacion}
                      {!i.activo && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ItemActions
                        item={i}
                        aircraft={aircraftOpts}
                        providers={providerOpts}
                      />
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
