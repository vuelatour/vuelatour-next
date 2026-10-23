import { InformationCircleIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import type { CargaCierres } from "@/lib/api/cierres-server";
import {
  AYUDA_CIERRE_AVION,
  AYUDA_CIERRE_MES,
  avionesCerradosDeMes,
  etiquetaBotonCerrarFlota,
  etiquetaBotonReabrirFlota,
  mesCierreDe,
  mesDeVistaCierre,
  mesEnMinuscula,
  modoCierreDelApi,
  nAvionesAbiertos,
  puedeCerrarMes,
  puedeReabrirMes,
  resumenFlota,
  textoCargaCierres,
  textoElegirMesCompleto,
  textoNoCerrableDeMes,
} from "@/lib/admin/cierre-mes";
import type { InicioOficial } from "@/lib/admin/inicio-oficial";
import type { CierresRespuesta } from "@/types/cierres";
import { ChipEstadoCierre } from "@/components/admin/chip-cierre";
import { CierreMesAcciones } from "./cierre-mes-acciones";

/**
 * El cierre de la FLOTA dentro de la card «Balance mensual» de
 * `/admin/reportes` (CIERRE POR AVIÓN, 23-oct-2026, API 0.0.104, invariante
 * 105; sustituye a la burbuja «Cierre formal del mes» que el cliente pidió
 * quitar). Server-safe (sin hooks): pinta, para el MES del periodo elegido,
 * el rótulo «Cierre de septiembre 2026», el chip de la flota («Abierto · 0 de
 * 7», «Parcial · 3 de 7», «Cerrado», «Reabierto», «En curso…»), la ayuda y
 * los botones:
 *  - «Cerrar septiembre 2026 (los N aviones abiertos)» (ADMIN y FACTURACION):
 *    cierra en orden todos los activos abiertos con una sola previa;
 *  - «Reabrir mes» / «Reabrir los 3 aviones cerrados» (solo ADMIN).
 * FALLBACK (`por_avion` ≠ true: API previo o sin la migración por avión): el
 * flujo global de siempre, «Cerrar septiembre 2026» / «Reabrir mes», y los
 * tiles no llevan botones.
 *
 * «Este mes» ⇒ chip «En curso» y la guía a «Mes pasado», sin botones. Un
 * rango que no es un mes ⇒ la guía. Skew (API 0.0.87 / sin migración /
 * error) ⇒ una línea gris que lo dice; sin permiso ⇒ nada. Jamás se pinta
 * «Abierto» cuando no se pudo leer.
 */
export function CierreFlotaBloque({
  carga,
  desde,
  hasta,
  hoy,
  inicio = null,
  rol = null,
}: {
  carga: CargaCierres<CierresRespuesta>;
  desde: string;
  hasta: string;
  hoy: string;
  inicio?: InicioOficial;
  rol?: string | null;
}) {
  if (carga.estado === "sin-permiso") return null;
  if (carga.estado !== "ok") return <NotaCierre texto={textoCargaCierres(carga.estado) ?? ""} />;

  const modo = modoCierreDelApi(carga.datos);
  const ayuda = modo === "POR_AVION" ? AYUDA_CIERRE_AVION : AYUDA_CIERRE_MES;
  const vista = mesDeVistaCierre(desde, hasta, hoy);
  if (!vista) {
    return (
      <Marco>
        <p className="text-sm">{textoElegirMesCompleto(hoy, inicio)}</p>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </Marco>
    );
  }
  const m = mesCierreDe(carga.datos, vista.mes);
  // Un mes fuera de la lista del API (antes del inicio oficial) no se cierra.
  if (!m) return <NotaCierre texto={textoElegirMesCompleto(hoy, inicio)} />;

  const badge = resumenFlota(m, vista.mes, vista.enCurso, modo);
  const cerrado = m.estado === "CERRADO";
  let acciones: React.ReactNode = null;
  if (!vista.enCurso) {
    if (modo === "POR_AVION") {
      const nAbiertos = nAvionesAbiertos(m);
      const nCerrados = m.aviones ? avionesCerradosDeMes(m).length : (m.aviones_cerrados ?? null);
      const ofreceCerrar = !cerrado && (nAbiertos === null || nAbiertos > 0) && puedeCerrarMes(rol);
      const ofreceReabrir = (cerrado || (nCerrados ?? 0) > 0) && puedeReabrirMes(rol);
      acciones = (
        <CierreMesAcciones
          mes={vista.mes}
          ofreceCerrar={ofreceCerrar}
          ofreceReabrir={ofreceReabrir}
          motivoNoCerrable={ofreceCerrar ? textoNoCerrableDeMes(m, vista.mes, vista.enCurso) : null}
          nDiferidos={cerrado ? (m.totales?.vuelos_diferidos ?? null) : null}
          alcance={null}
          etiquetaCerrar={etiquetaBotonCerrarFlota(vista.mes, nAbiertos)}
          etiquetaReabrir={etiquetaBotonReabrirFlota(m.estado, nCerrados)}
        />
      );
    } else {
      acciones = (
        <CierreMesAcciones
          mes={vista.mes}
          ofreceCerrar={!cerrado && puedeCerrarMes(rol)}
          ofreceReabrir={cerrado && puedeReabrirMes(rol)}
          motivoNoCerrable={textoNoCerrableDeMes(m, vista.mes, vista.enCurso)}
          nDiferidos={m.totales?.vuelos_diferidos ?? null}
          alcance={null}
        />
      );
    }
  }

  return (
    <Marco modo={modo}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{`Cierre de ${mesEnMinuscula(vista.mes)}`}</p>
        <ChipEstadoCierre badge={badge} />
      </div>
      {vista.enCurso && <p className="text-xs text-muted-foreground">{textoElegirMesCompleto(hoy, inicio)}</p>}
      <p className="text-xs text-muted-foreground">{ayuda}</p>
      {acciones}
    </Marco>
  );
}

function Marco({ children, modo }: { children: React.ReactNode; modo?: "POR_AVION" | "GLOBAL" }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3" data-cierre-flota={modo ?? ""}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <LockClosedIcon className="h-3.5 w-3.5" aria-hidden />
        Cierre del mes
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
