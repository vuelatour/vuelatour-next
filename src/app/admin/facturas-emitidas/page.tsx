import Link from "next/link";
import {
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { RegistrarFacturaBoton } from "@/components/admin/facturas-emitidas/registrar-factura-dialog";
import { PorFacturarTable } from "@/components/admin/facturas-emitidas/por-facturar-table";
import { RegistroFacturasFiltros } from "@/components/admin/facturas-emitidas/registro-facturas-filtros";
import { RegistroFacturasResumen } from "@/components/admin/facturas-emitidas/registro-facturas-resumen";
import { RegistroFacturasTable } from "@/components/admin/facturas-emitidas/registro-facturas-table";
import { getMe } from "@/lib/api/me";
import { listClients } from "@/lib/api/clients-server";
import { listIssuingEntities } from "@/lib/api/issuing-entities-server";
import {
  getPorFacturar,
  listFacturasEmitidasAll,
} from "@/lib/api/facturas-emitidas-server";
import { Degradaciones, esErrorDeNext } from "@/lib/api/degradar";
import { isApiError } from "@/lib/api/errors";
import {
  esNoDisponible,
  filtrosFacturasDeUrl,
  hayFiltrosFacturas,
  puedeRegistrarFactura,
  queryDeFiltros,
} from "@/lib/admin/facturas-emitidas";
import { fmtMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Carga<T> = { ok: true; datos: T } | { ok: false; noDisponible: boolean };

/** Carga PRINCIPAL que distingue «sin la migración» (503) de «falló». */
async function cargar<T>(p: Promise<T>): Promise<Carga<T>> {
  try {
    return { ok: true, datos: await p };
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    const noDisponible = isApiError(e) && esNoDisponible(e);
    if (!noDisponible) console.error("[admin] facturas emitidas: falló la carga", e);
    return { ok: false, noDisponible };
  }
}

function Encabezado({ derecha }: { derecha?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Tesorería</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Facturas emitidas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Las facturas que hace facturación a mano para los clientes, en orden por número de
          factura.
        </p>
      </div>
      {derecha}
    </div>
  );
}

/**
 * FACTURAS EMITIDAS (24-sep-2026). Dos pedidos en una pantalla:
 *  - Ale: «facturas emitidas … las que hace Mari manualmente … por orden del
 *    número de la factura … que no hay unas duplicadas … Mari las estaría
 *    adjuntando en PDF» ⇒ el REGISTRO (resumen, huecos, filtros, tabla,
 *    Excel, «Registrar factura»).
 *  - Itzi: «que a Mari le salga una alertita … el pendiente de factura» ⇒
 *    «POR FACTURAR» arriba: los vuelos con «Necesito factura» y sin factura
 *    registrada (se DERIVA en el API; el panel no lo recalcula).
 *
 * La facturación AUTOMÁTICA (PAC) sigue en `/admin/facturas` («Facturación
 * automática» en el menú); esta página no la toca.
 */
export default async function FacturasEmitidasPage({ searchParams }: PageProps) {
  const [me, sp] = await Promise.all([getMe(), searchParams]);

  if (!puedeRegistrarFactura(me.rol)) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administración y facturación"
          description="El registro de facturas emitidas lo ven los usuarios con rol ADMIN o FACTURACION."
        />
      </div>
    );
  }

  const filtros = filtrosFacturasDeUrl(sp);
  const degradado = new Degradaciones();
  const [lista, porFacturar, clientesRes, emisorasRes] = await Promise.all([
    cargar(listFacturasEmitidasAll(filtros)),
    cargar(getPorFacturar()),
    degradado.opcional("los clientes", listClients({ limit: 200, activo: true }), {
      data: [] as Awaited<ReturnType<typeof listClients>>["data"],
    }),
    degradado.opcional(
      "las razones sociales",
      listIssuingEntities({ activa: true, limit: 100 }),
      { data: [] as Awaited<ReturnType<typeof listIssuingEntities>>["data"] },
    ),
  ]);

  const clientes = clientesRes.data.map((c) => ({ id: c.id, nombre: c.nombre, rfc: c.rfc }));
  const emisoras = emisorasRes.data.map((e) => ({ id: e.id, razon_social: e.razon_social }));

  // Sin la migración (503): tarjeta ámbar, nunca la pantalla rota.
  if ((!lista.ok && lista.noDisponible) || (!porFacturar.ok && porFacturar.noDisponible)) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">
              Las facturas emitidas todavía no están habilitadas en la base de datos.
            </p>
            <p>
              Falta aplicar una actualización del servidor. Vuelve a intentarlo en unos minutos;
              si sigue igual, avisa a sistemas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filtrado = hayFiltrosFacturas(filtros);

  return (
    <div className="space-y-6">
      <Encabezado
        derecha={
          <div className="flex flex-wrap items-center gap-2">
            <ExcelExportButton
              path="/v1/facturas-emitidas/export.xlsx"
              query={queryDeFiltros(filtros)}
              filename="facturas-emitidas.xlsx"
              label="Descargar Excel"
            />
            <RegistrarFacturaBoton clientes={clientes} emisoras={emisoras} />
          </div>
        }
      />

      <AvisoDegradado faltantes={degradado.faltantes} />

      {/* ------------------------ POR FACTURAR ------------------------ */}
      <section id="por-facturar" className="scroll-mt-24">
        {porFacturar.ok ? (
          <Card
            className={porFacturar.datos.count > 0 ? "border-amber-500/40" : undefined}
          >
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm">Por facturar ({porFacturar.datos.count})</CardTitle>
              <CardDescription className="text-xs">
                Vuelos en los que alguien pidió factura (con «Necesito factura») y todavía no
                tienen una factura registrada. Primero los que pagan contra factura.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {porFacturar.datos.data.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nada pendiente por facturar.
                </p>
              ) : (
                <PorFacturarTable
                  items={porFacturar.datos.data}
                  rol={me.rol}
                  resaltar={filtros.resaltar}
                  clientes={clientes}
                  emisoras={emisoras}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <TarjetaErrorCarga
            titulo="No se pudo cargar «Por facturar»"
            descripcion="Los vuelos que piden factura no se pudieron leer. Pulsa Reintentar; si sigue igual, avisa a sistemas."
          />
        )}
      </section>

      {/* ------------------------ REGISTRO ------------------------ */}
      {lista.ok ? (
        <>
          <RegistroFacturasResumen lista={lista.datos} filtros={filtros} />

          <RegistroFacturasFiltros filtros={filtros} clientes={clientes} emisoras={emisoras} />

          {filtrado && lista.datos.filtrado.count > 0 && (
            <p className="text-xs text-muted-foreground">
              Con estos filtros: {lista.datos.filtrado.count}{" "}
              {lista.datos.filtrado.count === 1 ? "factura vigente" : "facturas vigentes"}
              {lista.datos.filtrado.totales.length > 0 &&
                ` · ${lista.datos.filtrado.totales.map((t) => fmtMonto(t.total, t.moneda)).join(" · ")}`}
              .
            </p>
          )}

          {lista.datos.huboCorte && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              <span>
                Mostrando {lista.datos.data.length} de {lista.datos.count} facturas — usa los
                filtros para acotar la lista.
              </span>
            </div>
          )}

          {lista.datos.data.length === 0 ? (
            filtrado ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Ninguna factura coincide con estos filtros.{" "}
                  <Link
                    href="/admin/facturas-emitidas"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Quitar filtros
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={DocumentCheckIcon}
                title="Todavía no hay facturas registradas"
                description="Con «Registrar factura» suelta el PDF de la factura (y el XML si lo tienes): los datos se llenan solos."
              />
            )
          ) : (
            <Card>
              <CardContent className="p-0">
                <RegistroFacturasTable
                  facturas={lista.datos.data}
                  filtros={filtros}
                  clientes={clientes}
                  emisoras={emisoras}
                  huboCorte={lista.datos.huboCorte}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <TarjetaErrorCarga titulo="No se pudo cargar el registro de facturas" />
      )}
    </div>
  );
}
