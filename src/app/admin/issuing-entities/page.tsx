import { DocumentTextIcon } from "@heroicons/react/24/outline";
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
import { IssuingEntityActions } from "@/components/admin/issuing-entities/issuing-entity-actions";
import { IssuingEntityCreateButton } from "@/components/admin/issuing-entities/issuing-entity-create-button";
import { listIssuingEntities } from "@/lib/api/issuing-entities-server";

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
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <DocumentTextIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin entidades registradas</CardTitle>
            <CardDescription>Crea la entidad para empezar a emitir facturas.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>CP</TableHead>
                  <TableHead>Régimen</TableHead>
                  <TableHead>PAC</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {e.codigo}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{e.razon_social}</TableCell>
                    <TableCell className="font-mono text-xs">{e.rfc ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.codigo_postal ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.regimen_fiscal_sat ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.pac_proveedor ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {e.activa ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <IssuingEntityActions entity={e} />
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
