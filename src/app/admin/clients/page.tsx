import { UsersIcon } from "@heroicons/react/24/outline";
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
import { ClientActions } from "@/components/admin/clients/client-actions";
import { ClientCreateButton } from "@/components/admin/clients/client-create-button";
import { listClients } from "@/lib/api/clients-server";

export const dynamic = "force-dynamic";

const CANAL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LANDING: "Landing",
  LLAMADA: "Llamada",
  REFERIDO: "Referido",
};

export default async function ClientsPage() {
  const { data: clients, count } = await listClients({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Catálogos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "cliente registrado" : "clientes registrados"}.
          </p>
        </div>
        <ClientCreateButton />
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <UsersIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin clientes registrados</CardTitle>
            <CardDescription>
              Cuando llegue la primera solicitud, regístrala aquí para reusar sus datos en futuras
              cotizaciones.
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
                  <TableHead>Contacto</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {c.telefono && <div className="text-muted-foreground">{c.telefono}</div>}
                        {c.email && (
                          <div className="text-muted-foreground break-all">{c.email}</div>
                        )}
                        {!c.telefono && !c.email && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.rfc ?? "—"}</TableCell>
                    <TableCell>
                      {c.canal_origen ? (
                        <Badge variant="outline" className="text-xs">
                          {CANAL_LABELS[c.canal_origen] ?? c.canal_origen}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.es_broker ? (
                        <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 hover:bg-brand-600/20 text-xs">
                          Broker
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Directo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.activo ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClientActions client={c} />
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
