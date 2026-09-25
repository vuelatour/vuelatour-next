import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { esUuid } from "@/lib/admin/url-params";
import {
  getInventarioItem,
  getInventarioItemResumen,
  listMovimientosEliminados,
  type MovimientosEliminadosResultado,
} from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { getMe } from "@/lib/api/me";
import { fmtMxn } from "@/lib/format";
import {
  NOTA_VALOR_SIN_TC,
  TITULO_VALOR_SIN_TC,
  textoValorizado,
  tieneUsdSinTc,
} from "@/lib/admin/inventario-valorizado";
import { MovimientoButton } from "@/components/admin/inventory/movimiento-button";
import { CardexLibroButton } from "@/components/admin/inventory/cardex-libro-button";
import { CardexConEdicion } from "@/components/admin/inventory/cardex-con-edicion";
import { MovimientosEliminadosCard } from "@/components/admin/inventory/movimientos-eliminados-card";
import { EmpaquesCard } from "@/components/admin/inventory/empaques-card";
import { ResumenProducto } from "@/components/admin/inventory/resumen-producto";
import { UtilidadPorSalida } from "@/components/admin/inventory/utilidad-por-salida";
import {
  MARCA_ANTERIOR,
  TITULO_ANTERIOR,
  textoUbicacion,
} from "@/lib/admin/inventario-ubicacion";
import { textoPrecioVentaProducto } from "@/lib/admin/inventario-salida";
import type {
  InventarioFoto,
  InventarioItemDetail,
  InventarioItemResumen,
} from "@/types/inventory";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

/**
 * Detalle del producto (pedido del cliente 4-sep-2026): abre con los tres
 * bloques COMPRAS | VENTAS | RESUMEN (réplica de su Excel); debajo siguen
 * los indicadores, empaques, fotos y el cardex completo con sus acciones.
 */
