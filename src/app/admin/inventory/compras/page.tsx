import type { Metadata } from "next";
import { tituloCompras } from "@/lib/admin/titulos-pestana";
import Link from "next/link";
import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/admin/back-link";
import { EmptyState } from "@/components/admin/empty-state";
import { ComprasTable } from "@/components/admin/inventory/compras/compras-table";
import { CompraRegistrarDialog } from "@/components/admin/inventory/compras/compra-registrar-dialog";
import { ImportCompraButton } from "@/components/admin/inventory/import-compra-button";
import { listComprasTodas } from "@/lib/api/compras-server";
import { listInventario } from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import {
  AYUDA_FLUJO_COMPRAS,
  AYUDA_PESTANA_COMPRAS,
  ORDEN_PESTANAS_COMPRAS,
  PESTANAS_COMPRAS,
  VACIO_PESTANA_COMPRAS,
  contarPestanasCompras,
  filtrarComprasPorPestana,
  filtroComprasDeUrl,
  hrefPestanaCompras,
  type FiltroCompras,
} from "@/lib/admin/compras-estado";
import { Degradaciones } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return { title: tituloCompras(filtroComprasDeUrl(sp.f)) };
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filtro: FiltroCompras = filtroComprasDeUrl(sp.f);

  // Las COMPRAS son el dato principal (todas: las pestañas se reparten con
  // los estados que manda el API); proveedores y artículos solo llenan los
  // selectores de «Registrar compra» y degradan con aviso.
  const degradado = new Degradaciones();
  const [comprasRes, providersRes, itemsRes] = await Promise.all([
    listComprasTodas(),
    degradado.opcional("los proveedores", listProviders({ limit: 200 }), {
      data: [] as Awaited<ReturnType<typeof listProviders>>["data"],
    }),
    degradado.opcional("los artículos de bodega", listInventario({ limit: 500, activo: true }), {
      data: [] as Awaited<ReturnType<typeof listInventario>>["data"],
    }),
  ]);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const items = itemsRes.data.map((i) => ({ id: i.id, nombre: i.nombre, numero_parte: i.numero_parte ?? null }));
  const conteos = contarPestanasCompras(comprasRes.data);
  const compras = filtrarComprasPorPestana(comprasRes.data, filtro);

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
        <div>
          <p className="text-sm text-muted-foreground">Inventario/Tienda</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1" data-ayuda-flujo>
            {AYUDA_FLUJO_COMPRAS}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportCompraButton providers={providers} />
          <CompraRegistrarDialog providers={providers} items={items} />
        </div>
      </div>

      <AvisoDegradado faltantes={degradado.faltantes} />

      <div className="space-y-1">
        <div className="flex gap-2 flex-wrap items-center" role="tablist" aria-label="Pestañas de compras">
          {ORDEN_PESTANAS_COMPRAS.map((key) => (
            <Link
              key={key}
              href={hrefPestanaCompras(key)}
              role="tab"
              aria-selected={filtro === key}
              title={AYUDA_PESTANA_COMPRAS[key]}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filtro === key ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {PESTANAS_COMPRAS[key]}
              {key !== "todas" && conteos[key] > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    filtro === key ? "bg-white/20" : key === "completas" ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-500/20 text-amber-600",
                  )}
                >
                  {conteos[key]}
                </span>
              )}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-ayuda-pestana>
          {AYUDA_PESTANA_COMPRAS[filtro]}
        </p>
      </div>

      {compras.length === 0 ? (
        <EmptyState
          icon={ShoppingCartIcon}
          title={VACIO_PESTANA_COMPRAS[filtro].titulo}
          description={VACIO_PESTANA_COMPRAS[filtro].descripcion}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ComprasTable compras={compras} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
