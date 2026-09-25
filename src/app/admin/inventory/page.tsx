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
import { UtilidadTiendaCard } from "@/components/admin/inventory/utilidad-tienda-card";
import {
  getTiendaResumen,
  listInventarioTodo,
  listMovimientos,
  listUbicaciones,
} from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import { listAircraft } from "@/lib/api/aircraft";
import { getMe } from "@/lib/api/me";
import { todayCancun } from "@/lib/datetime";
import {
  NOTA_VALOR_SIN_TC,
  TITULO_VALOR_SIN_TC,
  textoValorizadoConTc,
  tieneUsdSinTc,
} from "@/lib/admin/inventario-valorizado";
import { Degradaciones, principal } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { ordenInventarioDeUrl } from "@/lib/admin/inventario-orden";
import { filtroUbicacionDeUrl } from "@/lib/admin/inventario-ubicacion";
import {
  numeroONulo,
  periodoTiendaDeUrl,
  rangoPeriodoTienda,
} from "@/lib/admin/inventario-utilidad";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    /** Orden de la tabla (24-sep-2026): `se-acaban`, `stock-desc`, `utilidad-desc`…
     *  Fuera de catálogo se ignora (A–Z); el `ganancia` viejo = `utilidad`. */
    orden?: string | string[];
    /** Periodo de la UTILIDAD (25-sep-2026): `todo` (default) | `mes` | `mes-anterior`. */
    periodo?: string | string[];
    /** Filtro de ubicación (25-sep-2026): uuid del catálogo o `sin`. Filtra en el navegador. */
    ubic?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const ordenInicial = ordenInventarioDeUrl(sp.orden);
  // La utilidad (columna + tarjeta) es del PERIODO elegido; el stock y el
  // valorizado siempre son de todo el cardex (así lo calcula el API).
  const periodo = periodoTiendaDeUrl(sp.periodo);
  const rango = rangoPeriodoTienda(periodo, todayCancun());
  // Degradación POR TARJETA (21-sep-2026): tres de estas cinco llamadas no
  // tenían `.catch` y CUALQUIERA tumbaba la pantalla entera al error boundary
  // («Algo se rompió… digest») cada vez que el API se reiniciaba. Los
  // CATÁLOGOS de los selectores degradan a vacío + aviso; la bodega —el dato
  // por el que existe la pantalla— jamás se disfraza de «sin ítems».
  const degradado = new Degradaciones();
  const [bodega, providersRes, aircraftRes, me, sinCostoRes, ubicacionesRes, tienda] =
    await Promise.all([
      // PRINCIPAL. Toda la bodega (pagina hasta count): la tabla no debe
      // "perder" ítems. `desde/hasta` acotan SOLO la utilidad por ítem.
      principal(listInventarioTodo(rango ?? {})),
      degradado.opcional("los proveedores", listProviders({ limit: 200 }), { data: [] }),
      degradado.opcional("las aeronaves", listAircraft({ limit: 100 }), { data: [] }),
      degradado.opcional("tu usuario", getMe(), null),
      // ENTRADAS sin costo real (carga masiva a $0) por completar. Tolerante:
      // si el API aún no conoce `sin_costo` (skew de deploy), la portada no
      // se cae — solo no aparece la sección. Por eso NO entra al aviso: su
      // ausencia es esperada, no una falla que anunciar.
      listMovimientos({ tipo: "ENTRADA", sin_costo: true, limit: 500 }).catch(() => null),
      // Catálogo de ubicaciones (25-sep-2026). Nunca lanza: sin él (API
      // previo / migración pendiente) la lista se pinta como antes.
      listUbicaciones({ incluirInactivas: true }),
      // Utilidad de la tienda del periodo. Nunca lanza: null ⇒ la tarjeta
      // usa las sumas de la lista (misma moneda, jamás cruzadas).
      getTiendaResumen(rango ?? {}),
    ]);
  const {
    data: items,
    count,
    valor_total_mxn,
    valor_total_usd_sin_tc,
    utilidad_total_mxn,
    utilidad_total_usd,
    utilidad_total_usd_original,
    margen_venta_pct: margenLista,
    tc_hoy,
    regla_costo,
  } = bodega.datos ?? {
    data: [],
    count: 0,
    valor_total_mxn: 0,
    valor_total_usd_sin_tc: 0,
    utilidad_total_mxn: null,
    utilidad_total_usd: null,
    utilidad_total_usd_original: null,
    margen_venta_pct: undefined,
    tc_hoy: undefined,
    regla_costo: undefined,
  };
  // Valorizado: existencia × último precio de compra al T.C. oficial de HOY
  // (API 0.0.36). Pesos y dólares sin T.C. siguen SEPARADOS, cada uno con su
  // moneda escrita (invariante 8 del API): tras la migración de T.C. ya no
  // queda nada en dólares y la cifra es la bodega entera en pesos.
  const valorizado = { mxn: valor_total_mxn, usdSinTc: valor_total_usd_sin_tc };
  // Alta masiva: el API la permite a ADMIN/MECANICO (y COORDINADOR); SOCIO
  // solo consulta, así que no se le muestra un botón que le daría 403.
  const puedeAltaMasiva = !!me && me.rol !== "SOCIO";
  // Mismos roles del PATCH de costo del API (ADMIN/MECANICO).
  const puedeEditarCosto = !!me && (me.rol === "ADMIN" || me.rol === "MECANICO");
  // Mismos roles de POST/PATCH ubicaciones y «mover-ubicacion» del API.
  const puedeAdministrarUbicaciones = puedeEditarCosto;
  // Catálogo de ubicaciones: null = no disponible (la columna pinta el texto
  // de siempre y no hay filtro/«Mover a…»/«Ubicaciones»).
  const ubicaciones = ubicacionesRes.disponible ? ubicacionesRes.data : null;
  const filtroUbicacionInicial = ubicaciones ? filtroUbicacionDeUrl(sp.ubic, ubicaciones) : null;
  // Margen vigente: el de la tienda, si no el de la lista (textos; el número
  // real lo decide el API al registrar cada salida).
  const margenVentaPct = tienda?.margen_venta_pct ?? margenLista ?? null;
  // Respaldo de la tarjeta si `tienda/resumen` no contestó: las sumas de la
  // lista (cada moneda por su lado) y las unidades vendidas (Σ ventas_cant).
  const conVentasCant = items.some((i) => "ventas_cant" in i);
  const respaldoTienda = {
    utilidad_mxn: utilidad_total_mxn,
    utilidad_usd: utilidad_total_usd,
    utilidad_usd_original: utilidad_total_usd_original,
    enPesos: !!regla_costo,
    unidades_vendidas: conVentasCant
      ? items.reduce((s, i) => s + (numeroONulo(i.ventas_cant) ?? 0), 0)
      : null,
    ventas_sin_utilidad: items.reduce((s, i) => s + (numeroONulo(i.ventas_sin_utilidad) ?? 0), 0),
    con_entradas_sin_costo: items.some((i) => i.con_entradas_sin_costo === true),
  };
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
          {/* Con la bodega sin cargar NO se pinta ni un número: "0 ítems ·
              valorizado $0.00" se leería como bodega vacía. */}
          {!bodega.ok ? (
            <p className="text-sm text-muted-foreground mt-1">
              No se pudo cargar la bodega; los totales aparecen al reintentar.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {count} {count === 1 ? "ítem activo" : "ítems activos"} ·{" "}
              <span title={tieneUsdSinTc(valorizado) ? TITULO_VALOR_SIN_TC : undefined}>
                {textoValorizadoConTc(valorizado, { tcHoy: tc_hoy?.tc ?? null, reglaCosto: regla_costo })}
              </span>
              . El consumo se carga al avión al registrar la salida.
            </p>
          )}
          <p className="text-xs text-muted-foreground/80 mt-1">
            Toca un producto para ver sus compras, sus ventas y el resumen por día.
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
          <ItemCreateButton
            categorias={categorias}
            ubicaciones={ubicaciones}
            margenVentaPct={margenVentaPct}
          />
        </div>
      </div>

      {/* Catálogos que no cargaron (proveedores, aeronaves…): los selectores
          salen cortos y la pantalla lo DICE, en vez de fingir que no hay. */}
      <AvisoDegradado
        faltantes={
          ubicacionesRes.falla
            ? [...degradado.faltantes, "las ubicaciones"]
            : degradado.faltantes
        }
      />

      {/* Utilidad de la TIENDA (25-sep-2026): pesos y dólares por separado,
          del periodo elegido. Con la bodega sin cargar no se pinta ni un
          número (la tarjeta de error de abajo lo dice). */}
      {bodega.ok && (
        <UtilidadTiendaCard
          resumen={tienda}
          respaldo={respaldoTienda}
          periodo={periodo}
          rango={rango}
          margenVentaPct={margenVentaPct}
          ubicacionesIds={ubicaciones ? ubicaciones.map((u) => u.id) : null}
        />
      )}

      {/* Lector de código de barras: abre el producto (o su caja) al instante;
          si el código no existe, ofrece darlo de alta ya con ese código. */}
      <CodigoSearch
        categorias={categorias}
        ubicaciones={ubicaciones}
        margenVentaPct={margenVentaPct}
      />

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
              ordenInicial={ordenInicial}
              ubicaciones={ubicaciones}
              margenVentaPct={margenVentaPct}
              puedeAdministrarUbicaciones={puedeAdministrarUbicaciones}
              filtroUbicacionInicial={filtroUbicacionInicial}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
