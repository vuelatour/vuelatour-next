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
import { fmtMxn } from "@/lib/format";
import {
  NOTA_VALOR_SIN_TC,
  TITULO_VALOR_SIN_TC,
  textoValorizado,
  tieneUsdSinTc,
} from "@/lib/admin/inventario-valorizado";
import { Degradaciones, principal } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  // Degradación POR TARJETA (21-sep-2026): tres de estas cinco llamadas no
  // tenían `.catch` y CUALQUIERA tumbaba la pantalla entera al error boundary
  // («Algo se rompió… digest») cada vez que el API se reiniciaba. Los
  // CATÁLOGOS de los selectores degradan a vacío + aviso; la bodega —el dato
  // por el que existe la pantalla— jamás se disfraza de «sin ítems».
  const degradado = new Degradaciones();
  const [bodega, providersRes, aircraftRes, me, sinCostoRes] =
    await Promise.all([
      // PRINCIPAL. Toda la bodega (pagina hasta count): la tabla no debe
      // "perder" ítems.
      principal(listInventarioTodo()),
      degradado.opcional("los proveedores", listProviders({ limit: 200 }), { data: [] }),
      degradado.opcional("las aeronaves", listAircraft({ limit: 100 }), { data: [] }),
      degradado.opcional("tu usuario", getMe(), null),
      // ENTRADAS sin costo real (carga masiva a $0) por completar. Tolerante:
      // si el API aún no conoce `sin_costo` (skew de deploy), la portada no
      // se cae — solo no aparece la sección. Por eso NO entra al aviso: su
      // ausencia es esperada, no una falla que anunciar.
      listMovimientos({ tipo: "ENTRADA", sin_costo: true, limit: 500 }).catch(() => null),
    ]);
  const {
    data: items,
    count,
    valor_total_mxn,
    valor_total_usd_sin_tc,
    ganancia_total_mxn,
  } = bodega.datos ?? {
    data: [],
    count: 0,
    valor_total_mxn: 0,
    valor_total_usd_sin_tc: 0,
    ganancia_total_mxn: 0,
  };
  // Valorizado: pesos reales y dólares sin T.C. van SEPARADOS y cada uno con
  // su moneda escrita (invariante 8 del API, 22-sep-2026). Con casi toda la
  // bodega comprada en dólares sin T.C., pintar solo los pesos diría
  // «valorizado $0.00» de una bodega de ~78,000 USD.
  const valorizado = { mxn: valor_total_mxn, usdSinTc: valor_total_usd_sin_tc };
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
  // Ganancia acumulada solo si ALGÚN ítem vendió con precio: un "$0.00"
  // cuando nadie ha vendido se leería como "no ganó nada" (0 falso).
  const hayGanancia = items.some((i) => i.ganancia_mxn != null);
  // Categorías existentes (únicas) para el selector del formulario: elegir
  // una evita fragmentar el catálogo ("Aceite" vs "Aceites").
  const categorias = [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Bodega</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Inventario</h1>
          {/* Con la bodega sin cargar NO se pinta ni un número: "0 ítems ·
              valorizado $0.00" se leería como bodega vacía. */}
          {!bodega.ok ? (
            <p className="text-sm text-muted-foreground mt-1">
              No se pudo cargar la bodega; los totales aparecen al reintentar.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {count} {count === 1 ? "ítem activo" : "ítems activos"} · valorizado{" "}
              <span title={tieneUsdSinTc(valorizado) ? TITULO_VALOR_SIN_TC : undefined}>
                {textoValorizado(valorizado)}
              </span>{" "}
              (FIFO) · ganancia acumulada{" "}
              {hayGanancia ? (
                <span
                  className={
                    ganancia_total_mxn > 0
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : ganancia_total_mxn < 0
                        ? "font-medium text-red-600"
                        : ""
                  }
                >
                  {fmtMxn(ganancia_total_mxn)}
                </span>
              ) : (
                <span title="Ningún producto ha vendido con precio todavía">—</span>
              )}
              . El consumo se carga al avión al registrar la salida.
            </p>
          )}
          <p className="text-xs text-muted-foreground/80 mt-1">
            Ganancia / pérdida = ventas al avión − costo FIFO de lo vendido (el mismo cálculo de la
            hoja Inventario del Balance general VuelaTour). Toca un producto para ver sus compras,
            ventas y resumen por día.
          </p>
          {/* Por qué el valorizado en pesos puede verse en cero: casi toda la
              bodega se capturó en dólares sin tipo de cambio. */}
          {bodega.ok && tieneUsdSinTc(valorizado) && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{NOTA_VALOR_SIN_TC}</p>
          )}
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

      {/* Catálogos que no cargaron (proveedores, aeronaves…): los selectores
          salen cortos y la pantalla lo DICE, en vez de fingir que no hay. */}
      <AvisoDegradado faltantes={degradado.faltantes} />

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


      {!bodega.ok ? (
        // La bodega NO se pudo leer: tarjeta de error con reintento. Jamás el
        // estado vacío de abajo — "Sin ítems en bodega" con 71 partidas
        // cargadas es exactamente la mentira que hay que evitar.
        <TarjetaErrorCarga
          titulo="No se pudo cargar la bodega"
          descripcion={
            <>
              El sistema no respondió al pedir el inventario. Suele ser momentáneo (por
              ejemplo, mientras se actualiza); pulsa Reintentar. Lo que ves arriba no
              refleja el stock real hasta que cargue.
            </>
          }
        />
      ) : items.length === 0 ? (
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
