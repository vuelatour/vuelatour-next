import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { IssuingEntitiesTable } from "@/components/admin/issuing-entities/issuing-entities-table";
import { IssuingEntityCreateButton } from "@/components/admin/issuing-entities/issuing-entity-create-button";
import { listIssuingEntities } from "@/lib/api/issuing-entities-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function IssuingEntitiesPage() {
  const { data: entities, count } = await listIssuingEntities({ limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Catálogos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Entidades fiscales emisoras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "razón social" : "razones sociales"} para emitir CFDI 4.0.
          </p>
        </div>
        <IssuingEntityCreateButton />
      </div>

      {entities.length === 0 ? (
        <EmptyState
            icon={DocumentTextIcon}
            title="Sin entidades registradas"
            description="Crea la entidad para empezar a emitir facturas."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <IssuingEntitiesTable entities={entities} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
