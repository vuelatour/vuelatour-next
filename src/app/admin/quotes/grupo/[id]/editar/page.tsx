import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { GrupoForm, MOTIVO_BLOQUEO_LABEL, bloqueoDeHijo } from "@/components/admin/grupos/grupo-form";
import { getGrupo } from "@/lib/api/grupos-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import { listUsers } from "@/lib/api/users-server";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { ESTADO_GRUPO_LABEL } from "@/lib/admin/grupos-ui";
import { isoToCancunInput } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface EditarGrupoPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Revisión de un grupo: cabecera + aviones (con vuelo_id: actualizar; sin
 * él: crear; ausentes: cancelar). Los hijos congelados se muestran como no
 * editables y el formulario ofrece "aplicar solo a los editables".
 */
export default async function EditarGrupoPage({ params }: EditarGrupoPageProps) {
  const { id } = await params;
  const grupo = await getGrupo(id);
  if (!grupo) notFound();

  const volver = (
    <Link
      href={`/admin/quotes/grupo/${grupo.id}`}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      Grupo {grupo.folio_texto}
    </Link>
  );

  // Cancelado o ya volado completo: no hay nada que revisar (el API también
  // lo rechaza). Aviso amable en vez del formulario.
  if (grupo.estado === "CANCELADO" || grupo.estado === "COMPLETADO") {
    return (
      <div className="space-y-6">
        {volver}
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm max-w-2xl">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Grupo {ESTADO_GRUPO_LABEL[grupo.estado].toLowerCase()}: no se puede revisar.
            </p>
            <p className="text-muted-foreground">
              {grupo.estado === "CANCELADO"
                ? "Un grupo cancelado no se edita. Si el viaje se retoma, crea un grupo nuevo."
                : "Todos los aviones ya volaron. Los ajustes de dinero se hacen por vuelo desde su cotización."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // TC de referencia del DÍA (Cancún) en que se cotizó el grupo, como en el
  // detalle de vuelo — no el de hoy.
  const diaCotizacion = grupo.created_at
    ? isoToCancunInput(grupo.created_at).slice(0, 10) || undefined
    : undefined;
  const [aircraftRes, routesRes, airportsRes, pilotsRes, tcSugerido] = await Promise.all([
    // TODA la flota: un hijo puede volar en un avión que hoy esté dado de baja
    // (el selector lo muestra; solo los activos se ofrecen para agregar).
    listAircraft({ limit: 100 }),
    listRoutes({ limit: 200, activa: true }),
    listAirports({ limit: 200, activo: true }),
    listUsers({ rol: "PILOTO", limit: 100 }).catch(
      () => ({ data: [] }) as { data: { id: string; nombre: string; es_piloto_externo: boolean }[] },
    ),
    getTipoCambioOficial(diaCotizacion),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    asientos: Number(a.asientos) || 0,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts) || 0,
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd ? Number(a.tarifa_hora_broker_usd) : null,
    activa: a.activa,
  }));

  const routes = routesRes.data.map((r) => ({
    id: r.id,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    tramos: r.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
    })),
  }));

  const airports = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  const pilots = pilotsRes.data.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    es_piloto_externo: p.es_piloto_externo,
  }));

  // Misma regla que el formulario: congelados por dinero (API) + los que ya
  // salieron (COMPLETADO / EN_VUELO), que tampoco se editan desde el grupo.
  const congelados = grupo.aviones
    .filter((a) => !a.cancelado)
    .map((a) => ({ folio: a.folio, motivo: bloqueoDeHijo(a) }))
    .filter((a): a is { folio: number; motivo: NonNullable<ReturnType<typeof bloqueoDeHijo>> } => a.motivo != null);

  return (
    <div className="space-y-6">
      <div>
        {volver}
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Revisar grupo {grupo.folio_texto}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {grupo.nombre} · {grupo.cliente?.nombre ?? "—"} · {grupo.pasajeros_total} pasajeros ·{" "}
          {grupo.aviones_vivos} {grupo.aviones_vivos === 1 ? "avión" : "aviones"}. Edita y agrega un
          motivo: cada avión editable se recotiza como una versión nueva.
        </p>
      </div>
      {congelados.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm max-w-3xl">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {congelados.length === 1 ? "Un avión ya no se puede recotizar" : `${congelados.length} aviones ya no se pueden recotizar`}
              : {congelados.map((a) => `#${a.folio} (${MOTIVO_BLOQUEO_LABEL[a.motivo]})`).join(", ")}.
            </p>
            <p className="text-muted-foreground">
              Su precio y cargos se conservan; el cambio aplica solo a los demás aviones y el total del
              grupo cambia. El interruptor «Aplicar solo a los editables» ya viene prendido.
            </p>
          </div>
        </div>
      )}
      <GrupoForm
        mode="revise"
        grupo={grupo}
        aircraft={aircraft}
        routes={routes}
        airports={airports}
        pilots={pilots}
        tcSugerido={tcSugerido}
      />
    </div>
  );
}
