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
import { ItemBulkUploadDialog } from "@/components/admin/inventory/item-bulk-upload-dialog";
import { CodigoSearch } from "@/components/admin/inventory/codigo-search";
import {
  EntradasSinCosto,
  type EntradaSinCosto,
} from "@/components/admin/inventory/entradas-sin-costo";
import { listInventarioTodo, listMovimientos } from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import { listAircraft } from "@/lib/api/aircraft";
import { getMe } from "@/lib/api/me";

export const dynamic = "force-dynamic";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

export default async function InventoryPage() {
  const [{ data: items, count, valor_total_mxn }, providersRes, aircraftRes, me, sinCostoRes] =
    await Promise.all([
      // Toda la bodega (pagina hasta count): la tabla no debe "perder" ítems.
      listInventarioTodo(),
      listProviders({ limit: 200 }),
      listAircraft({ limit: 100 }),
      getMe().catch(() => null),
      // ENTRADAS sin costo real (carga masiva a $0) por completar. Tolerante:
      // si el API aún no conoce `sin_costo` (skew de deploy), la portada no
      // se cae — solo no aparece la sección.
      listMovimientos({ tipo: "ENTRADA", sin_costo: true, limit: 500 }).catch(() => null),
    ]);
  // Alta masiva: el API la permite a ADMIN/MECANICO (y COORDINADOR); SOCIO
  // solo consulta, así que no se le muestra un botón que le daría 403.
  const puedeAltaMasiva = !!me && me.rol !== "SOCIO";
  // Mismos roles del PATCH de costo del API (ADMIN/MECANICO).
  const puedeEditarCosto = !!me && (me.rol === "ADMIN" || me.rol === "MECANICO");
  const entradasSinCosto: EntradaSinCosto[] = (sinCostoRes?.data ?? []).map((m) => ({
    id: m.id,
    itemId: m.item_id,
    itemNombre: m.item?.nombre ?? "Ítem",
    fecha_movimiento: m.fecha_movimiento,
    cantidad: Number(m.cantidad),
    referencia: m.referencia,
    moneda: m.moneda,
    costo_unitario_usd: Number(m.costo_unitario_usd),
    costo_unitario_mxn: m.costo_unitario_mxn != null ? Number(m.costo_unitario_mxn) : null,
    tc_usd_mxn: m.tc_usd_mxn != null ? Number(m.tc_usd_mxn) : null,
  }));
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
          <p className="text-xs text-muted-foreground/80 mt-1">
            El reporte de inventario vive en el Balance general VuelaTour (hoja Inventario).
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
          {/* Los exports Valorizado/Cardex se retiraron de aquí: el reporte
              de inventario vive en el Balance general VuelaTour (hoja Inventario). El
              cardex por ítem sigue en el detalle ("Cardex (Excel)"). */}
          <ImportCompraButton providers={providers} />
          {puedeAltaMasiva && <ItemBulkUploadDialog />}
          <ItemCreateButton categorias={categorias} />
        </div>
      </div>

      {/* Lector de código de barras: abre el producto (o su caja) al instante;
          si el código no existe, ofrece darlo de alta ya con ese código. */}
      <CodigoSearch categorias={categorias} />

      {bajos > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          {bajos} {bajos === 1 ? "ítem está" : "ítems están"} por debajo del stock mínimo.
        </div>
      )}

      {/* Entradas de la carga masiva a $0: el cliente les completa el precio
          real desde aquí (mismo diálogo que en el cardex del ítem). */}
      <EntradasSinCosto entradas={entradasSinCosto} puedeEditarCosto={puedeEditarCosto} />


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
