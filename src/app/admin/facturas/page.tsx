import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/datetime";
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
import { EmitirFacturaButton } from "@/components/admin/invoices/emitir-factura-button";
import { FacturaActions } from "@/components/admin/invoices/factura-actions";
import { FacturasFilterBar } from "@/components/admin/invoices/facturas-filter-bar";
import { listPendingInvoices, listFacturas, signFacturaFiles } from "@/lib/api/invoices-server";
import { listIssuingEntities } from "@/lib/api/issuing-entities-server";
import { listClients } from "@/lib/api/clients-server";
import type { PendingFlight } from "@/types/invoices";

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<string, string> = {
  TIMBRADA: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
  ERROR: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

function clienteNombre(c: PendingFlight["cliente"]): string {
  if (!c) return "—";
  const x = Array.isArray(c) ? c[0] : c;
  return x?.nombre ?? "—";
}

function clienteRfc(c: PendingFlight["cliente"]): string | null {
  if (!c) return null;
  const x = Array.isArray(c) ? c[0] : c;
  return x?.rfc ?? null;
}

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
      <div>
        <p className="text-sm text-muted-foreground">Facturación</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Facturas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vuelos pagados o por cobrar con método facturable, y CFDI emitidos.
        </p>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Folio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Emitir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientesRes.data.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/admin/flights/${v.id}`}
                        className="hover:text-brand-600 hover:underline"
                        title="Ver el vuelo"
                      >
                        #{v.folio}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {/* Al cliente: para completar RFC/razón social sin buscarlo. */}
                      <Link
                        href={`/admin/clients?q=${encodeURIComponent(clienteNombre(v.cliente))}`}
                        className="hover:text-brand-600 hover:underline"
                        title="Abrir en Clientes (completar datos de facturación)"
                      >
                        {clienteNombre(v.cliente)}
                      </Link>
                      {!clienteRfc(v.cliente) && (
                        <span
                          className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-600"
                          title="Captura RFC/régimen/CP en Clientes, o factura a Público en general / Otro receptor"
                        >
                          Sin datos fiscales
                        </span>
                      )}
                      {v.cobrado === false && (
                        <span className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-600">
                          Por cobrar{v.metodo_cobro ? ` · ${v.metodo_cobro}` : ""}
                        </span>
                      )}
                      {v.cobrado === true && (
                        <span className="ml-2 rounded-full border border-green-500/50 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">
                          Pagado{v.metodo_cobro ? ` · ${v.metodo_cobro}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.ruta ?? `${v.origen_iata} → ${v.destino_iata}`}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.fecha_vuelo
                        ? fmtDate(v.fecha_vuelo)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {v.monto_total_mxn
                        ? `$${Number(v.monto_total_mxn).toLocaleString("es-MX")} MXN`
                        : `$${Number(v.monto_total_usd).toLocaleString("en-US")} USD`}
                      {!v.monto_total_mxn && (
                        <span
                          className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 font-sans text-[10px] text-amber-600"
                          title="Cotizado en USD sin tipo de cambio: se pedirá el TC al emitir (el CFDI se timbra en MXN)"
                        >
                          Falta TC
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EmitirFacturaButton
                        vueloId={v.id}
                        emisoras={emisoras}
                        clienteNombre={clienteNombre(v.cliente)}
                        clienteRfc={clienteRfc(v.cliente)}
                        montoTotalMxn={v.monto_total_mxn}
                        montoTotalUsd={v.monto_total_usd}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio fiscal (UUID)</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vuelo</TableHead>
                  <TableHead>Emisora</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Archivos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturasRes.data.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-[11px]">
                      {f.uuid_fiscal ?? "—"}
                      {/* facturado_a_* ahora se persiste en TODAS las facturas
                          (lo exige la cancelación): la leyenda 9.7 "SE FACTURÓ
                          A" solo aplica cuando el receptor difiere del cliente
                          del vuelo; público en general tiene su propia nota. */}
                      {(() => {
                        if (!f.facturado_a_rfc) return null;
                        if (f.facturado_a_rfc === "XAXX010101000") {
                          return (
                            <span className="block text-[10px] text-muted-foreground">
                              PÚBLICO EN GENERAL
                            </span>
                          );
                        }
                        const cli = f.vuelo?.cliente;
                        const clienteRfcVuelo = (Array.isArray(cli) ? cli[0] : cli)?.rfc ?? null;
                        if (
                          clienteRfcVuelo &&
                          f.facturado_a_rfc.toUpperCase() === clienteRfcVuelo.toUpperCase()
                        ) {
                          return null;
                        }
                        return (
                          <span
                            className="block text-[10px] text-muted-foreground"
                            title={`SE FACTURÓ A: ${f.facturado_a_nombre ?? ""} (${f.facturado_a_rfc})`}
                          >
                            SE FACTURÓ A: {f.facturado_a_rfc}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          f.tipo_comprobante === "E"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : ""
                        }
                      >
                        {f.tipo_comprobante === "E" ? "Nota crédito" : "Factura"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {f.vuelo ? `#${f.vuelo.folio} · ${f.vuelo.origen_iata}→${f.vuelo.destino_iata}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{f.emisora?.codigo ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {f.fecha_timbrado
                        ? fmtDate(f.fecha_timbrado)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${Number(f.total).toLocaleString("es-MX")} {f.moneda}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ESTADO_STYLES[f.estado] ?? ""}>
                        {f.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex gap-2">
                        {f.xml_url && fileUrls[f.xml_url] ? (
                          <a href={fileUrls[f.xml_url]} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                            XML
                          </a>
                        ) : null}
                        {f.pdf_url && fileUrls[f.pdf_url] ? (
                          <a href={fileUrls[f.pdf_url]} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                            PDF
                          </a>
                        ) : null}
                        {!f.xml_url && !f.pdf_url ? <span className="text-muted-foreground">—</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <FacturaActions factura={f} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
