"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/admin/back-link";
import {
  GrupoForm,
  MOTIVO_BLOQUEO_LABEL,
  bloqueoDeHijo,
  type AeronaveOption,
  type AeropuertoOption,
  type PilotoOption,
  type RutaOption,
} from "@/components/admin/grupos/grupo-form";
import type { CobroBarra } from "@/components/admin/grupos/grupo-form/total-bar-grupo";
import { pendienteCobro } from "@/lib/admin/cobros";
import { estadoGrupoBadge, semaforoCobroGrupo } from "@/lib/admin/grupos-ui";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import { fmtDateTime } from "@/lib/datetime";
import type { GrupoDetalle } from "@/types/grupos";
import { GrupoAvionesTable } from "./grupo-aviones-table";
import { GrupoAvisos } from "./grupo-avisos";
import { GrupoCobrosCard } from "./grupo-cobros-card";
import { GrupoHeaderActions } from "./grupo-header-actions";
import { GrupoOperacionCard } from "./grupo-operacion-card";

/** Por qué NO se puede revisar (null = se puede). Mismos textos de siempre. */
function razonNoRevisable(g: GrupoDetalle, puedeEditar: boolean): string | null {
  if (!puedeEditar) return "Tu rol no puede revisar grupos.";
  if (g.estado === "CANCELADO") {
    return "Grupo cancelado: no se edita. Si el viaje se retoma, crea un grupo nuevo.";
  }
  if (g.estado === "COMPLETADO") {
    return "Grupo completado: todos los aviones ya volaron. Los ajustes de dinero se hacen por vuelo desde su cotización.";
  }
  return null;
}

/**
 * Página ÚNICA del grupo (pedido del cliente, 5-sep-2026): el mismo
 * formato del wizard, en LECTURA, con «Revisar» editando AHÍ MISMO (sin
 * cambiar de página ni de acomodo). Todo lo que tenía el detalle sigue en
 * su sitio: avisos/problemas siempre visibles, tabla de aviones con sus
 * menús (dentro de la sección «Aviones del grupo»), cobros del grupo,
 * operación, PDF, confirmar, cambiar fecha y cancelar en la cabecera.
 *
 * `?revisar=1` abre directo en edición (links viejos a /editar, alertas).
 * Los candados no cambian: cancelado/completado no se revisa (botón
 * deshabilitado con la razón), hijos congelados se aplican «solo a los
 * editables». El dinero SIEMPRE viene del API: aquí solo se pinta.
 */
