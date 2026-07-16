import Link from "next/link";
import { UsersIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/admin/empty-state";
import { datosFiscalesCompletos, RFC_EXTRANJERO } from "@/types/clients";

export const dynamic = "force-dynamic";

const CANAL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LANDING: "Landing",
  LLAMADA: "Llamada",
  REFERIDO: "Referido",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // ?q= permite enlazar directo a un cliente desde otras pantallas (ej.
  // Facturas → completar datos de facturación sin buscarlo a mano).
  const { data: clients, count } = await listClients({ limit: 200, q: q || undefined });

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>RFC / Datos fiscales</TableHead>
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
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-mono text-xs">
                          {c.rfc ?? "—"}
                          {c.rfc === RFC_EXTRANJERO && (
                            <span className="ml-1 font-sans text-[11px] text-muted-foreground">
                              (extranjero{c.pais_residencia ? `: ${c.pais_residencia}` : ""})
                            </span>
                          )}
                        </div>
                        {datosFiscalesCompletos(c) ? (
                          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20 text-[11px]">
                            Datos fiscales completos
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 text-[11px]">
                            Faltan datos fiscales
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
