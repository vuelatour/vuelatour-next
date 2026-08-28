import Link from "next/link";
import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/admin/back-link";
import { EmptyState } from "@/components/admin/empty-state";
import { ComprasTable } from "@/components/admin/inventory/compras/compras-table";
import { CompraNuevaButton } from "@/components/admin/inventory/compras/compra-nueva-button";
import { ImportCompraButton } from "@/components/admin/inventory/import-compra-button";
import { listCompras } from "@/lib/api/compras-server";
import { listProviders } from "@/lib/api/providers-server";
import type { CompraEstado } from "@/types/compras";

export const dynamic = "force-dynamic";

type Filtro = "abiertas" | "recibidas" | "todas";

const FILTRO_ESTADO: Record<Filtro, CompraEstado | undefined> = {
  abiertas: "ABIERTA",
  recibidas: "RECIBIDA",
  todas: undefined,
};

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filtro: Filtro =
    sp.f === "recibidas" || sp.f === "todas" ? sp.f : "abiertas";

  const [comprasRes, abiertasRes, providersRes] = await Promise.all([
    listCompras({ estado: FILTRO_ESTADO[filtro], limit: 200 }),
    listCompras({ estado: "ABIERTA", limit: 1 }),
    listProviders({ limit: 200 }),
  ]);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  const tabs: { key: Filtro; label: string; count?: number }[] = [
    { key: "abiertas", label: "Abiertas", count: abiertasRes.count },
    { key: "recibidas", label: "Recibidas" },
    { key: "todas", label: "Todas" },
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
        <div>
          <p className="text-sm text-muted-foreground">Bodega</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Una compra une la factura de las refacciones con su envío e impuestos y
            reparte esos cargos al costo de cada pieza. Al recibirla en bodega se
            registran las entradas con el costo real.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportCompraButton providers={providers} />
          <CompraNuevaButton />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "abiertas" ? "/admin/inventory/compras" : `/admin/inventory/compras?f=${t.key}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === t.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  filtro === t.key ? "bg-white/20" : "bg-amber-500/20 text-amber-600",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {comprasRes.data.length === 0 ? (
        <EmptyState
          icon={ShoppingCartIcon}
          title={filtro === "abiertas" ? "Sin compras abiertas" : "Sin compras"}
          description={
            filtro === "abiertas"
              ? "Todo lo comprado ya está en bodega. Crea una compra nueva o únela desde los gastos (selecciona las facturas y elige “Unir en compra”)."
              : "Aquí verás las compras de refacciones con su costo puesto en bodega."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ComprasTable compras={comprasRes.data} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
