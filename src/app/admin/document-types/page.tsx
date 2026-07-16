import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentTypesTable } from "@/components/admin/document-types/document-types-table";
import { DocumentTypeCreateButton } from "@/components/admin/document-types/document-type-create-button";
import { listDocumentTypes } from "@/lib/api/document-types-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function DocumentTypesPage() {
  const { data: tipos, count } = await listDocumentTypes({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Tipos de documento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "tipo" : "tipos"} en la lista maestra de vencimientos.
          </p>
        </div>
        <DocumentTypeCreateButton />
      </div>

      {tipos.length === 0 ? (
        <EmptyState
            icon={DocumentTextIcon}
            title="Sin tipos de documento"
            description="Crea el primer tipo para empezar a registrar vencimientos."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DocumentTypesTable tipos={tipos} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
