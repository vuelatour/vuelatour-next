"use client";

import {
  badgeEstadoAvion,
  puedeCerrarAvion,
  puedeReabrirAvion,
  textoNoCerrableDeAvion,
  ETIQUETA_CONFIRMAR_REABRIR,
} from "@/lib/admin/cierre-mes";
import type { MesCierreAvion } from "@/types/cierres";
import { ChipEstadoCierre } from "@/components/admin/chip-cierre";
import { CierreMesAcciones } from "./cierre-mes-acciones";

/**
 * CIERRE POR AVIÓN (23-oct-2026, API 0.0.104, invariante 105): el chip del
 * estado del AVIÓN y, según el rol, «Cerrar <mes>» (ADMIN y FACTURACION) o
 * «Reabrir» (ADMIN) en el tile de «Balance por avión». Hijo CLIENTE del
 * picker (que sigue server-safe): recibe la fila del avión del mes
 * (`meses[].aviones[]` de `GET /v1/cierres`) ya normalizada.
 *
 * - Sin fila (`avion = null`: el API no lista ese avión en el mes, p. ej. un
 *   inactivo sin cierre) ⇒ nada.
 * - «Este mes» (`enCurso`) ⇒ solo el chip «En curso (se cierra a partir del
 *   1-nov)», sin botones.
 * - ANALISTA ⇒ solo el chip.
 * - El botón deshabilitado dice por qué (`textoNoCerrableDeAvion`: «N621TX:
 *   Para cerrar octubre 2026 primero cierra septiembre 2026.»).
 */
export function CierreAvionAcciones({
  mes,
  enCurso,
  rol,
  avion,
  aeronaveId,
  matricula,
}: {
  mes: string;
  enCurso: boolean;
  rol: string | null;
  avion: MesCierreAvion | null;
  aeronaveId: string;
  matricula: string;
}) {
  if (!avion) return null;
  const badge = badgeEstadoAvion(avion, mes, enCurso);
  const ofreceCerrar = !enCurso && puedeCerrarAvion(avion, rol);
  const ofreceReabrir = !enCurso && puedeReabrirAvion(avion, rol);
  return (
    <div className="flex flex-wrap items-center gap-2" data-cierre-avion={matricula}>
      <ChipEstadoCierre badge={badge} />
      <CierreMesAcciones
        mes={mes}
        ofreceCerrar={ofreceCerrar}
        ofreceReabrir={ofreceReabrir}
        motivoNoCerrable={ofreceCerrar ? textoNoCerrableDeAvion(avion, mes, enCurso) : null}
        nDiferidos={avion.totales?.vuelos_diferidos ?? null}
        alcance={{ aeronaveId, matricula }}
        etiquetaReabrir={ETIQUETA_CONFIRMAR_REABRIR}
      />
    </div>
  );
}
