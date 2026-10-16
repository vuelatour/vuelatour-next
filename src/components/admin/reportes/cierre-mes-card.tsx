import { InformationCircleIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { getCierres } from "@/lib/api/cierres-server";
import {
  AYUDA_CIERRE_MES,
  badgeEstadoCierre,
  mesCierreDe,
  mesDeVistaCierre,
  puedeCerrarMes,
  puedeReabrirMes,
  textoCargaCierres,
  textoElegirMesCompleto,
  textoNoCerrableDeMes,
  tituloEstadoCierre,
} from "@/lib/admin/cierre-mes";
import type { InicioOficial } from "@/lib/admin/inicio-oficial";
import { ChipEstadoCierre } from "@/components/admin/chip-cierre";
import { CierreMesAcciones } from "./cierre-mes-acciones";

/**
 * «Cierre del mes» formal (16-oct-2026, API 0.0.88) dentro de la card
 * «Cierre y reparto del periodo» de `/admin/reportes`. Lee `GET /v1/cierres`
 * (barato: solo estado y orden) y pinta, para el MES del periodo elegido:
 * el estado («Abierto» / «Cerrado el 16-oct-2026 por Ale» / «Reabierto…» /
 * «En curso…»), «Cerrar <mes>» (ADMIN y FACTURACION) y «Reabrir mes» (solo
 * ADMIN). La previa (lectura PESADA) se pide al abrir el diálogo.
 *
 * Skew: API 0.0.87 (404) o sin la migración ⇒ una línea gris que lo dice y
 * NADA más cambia (pre-cierre y descargas siguen). Sin permiso ⇒ nada.
 * Jamás se pinta «Abierto» cuando no se pudo leer.
 */
export async function CierreMesCard({
  desde,
  hasta,
  hoy,
  inicio = null,
  rol = null,
}: {
  desde: string;
  hasta: string;
  hoy: string;
  inicio?: InicioOficial;
  rol?: string | null;
}) {
  const carga = await getCierres();
  if (carga.estado === "sin-permiso") return null;
  if (carga.estado !== "ok") {
    return <NotaCierre texto={textoCargaCierres(carga.estado) ?? ""} />;
  }

  const vista = mesDeVistaCierre(desde, hasta, hoy);
  if (!vista) {
    return (
      <Marco>
        <p className="text-sm">{textoElegirMesCompleto(hoy, inicio)}</p>
        <p className="text-xs text-muted-foreground">{AYUDA_CIERRE_MES}</p>
      </Marco>
    );
  }

  const m = mesCierreDe(carga.datos, vista.mes);
  // Un mes fuera de la lista del API (antes del inicio oficial) no se cierra.
  if (!m) {
    return <NotaCierre texto={textoElegirMesCompleto(hoy, inicio)} />;
  }
  const badge = badgeEstadoCierre(m, vista.mes, vista.enCurso);
  const cerrado = m.estado === "CERRADO";

  return (
    <Marco>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{tituloEstadoCierre(vista.mes)}</p>
        <ChipEstadoCierre badge={badge} />
      </div>
      {vista.enCurso && <p className="text-xs text-muted-foreground">{textoElegirMesCompleto(hoy, inicio)}</p>}
      <p className="text-xs text-muted-foreground">{AYUDA_CIERRE_MES}</p>
      <CierreMesAcciones
        mes={vista.mes}
        cerrado={cerrado}
        ofreceCerrar={!cerrado && puedeCerrarMes(rol)}
        ofreceReabrir={cerrado && puedeReabrirMes(rol)}
        motivoNoCerrable={textoNoCerrableDeMes(m, vista.mes, vista.enCurso)}
        nDiferidos={m.totales?.vuelos_diferidos ?? null}
      />
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3" data-cierre-mes>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <LockClosedIcon className="h-3.5 w-3.5" aria-hidden />
        Cierre formal del mes
      </p>
      {children}
    </div>
  );
}

function NotaCierre({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-cierre-mes-nota>
      <InformationCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

/** Mientras llega `GET /v1/cierres` (Suspense de la página). */
export function CierreMesCardCargando() {
  return (
    <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" aria-hidden />
  );
}
