import Link from "next/link";
import { UsersIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { ClientsTable } from "@/components/admin/clients/clients-table";
import { ClientCreateButton } from "@/components/admin/clients/client-create-button";
import { listClients } from "@/lib/api/clients-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // ?q= permite enlazar directo a un cliente desde otras pantallas (ej.
  // Facturas → completar datos de facturación sin buscarlo a mano).
  // /v1/clients está restringido por rol (PII fiscal): un rol operativo que
  // llegue por URL directa ve un aviso en lugar del error boundary.
  let clients: Awaited<ReturnType<typeof listClients>>["data"];
  let count: number;
  try {
    ({ data: clients, count } = await listClients({
      limit: 200,
      q: q || undefined,
    }));
  } catch {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Sin acceso a clientes"
        description="Tu rol no tiene permiso para ver el catálogo de clientes (contiene datos fiscales). Pide acceso a un administrador si lo necesitas."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Catálogos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "cliente registrado" : "clientes registrados"}.
            {q && (
              <>
                {" "}
                Filtrado por &ldquo;{q}&rdquo; ·{" "}
                <Link href="/admin/clients" className="text-brand-600 hover:underline">
                  ver todos
                </Link>
              </>
            )}
          </p>
        </div>
        <ClientCreateButton />
      </div>

      {clients.length === 0 ? (
        <EmptyState
            icon={UsersIcon}
            title="Sin clientes registrados"
            description="Cuando llegue la primera solicitud, regístrala aquí para reusar sus datos en futuras cotizaciones."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ClientsTable clients={clients} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
