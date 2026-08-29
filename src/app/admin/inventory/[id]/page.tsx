import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { getInventarioItem } from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { getMe } from "@/lib/api/me";
import { MovimientoButton } from "@/components/admin/inventory/movimiento-button";
import { CardexLibroButton } from "@/components/admin/inventory/cardex-libro-button";
import { CardexConEdicion } from "@/components/admin/inventory/cardex-con-edicion";
import { EmpaquesCard } from "@/components/admin/inventory/empaques-card";
import type { InventarioFoto, InventarioItemDetail } from "@/types/inventory";

export const dynamic = "force-dynamic";

const mxn = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

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

  let item: InventarioItemDetail;
  let aircraft: { id: string; matricula: string }[];
  let providers: { id: string; nombre: string }[];
  let puedeEditarCosto = false;
  try {
    const [itemRes, aircraftRes, providersRes, me] = await Promise.all([
      getInventarioItem(id),
      listAircraft({ limit: 100 }),
      listProviders({ limit: 200 }),
      getMe().catch(() => null),
    ]);
    item = itemRes;
    aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
    providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
    // Mismos roles del PATCH del API: a los demás no se les muestra un botón
    // que les daría 403.
    puedeEditarCosto = !!me && (me.rol === "ADMIN" || me.rol === "MECANICO");
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

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
              {item.ubicacion ?? "Bodega Cancún"}
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
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Stat label="Stock actual" value={`${num(item.stock)}${item.unidad ? ` ${item.unidad}` : ""}`} highlight={item.bajo_stock} />
          <Stat label="Stock mínimo" value={item.stock_minimo != null ? num(item.stock_minimo) : "—"} />
          <Stat label="Costo FIFO" value={item.costo_fifo_mxn_actual ? `${mxn(item.costo_fifo_mxn_actual)} MXN` : "—"} />
          {/* Precio de VENTA al avión (29-ago-2026): la salida se carga a este
              precio; sin precio, se carga a costo FIFO. */}
          <Stat
            label="Precio de venta"
            value={
              item.precio_venta != null && Number(item.precio_venta) > 0
                ? item.precio_venta_moneda === "USD"
                  ? `${usd(Number(item.precio_venta))} USD`
                  : `${mxn(Number(item.precio_venta))} MXN`
                : "A costo FIFO"
            }
          />
          <Stat label="Valorizado" value={`${mxn(item.valor_mxn)} MXN`} />
        </div>

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
            <CardTitle className="text-base">Cardex</CardTitle>
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
              />
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
