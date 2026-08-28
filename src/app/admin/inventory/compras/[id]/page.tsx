import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { isApiError } from "@/lib/api/errors";
import { getCompra } from "@/lib/api/compras-server";
import { listInventario } from "@/lib/api/inventory-server";
import { listProviders } from "@/lib/api/providers-server";
import { signFuelPhotos } from "@/lib/api/expenses-server";
import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { CompraEstadoBadge } from "@/components/admin/inventory/compras/compra-badges";
import { CompraActions } from "@/components/admin/inventory/compras/compra-actions";
import { CompraHeaderCard } from "@/components/admin/inventory/compras/compra-header-card";
import { CompraResumenCard } from "@/components/admin/inventory/compras/compra-resumen-card";
import {
  CompraLineasCard,
  type ItemOption,
} from "@/components/admin/inventory/compras/compra-lineas-card";
import { CompraCargosFacturaCard } from "@/components/admin/inventory/compras/compra-cargos-factura-card";
import { CompraPagosCard } from "@/components/admin/inventory/compras/compra-pagos-card";
import type { CompraDetalle } from "@/types/compras";

export const dynamic = "force-dynamic";

export default async function CompraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let compra: CompraDetalle;
  let providers: { id: string; nombre: string }[];
  let items: ItemOption[];
  try {
    const [compraRes, providersRes, itemsRes] = await Promise.all([
      getCompra(id),
      listProviders({ limit: 200 }),
      listInventario({ limit: 500, activo: true }),
    ]);
    compra = compraRes;
    providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
    items = itemsRes.data.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      numero_parte: i.numero_parte,
    }));
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  // Facturas de los pagos (bucket privado): se firman aquí y viajan por path.
  const fotoPaths = compra.pagos.map((p) => p.foto_url).filter((p): p is string => !!p);
  const fotoUrls = await signFuelPhotos(fotoPaths).catch(() => ({}) as Record<string, string>);

  return (
    <div className="space-y-6">
      <BackLink
        href="/admin/inventory/compras"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        iconClassName="h-4 w-4"
      >
        Compras
      </BackLink>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Bodega · Compra</p>
          <h1 className="flex items-center gap-3 text-2xl md:text-3xl font-semibold tracking-tight">
            Compra #{compra.folio}
            <CompraEstadoBadge estado={compra.estado} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {compra.proveedor?.nombre ?? "Sin proveedor"} · {fmtDateOnly(compra.fecha)}
            {compra.referencia ? ` · Ref. ${compra.referencia}` : ""}
            {compra.recibida_at ? ` · Recibida ${fmtDateTime(compra.recibida_at)}` : ""}
          </p>
        </div>
        <CompraActions compra={compra} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CompraHeaderCard compra={compra} providers={providers} />
        </div>
        <CompraResumenCard resumen={compra.resumen} />
      </div>

      <CompraLineasCard compra={compra} items={items} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CompraCargosFacturaCard compra={compra} />
        <div className="lg:col-span-2">
          <CompraPagosCard compra={compra} fotoUrls={fotoUrls} />
        </div>
      </div>
    </div>
  );
}
