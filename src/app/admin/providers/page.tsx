import { BuildingOfficeIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderActions } from "@/components/admin/providers/provider-actions";
import { ProviderCreateButton } from "@/components/admin/providers/provider-create-button";
import { listProviders } from "@/lib/api/providers-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const TIPO_LABELS: Record<string, string> = {
  NACIONAL: "Nacional",
  EXTRANJERO: "Extranjero",
  GENERICO_LOCAL: "Genérico",
};

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{p.rfc ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TIPO_LABELS[p.tipo] ?? p.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.pais ? (
                        <span className="font-mono text-xs">{p.pais}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {p.contacto && <div>{p.contacto}</div>}
                        {p.email && <div className="text-muted-foreground break-all">{p.email}</div>}
                        {p.telefono && <div className="text-muted-foreground">{p.telefono}</div>}
                        {!p.contacto && !p.email && !p.telefono && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.activo ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProviderActions provider={p} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
