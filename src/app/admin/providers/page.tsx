import { BuildingOfficeIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { ProvidersTable } from "@/components/admin/providers/providers-table";
import { ProviderCreateButton } from "@/components/admin/providers/provider-create-button";
import { listProviders } from "@/lib/api/providers-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const { data: providers, count } = await listProviders({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Catálogos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "proveedor registrado" : "proveedores registrados"}. Los 186
            del Excel de Mary se importarán vía FastAPI en una fase posterior.
          </p>
        </div>
        <ProviderCreateButton />
      </div>

      {providers.length === 0 ? (
        <EmptyState
            icon={BuildingOfficeIcon}
            title="Sin proveedores registrados"
            description="Crea el primer proveedor para vincularlo a gastos y facturas recibidas."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ProvidersTable providers={providers} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
