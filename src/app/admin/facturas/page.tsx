import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FacturasEmitidasTable } from "@/components/admin/invoices/facturas-emitidas-table";
import { FacturasFilterBar } from "@/components/admin/invoices/facturas-filter-bar";
import { FacturasPendientesTable } from "@/components/admin/invoices/facturas-pendientes-table";
import { PacHealthButton } from "@/components/admin/invoices/pac-health-button";
import { listPendingInvoices, listFacturas, signFacturaFiles } from "@/lib/api/invoices-server";
import { listIssuingEntities } from "@/lib/api/issuing-entities-server";
import { listClients } from "@/lib/api/clients-server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    cliente_id?: string;
    emisora_id?: string;
  }>;
}

export default async function FacturasPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const [pendientesRes, facturasRes, emisorasRes, clientsRes] = await Promise.all([
    listPendingInvoices({ desde: sp.desde, hasta: sp.hasta, cliente_id: sp.cliente_id }),
    listFacturas({ emisora_id: sp.emisora_id }),
    listIssuingEntities({ activa: true, limit: 100 }),
    listClients({ limit: 200, activo: true }),
  ]);

  const emisoras = emisorasRes.data.map((e) => ({
    id: e.id,
    label: `${e.codigo} — ${e.razon_social}`,
  }));

  // Si la firma de URLs falla, se avisa en la card (antes el error se tragaba
  // y los enlaces XML/PDF simplemente desaparecían).
  const firma = await signFacturaFiles(
    facturasRes.data
      .flatMap((f) => [f.xml_url, f.pdf_url])
      .filter((p): p is string => !!p),
  )
    .then((urls) => ({ urls, fallo: false }))
    .catch(() => ({ urls: {} as Record<string, string>, fallo: true }));
  const fileUrls = firma.urls;
  const firmaUrlsFallo = firma.fallo;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Facturación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Facturas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vuelos pagados o por cobrar con método facturable, y CFDI emitidos.
          </p>
        </div>
        <PacHealthButton />
      </div>

      <FacturasFilterBar
        clients={clientsRes.data.map((c) => ({ id: c.id, nombre: c.nombre }))}
        emisoras={emisoras}
        initial={{
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
          cliente_id: sp.cliente_id ?? "",
          emisora_id: sp.emisora_id ?? "",
        }}
      />

      {/* Pendientes de facturar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pendientes de facturar</CardTitle>
          <CardDescription className="text-xs">
            {pendientesRes.count} {pendientesRes.count === 1 ? "vuelo" : "vuelos"} sin factura: pagados o por cobrar con método facturable (transferencia, link, terminal o cheque — hay clientes que piden la factura antes de pagar).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendientesRes.data.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nada pendiente por facturar.</p>
          ) : (
            <FacturasPendientesTable pendientes={pendientesRes.data} emisoras={emisoras} />
          )}
        </CardContent>
      </Card>

      {/* Facturas emitidas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Facturas emitidas</CardTitle>
          <CardDescription className="text-xs">
            {facturasRes.count} {facturasRes.count === 1 ? "factura" : "facturas"}.
          </CardDescription>
          {firmaUrlsFallo && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No se pudieron generar los enlaces de descarga; recarga la página.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {facturasRes.data.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aún no hay facturas emitidas.</p>
          ) : (
            <FacturasEmitidasTable facturas={facturasRes.data} fileUrls={fileUrls} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
