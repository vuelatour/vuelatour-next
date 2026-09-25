import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { esUuid } from "@/lib/admin/url-params";
import {
  getInventarioItem,
  getInventarioItemResumen,
  listMovimientosEliminados,
  listUbicaciones,
  type MovimientosEliminadosResultado,
  type UbicacionesResultado,
} from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { getMe } from "@/lib/api/me";
import { MovimientoButton } from "@/components/admin/inventory/movimiento-button";
import { CardexLibroButton } from "@/components/admin/inventory/cardex-libro-button";
import { CardexConEdicion } from "@/components/admin/inventory/cardex-con-edicion";
import { MovimientosEliminadosCard } from "@/components/admin/inventory/movimientos-eliminados-card";
import { EmpaquesCard } from "@/components/admin/inventory/empaques-card";
import { ResumenProducto } from "@/components/admin/inventory/resumen-producto";
import { FichaPlegable } from "@/components/admin/inventory/ficha-plegable";
import { ItemEditButton } from "@/components/admin/inventory/item-edit-button";
import {
  MARCA_ANTERIOR,
  TITULO_ANTERIOR,
  textoUbicacion,
} from "@/lib/admin/inventario-ubicacion";
import {
  ETIQUETA_AERONAVE_USO,
  ID_PLEGABLE_CARDEX,
  ID_PLEGABLE_EMPAQUES,
  PLEGABLE_CARDEX,
  PLEGABLE_EMPAQUES,
  partirDescripcion,
  resumenPlegableCardex,
  resumenPlegableEmpaques,
} from "@/lib/admin/inventario-ficha";
import type {
  InventarioFoto,
  InventarioItemDetail,
  InventarioItemResumen,
} from "@/types/inventory";

export const dynamic = "force-dynamic";

/**
 * FICHA del producto — sencilla (pedido del cliente 25-sep-2026: «al entrar
 * algún producto nos están llenando de información repetida… Solo
 * necesitamos el apartado de: Compras | Ventas | Resumen de ventas»):
 *
 *  1. Cabecera: nombre, categoría · marca, parte · código · ubicación, la
 *     DESCRIPCIÓN completa y la aeronave/uso en su propio renglón; botones
 *     «Registrar movimiento», «Cardex (Excel)» y «Editar».
 *  2. COMPRAS | VENTAS | RESUMEN + «Dinero generado por este producto».
 *  3. Plegables CERRADOS al fondo: «Empaques y fotos» y «Cardex completo»
 *     (ahí se corrige un costo o se elimina un movimiento). Nada se pierde.
 *
 * Se QUITARON la tira de KPIs (stock actual/mínimo, costo, precio de venta,
 * valorizado) y la card «Utilidad por salida»: repetían lo que ya dicen las
 * tablas. La única señal que se conserva es «bajo el mínimo», en el pie del
 * Resumen. Todo número viene del API; aquí solo se pinta.
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
  let ubicacionesRes: UbicacionesResultado = { disponible: false, data: [], falla: false };
  try {
    const [itemRes, resumenRes, aircraftRes, providersRes, me, eliminadosRes, ubicRes] =
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
        // Catálogo de ubicaciones para «Editar» (el MISMO que carga la lista).
        // Nunca lanza: sin él el formulario usa el texto de siempre.
        listUbicaciones({ incluirInactivas: true }),
      ]);
    item = itemRes;
    resumen = resumenRes;
    aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
    providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
    eliminados = eliminadosRes;
    ubicacionesRes = ubicRes;
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

  // Margen vigente de la tienda (API 0.0.35+; ausente = API previo, donde una
  // salida sin precio va a costo). Solo textos: el número lo aplica el API.
  const margenVentaPct = resumen?.margen_venta_pct ?? null;
  // Ubicación: nombre del catálogo, texto anterior (ámbar) o «Sin ubicación».
  const ubicacion = textoUbicacion(item);
  const ubicaciones = ubicacionesRes.disponible ? ubicacionesRes.data : null;
  const { texto: descripcion, aeronaveUso } = partirDescripcion(item.descripcion);
  // El formulario de «Editar» no necesita el cardex: no se serializa al cliente.
  const { movimientos, ...itemSinCardex } = item;

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

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          {item.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.foto_url}
              alt={item.nombre}
              className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-border"
            />
          )}
          <div className="min-w-0">
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
            {/* Descripción detallada COMPLETA (sin recorte) y, si la trae, la
                aeronave/uso en su propio renglón. */}
            {descripcion && (
              <p className="text-sm mt-2 max-w-3xl whitespace-pre-line">{descripcion}</p>
            )}
            {aeronaveUso && (
              <p className="text-sm mt-1 max-w-3xl">
                <span className="text-muted-foreground">{ETIQUETA_AERONAVE_USO}: </span>
                {aeronaveUso}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <CardexLibroButton itemId={item.id} itemNombre={item.nombre} />
          {/* «Editar» = PATCH items/:id (ADMIN/MECANICO): a los demás roles
              no se les ofrece un formulario que terminaría en 403. */}
          {puedeEditarCosto && (
            <ItemEditButton
              item={itemSinCardex}
              categorias={item.categoria ? [item.categoria] : []}
              ubicaciones={ubicaciones}
              margenVentaPct={margenVentaPct}
            />
          )}
        </div>
      </div>

      {/* Lo único que se necesita (pedido del cliente): Compras | Ventas |
          Resumen + «Dinero generado». Mismo costo/utilidad del balance. */}
      <ResumenProducto
        resumen={resumen}
        bajoStock={item.bajo_stock}
        stockMinimo={item.stock_minimo}
      />

      {/* Plegables CERRADOS: nada se pierde, solo deja de estorbar. */}
      <FichaPlegable
        id={ID_PLEGABLE_EMPAQUES}
        titulo={PLEGABLE_EMPAQUES}
        resumen={resumenPlegableEmpaques(empaques.length, fotos.length)}
      >
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
                      className="block cursor-pointer"
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
      </FichaPlegable>

      <FichaPlegable
        id={ID_PLEGABLE_CARDEX}
        titulo={PLEGABLE_CARDEX}
        resumen={resumenPlegableCardex(movimientos.length)}
      >
        {movimientos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Sin movimientos todavía. Registra una entrada para dar de alta stock.
          </p>
        ) : (
          <div className="-mx-4">
            <CardexConEdicion
              itemId={item.id}
              itemNombre={item.nombre}
              unidad={item.unidad}
              movimientos={movimientos}
              puedeEditarCosto={puedeEditarCosto}
              puedeEliminar={puedeEliminar}
            />
          </div>
        )}

        {/* Bajo el cardex: qué se eliminó de él, quién y por qué. */}
        <MovimientosEliminadosCard
          filas={eliminados.filas}
          falla={eliminados.falla}
          unidad={item.unidad}
        />
      </FichaPlegable>
    </div>
  );
}