export default async function InventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?empaque=<id>`: se llegó escaneando la CAJA → abrir el movimiento por caja. */
  searchParams: Promise<{ empaque?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Id que no es uuid (enlace viejo, marcador, dedazo) ⇒ 404 SIN llamar al
  // API: su 400 de «uuid inválido» no es un 404 y se relanzaba abajo, así que
  // la pantalla se iba al error boundary (21-sep-2026).
  if (!esUuid(id)) notFound();

  let item: InventarioItemDetail;
  let resumen: InventarioItemResumen | null;
  let aircraft: { id: string; matricula: string }[];
  let providers: { id: string; nombre: string }[];
  let puedeEditarCosto = false;
  let puedeEliminar = false;
  let eliminados: MovimientosEliminadosResultado = {
    disponible: false,
    filas: [],
    falla: false,
  };
  try {
    const [itemRes, resumenRes, aircraftRes, providersRes, me, eliminadosRes] =
      await Promise.all([
        getInventarioItem(id),
        // Bloques COMPRAS/VENTAS/RESUMEN. Tolerante: si el API aún no conoce la
        // ruta (skew de deploy) el detalle no se cae — el bloque avisa.
        getInventarioItemResumen(id).catch(() => null),
        listAircraft({ limit: 100 }),
        listProviders({ limit: 200 }),
        getMe().catch(() => null),
        // Bitácora de bajas del cardex (21-sep-2026). Nunca lanza: distingue
        // «el API no conoce la ruta» de «no se pudo leer» (ver el helper).
        listMovimientosEliminados(id),
      ]);
    item = itemRes;
    resumen = resumenRes;
    aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
    providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
    eliminados = eliminadosRes;
    // Mismos roles del PATCH del API: a los demás no se les muestra un botón
    // que les daría 403.
    puedeEditarCosto = !!me && (me.rol === "ADMIN" || me.rol === "MECANICO");
    // La baja es SOLO ADMIN (mismo rol del DELETE) y solo con el API nuevo
    // desplegado: con un backend viejo el bote daría un 404 sin explicación.
    puedeEliminar = !!me && me.rol === "ADMIN" && eliminados.disponible;
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  // Valorizado en DOS monedas que jamás se suman: pesos reales
  // (`valor_mxn`) y lo comprado en dólares sin T.C. (`valor_usd_sin_tc`,
  // ADITIVO — ausente con un API previo ⇒ se pinta como siempre).
  const valorizado = {
    mxn: item.valor_mxn,
    usdSinTc: item.valor_usd_sin_tc,
    pesosExactos: item.pesos_exactos,
  };

  // Margen vigente de la tienda (API 0.0.35; ausente = API previo, donde una
  // salida sin precio va a costo). Solo textos: el número lo aplica el API.
  const margenVentaPct = resumen?.margen_venta_pct ?? null;
  // Ubicación: nombre del catálogo, texto anterior (ámbar) o «Sin ubicación».
  const ubicacion = textoUbicacion(item);

  const empaques = item.empaques ?? [];
  const empaqueEscaneado =
    sp.empaque && empaques.some((e) => e.id === sp.empaque) ? sp.empaque : undefined;
  // Galería: principal + adicionales (sin duplicar la principal si el API la repite).
  const fotos: InventarioFoto[] = [
    ...(item.foto_url ? [{ url: item.foto_url, path: item.foto_storage_path ?? "" }] : []),
    ...(item.fotos_adicionales ?? []).filter((f) => f.url && f.url !== item.foto_url),
  ];

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
            <p className="text-sm text-muted-foreground">
              {item.categoria}
              {item.marca ? ` · ${item.marca}` : ""}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{item.nombre}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {item.numero_parte ? `Parte ${item.numero_parte} · ` : ""}
              {item.codigo ? (
                <>
                  Código <span className="font-mono">{item.codigo}</span> ·{" "}
                </>
              ) : (
                ""
              )}
              {ubicacion.tipo === "LEGADO" ? (
                <span className="text-amber-700 dark:text-amber-400" title={TITULO_ANTERIOR}>
                  {ubicacion.texto} {MARCA_ANTERIOR}
                </span>
              ) : (
                ubicacion.texto
              )}
            </p>
            {item.descripcion && (
              <p className="text-sm mt-2 max-w-2xl whitespace-pre-line">{item.descripcion}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CardexLibroButton itemId={item.id} itemNombre={item.nombre} />
          <MovimientoButton
            itemId={item.id}
            itemNombre={item.nombre}
            unidad={item.unidad}
            precioVenta={item.precio_venta != null ? Number(item.precio_venta) : null}
            precioVentaMoneda={item.precio_venta_moneda}
            empaques={empaques}
            aircraft={aircraft}
            providers={providers}
            initialEmpaqueId={empaqueEscaneado}
            autoOpen={!!empaqueEscaneado}
            margenVentaPct={margenVentaPct}
          />
        </div>
      </div>

      {/* Lo primero que ve el operador: compras, ventas y resumen por día
          (mismo FIFO/ganancia que el balance; solo se pinta). */}
      <ResumenProducto resumen={resumen} />

      {/* Utilidad de la tienda salida por salida (25-sep-2026): fecha,
          avión, cantidad, costo, venta y utilidad, cada monto en su moneda. */}
      <UtilidadPorSalida resumen={resumen} unidad={item.unidad} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Stat
          label="Stock actual"
          value={`${num(item.stock)}${item.unidad ? ` ${item.unidad}` : ""}`}
          highlight={item.bajo_stock}
        />
        <Stat label="Stock mínimo" value={item.stock_minimo != null ? num(item.stock_minimo) : "—"} />
        <Stat
          label="Costo FIFO"
          value={item.costo_fifo_mxn_actual ? fmtMxn(item.costo_fifo_mxn_actual) : "—"}
        />
        {/* Precio de VENTA al avión (29-ago-2026): la salida se carga a este
            precio; sin precio, a costo FIFO + margen de la tienda (25-sep). */}
        <Stat
          label="Precio de venta"
          value={textoPrecioVentaProducto({
            precio: item.precio_venta,
            moneda: item.precio_venta_moneda,
            margenPct: margenVentaPct,
          })}
        />
        {/* Valorizado: cada moneda en su sitio. `valor_mxn` ya solo trae
            pesos REALES (invariante 8 del API, 22-sep-2026); lo comprado en
            dólares sin T.C. se pinta en dólares en vez de desaparecer en un
            «$0.00 MXN». Con un API previo (sin el aditivo) se ve como antes. */}
        <Stat
          label="Valorizado"
          value={textoValorizado(valorizado)}
          title={tieneUsdSinTc(valorizado) ? TITULO_VALOR_SIN_TC : undefined}
        />
      </div>
      {tieneUsdSinTc(valorizado) && (
        <p className="text-xs text-amber-700 dark:text-amber-400 -mt-3">{NOTA_VALOR_SIN_TC}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
        <EmpaquesCard
          itemId={item.id}
          itemNombre={item.nombre}
          itemCodigo={item.codigo}
          unidad={item.unidad}
          empaques={empaques}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            {fotos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin fotos. Se agregan al editar el ítem o desde la app (la IA llena la ficha
                con ellas).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <a
                    key={f.path || f.url}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={i === 0 && item.foto_url ? "Foto principal" : "Foto adicional"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={`${item.nombre} ${i + 1}`}
                      className="h-20 w-20 rounded-md object-cover ring-1 ring-border hover:ring-brand-600"
                    />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cardex completo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {item.movimientos.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sin movimientos todavía. Registra una entrada para dar de alta stock.
            </p>
          ) : (
            <CardexConEdicion
              itemId={item.id}
              itemNombre={item.nombre}
              unidad={item.unidad}
              movimientos={item.movimientos}
              puedeEditarCosto={puedeEditarCosto}
              puedeEliminar={puedeEliminar}
            />
          )}
        </CardContent>
      </Card>

      {/* Bajo el cardex: qué se eliminó de él, quién y por qué. */}
      <MovimientosEliminadosCard
        filas={eliminados.filas}
        falla={eliminados.falla}
        unidad={item.unidad}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  title,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <Card title={title}>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold tabular-nums mt-1 ${highlight ? "text-amber-600" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
