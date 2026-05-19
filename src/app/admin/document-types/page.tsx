import { DocumentTextIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { DocumentTypeActions } from "@/components/admin/document-types/document-type-actions";
import { DocumentTypeCreateButton } from "@/components/admin/document-types/document-type-create-button";
import { listDocumentTypes } from "@/lib/api/document-types-server";
import { AMBITO_OPTIONS, FORMA_OPTIONS, labelOf } from "./schema";

export const dynamic = "force-dynamic";

const AMBITO_STYLES: Record<string, string> = {
  AERONAVE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  PILOTO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  MOTOR: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

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
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <DocumentTextIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin tipos de documento</CardTitle>
            <CardDescription>
              Crea el primer tipo para empezar a registrar vencimientos.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Umbral alerta</TableHead>
                  <TableHead className="text-center">Crítico</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipos.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm font-medium">{t.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={AMBITO_STYLES[t.ambito]}>
                        {labelOf(AMBITO_OPTIONS, t.ambito)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {labelOf(FORMA_OPTIONS, t.forma_default)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {t.forma_default === "PERMANENTE" ? "—" : `${t.umbral_alerta_dias} días`}
                    </TableCell>
                    <TableCell className="text-center">
                      {t.es_critico ? (
                        <span
                          title="Vencido bloquea asignación de vuelos"
                          className="inline-flex items-center text-destructive"
                        >
                          <ExclamationTriangleIcon className="h-4 w-4" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {t.activo ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DocumentTypeActions documentType={t} />
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
