import type { Metadata } from "next";
import {
  ClockIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { CorreosEnviadosTable } from "@/components/admin/correos-enviados/correos-enviados-table";
import { CorreosPeriodoFiltro } from "@/components/admin/correos-enviados/correos-periodo-filtro";
import { listCorreosClientes } from "@/lib/api/quotes-server";
import { TITULOS_SECCION } from "@/lib/admin/titulos-pestana";
import {
  DESCRIPCION_CORREOS_ENVIADOS,
  DESCRIPCION_CORREOS_SIN_ACCESO,
  DESCRIPCION_ERROR_CORREOS_ENVIADOS,
  DESCRIPCION_SIN_CORREOS_ENVIADOS,
  LIMITE_CORREOS_ENVIADOS,
  SECCION_CORREOS_ENVIADOS,
  TEXTO_CORREOS_NO_DISPONIBLE,
  TITULO_CORREOS_ENVIADOS,
  TITULO_CORREOS_NO_DISPONIBLE,
  TITULO_CORREOS_SIN_ACCESO,
  TITULO_ERROR_CORREOS_ENVIADOS,
  TITULO_SIN_CORREOS_ENVIADOS,
  hayRangoCorreos,
  rangoCorreosDeUrl,
  textoConteoCorreos,
  textoPeriodoCorreos,
  textoTruncado,
} from "@/lib/admin/correo-cliente";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: TITULOS_SECCION.correosEnviados };

/**
 * «CORREOS ENVIADOS» (9-nov-2026, API 0.0.133). Pregunta de la oficina:
 * «¿en dónde veo que se enviaron? ¿desde qué correo?». Aquí están TODOS los
 * correos que se le mandaron a los clientes (enviados y fallidos), con quién
 * lo mandó, a qué correo y «Ver contenido» (lo que salió, tal cual).
 *
 * La lista es la llamada PRINCIPAL: si no carga se pinta la tarjeta de error
 * (o «todavía no está disponible» con un API sin desplegar), JAMÁS «no se ha
 * enviado ningún correo». `?desde=&hasta=` se validan antes de ir al API; sin
 * periodo, el API trae los últimos 90 días (hora Cancún).
 */
export default async function CorreosEnviadosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rango = rangoCorreosDeUrl(sp);
  const carga = await listCorreosClientes({
    desde: rango.desde,
    hasta: rango.hasta,
    limite: LIMITE_CORREOS_ENVIADOS,
  });
  const lista = carga.estado === "ok" ? carga.datos : null;
  // El filtro se ofrece siempre que la pantalla exista para este usuario.
  const conFiltro = carga.estado === "ok" || carga.estado === "error";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{SECCION_CORREOS_ENVIADOS}</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {TITULO_CORREOS_ENVIADOS}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{DESCRIPCION_CORREOS_ENVIADOS}</p>
      </div>

      {conFiltro && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CorreosPeriodoFiltro />
          {lista && (
            <p className="text-sm text-muted-foreground" data-correos-periodo="">
              <span className="font-medium text-foreground">
                {textoConteoCorreos(lista.correos.length)}
              </span>
              {" · "}
              {textoPeriodoCorreos(
                { desde: lista.desde || rango.desde, hasta: lista.hasta || rango.hasta },
                hayRangoCorreos(rango),
              )}
            </p>
          )}
        </div>
      )}

      {lista?.truncado && (
        // El API cortó la lista: se AVISA, nunca se da por completa.
        <div
          role="alert"
          data-correos-truncado=""
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{textoTruncado(lista.correos.length)}</p>
        </div>
      )}

      {carga.estado === "sin-acceso" ? (
        <EmptyState
          icon={LockClosedIcon}
          title={TITULO_CORREOS_SIN_ACCESO}
          description={DESCRIPCION_CORREOS_SIN_ACCESO}
        />
      ) : carga.estado === "no-disponible" ? (
        <EmptyState
          icon={ClockIcon}
          title={TITULO_CORREOS_NO_DISPONIBLE}
          description={TEXTO_CORREOS_NO_DISPONIBLE}
        />
      ) : !lista ? (
        // La lista NO cargó: jamás «sin correos».
        <TarjetaErrorCarga
          titulo={TITULO_ERROR_CORREOS_ENVIADOS}
          descripcion={DESCRIPCION_ERROR_CORREOS_ENVIADOS}
        />
      ) : lista.correos.length === 0 ? (
        <EmptyState
          icon={EnvelopeIcon}
          title={TITULO_SIN_CORREOS_ENVIADOS}
          description={DESCRIPCION_SIN_CORREOS_ENVIADOS}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <CorreosEnviadosTable correos={lista.correos} truncado={lista.truncado} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