export function GrupoWorkspace({
  grupo,
  puedeEditar,
  puedeCobrar,
  puedeEliminarCobro,
  tcOficial,
  tcOficialFecha,
  aircraft,
  routes,
  airports,
  pilots,
  tcSugerido,
  revisarInicial,
}: {
  grupo: GrupoDetalle;
  puedeEditar: boolean;
  puedeCobrar: boolean;
  puedeEliminarCobro: boolean;
  tcOficial: number | null;
  tcOficialFecha: string | null;
  /** TODA la flota (con `activa`): el form muestra la matrícula aunque esté de baja. */
  aircraft: AeronaveOption[];
  routes: RutaOption[];
  airports: AeropuertoOption[];
  pilots: PilotoOption[];
  tcSugerido: number | null;
  /** `?revisar=1`: abrir directo en edición (si se puede). */
  revisarInicial: boolean;
}) {
  const router = useRouter();

  // El grupo "vivo": el del server, o el que devolvió la última revisión
  // (respuesta completa del API) hasta que el refresh traiga el definitivo.
  const [grupoVivo, setGrupoVivo] = useState(grupo);
  const [grupoPrevio, setGrupoPrevio] = useState(grupo);
  if (grupo !== grupoPrevio) {
    setGrupoPrevio(grupo);
    setGrupoVivo(grupo);
  }
  const g = grupoVivo;

  const razonBloqueo = razonNoRevisable(g, puedeEditar);
  const canRevise = razonBloqueo == null;
  const [editando, setEditando] = useState(() => revisarInicial && canRevise);

  // Llegó con ?revisar=1 pero no se puede: se explica una sola vez y queda en lectura.
  const avisado = useRef(false);
  useEffect(() => {
    if (avisado.current || !revisarInicial || canRevise) return;
    avisado.current = true;
    toast.error(razonBloqueo ?? "No se puede revisar este grupo");
  }, [revisarInicial, canRevise, razonBloqueo]);

  /** Quita `?revisar=1` de la URL (un reload ya no reabre la edición). */
  const limpiarUrl = () => {
    if (!revisarInicial) return;
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // Sin history API (SSR/tests): no pasa nada.
    }
  };

  const onRevisar = () => {
    if (!canRevise) {
      toast.error(razonBloqueo ?? "No se puede revisar este grupo");
      return;
    }
    setEditando(true);
  };
  const onCancelar = () => {
    setEditando(false);
    limpiarUrl();
  };
  const onGuardado = (data: GrupoDetalle) => {
    setGrupoVivo(data);
    setEditando(false);
    limpiarUrl();
    router.refresh();
  };

  const estadoBadge = estadoGrupoBadge(g.estado);
  const ruta = puntosRuta(
    (g.escalas_plantilla ?? []).map((t) => ({ origen: t.origen_iata, destino: t.destino_iata })),
  );
  const vivos = g.aviones.filter((a) => !a.cancelado);
  const semaforo = semaforoCobroGrupo(g);
  const total = g.consolidado?.total_usd ?? 0;
  const cobro: CobroBarra = {
    semaforo,
    cobradoUsd: g.cobrado_usd ?? 0,
    saldoUsd: g.saldo_usd ?? 0,
    saldoPendiente: pendienteCobro(total, g.cobrado_usd ?? 0) > 0,
  };
  // Misma regla del formulario: congelados por dinero (API) + los que ya
  // salieron (COMPLETADO / EN_VUELO), que tampoco se editan desde el grupo.
  const congelados = vivos
    .map((a) => ({ folio: a.folio, motivo: bloqueoDeHijo(a) }))
    .filter((a): a is { folio: number; motivo: NonNullable<ReturnType<typeof bloqueoDeHijo>> } => a.motivo != null);

  // Tabla de aviones (con menús quitar/reemplazar) dentro de la sección
  // «Aviones del grupo» del formulario en lectura: mismo lugar que el editor.
  const avionesTabla = (
    <GrupoAvionesTable
      grupo={g}
      aircraft={aircraft
        .filter((a) => a.activa)
        .map((a) => ({ id: a.id, matricula: a.matricula, modelo: a.modelo, asientos: a.asientos ?? null }))}
      pilots={pilots.map((p) => ({ id: p.id, nombre: p.nombre }))}
      puedeEditar={puedeEditar}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes/grupo">Grupos</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Grupo <span className="font-mono">{g.folio_texto}</span>
              </h1>
              <Badge variant={estadoBadge.variant} className={estadoBadge.className} title={estadoBadge.title}>
                {estadoBadge.label}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                v{g.version}
              </Badge>
              {g.cliente?.es_interno && (
                <Badge variant="outline" className="text-xs" title="Cliente interno: cotiza $0 a propósito">
                  Interno
                </Badge>
              )}
              {editando && (
                <Badge
                  variant="outline"
                  className="border-brand-500/50 bg-brand-500/10 text-xs text-brand-600 dark:text-brand-400"
                  title="Estás editando el grupo aquí mismo; guarda o cancela en la barra del total."
                >
                  Editando · v{g.version + 1}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-base font-medium">{g.nombre}</p>
            <p className="text-sm text-muted-foreground">
              {g.cliente?.nombre ?? g.cliente_id} · {ruta.join(" → ") || "sin ruta"} ·{" "}
              {g.pasajeros_total} {g.pasajeros_total === 1 ? "pasajero" : "pasajeros"} ·{" "}
              {vivos.length} {vivos.length === 1 ? "avión" : "aviones"} ·{" "}
              {fmtDateTime(g.fecha_vuelo)}
              {g.fecha_fin && g.fecha_fin !== g.fecha_vuelo ? ` → ${fmtDateTime(g.fecha_fin)}` : ""}
            </p>
          </div>
          <GrupoHeaderActions
            grupo={g}
            puedeEditar={puedeEditar}
            onRevisar={onRevisar}
            editando={editando}
          />
        </div>
      </div>

      {/* Avisos/problemas del API: SIEMPRE visibles. */}
      <GrupoAvisos grupo={g} />

      {g.cancelado_at && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Grupo cancelado el {fmtDateTime(g.cancelado_at)}
          {g.cancelado_motivo ? ` — ${g.cancelado_motivo}` : ""}. Sus vuelos quedaron cancelados;
          cobros y gastos ya registrados se conservan.
        </div>
      )}

      {editando && congelados.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
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

      {/* El formato completo, a lo ancho: lectura o edición en el lugar. */}
      <GrupoForm
        mode="revise"
        grupo={g}
        aircraft={aircraft}
        routes={routes}
        airports={airports}
        pilots={pilots}
        tcSugerido={tcSugerido}
        lectura={!editando}
        onRevisar={puedeEditar ? onRevisar : undefined}
        revisarBloqueado={puedeEditar ? razonBloqueo : undefined}
        onCancelar={onCancelar}
        onGuardado={onGuardado}
        cobro={cobro}
        avionesLectura={avionesTabla}
      />

      {/* Sobres de cobro del grupo (Fase 2): un pago → N partes por avión. */}
      <GrupoCobrosCard
        grupo={g}
        semaforo={semaforo}
        puedeCobrar={puedeCobrar}
        puedeEliminar={puedeEliminarCobro}
        tcOficial={tcOficial}
        tcOficialFecha={tcOficialFecha}
      />

      <GrupoOperacionCard grupo={g} />
    </div>
  );
}
