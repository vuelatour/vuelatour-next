import { Badge } from "@/components/ui/badge";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { ChipEstadoCierre } from "@/components/admin/chip-cierre";
import { descargaVistaBalance, puedeAbrirBalances } from "@/lib/admin/balance-vista";
import { tituloColorAvion } from "@/lib/admin/calendario-semaforo";
import {
  badgeEstadoCierre,
  estadoAvionDeMes,
  type MesDeVista,
  type ModoCierre,
} from "@/lib/admin/cierre-mes";
import {
  ARIA_LISTA_AVIONES,
  ETIQUETA_EXCEL_AVION,
  MARCA_AVION_INACTIVO,
  TEXTO_AVIONES_NO_CARGARON,
  TEXTO_SIN_AVIONES,
  TITULO_AVION_INACTIVO,
  ariaVerEnPantalla,
  tituloExcelAvion,
  type AvionBalanceItem,
} from "@/lib/admin/reportes-ui";
import type { MesCierre } from "@/types/cierres";
import { CierreAvionAcciones } from "./cierre-avion-acciones";
import { VerEnPantallaLink } from "./ver-en-pantalla-link";

/** El nombre de siempre, por compatibilidad: lo que cada tile necesita. */
export type AircraftPickItem = AvionBalanceItem;

/**
 * «Balance por avión» de `/admin/reportes` (12-oct-2026): UN tile por avión
 * con «Ver en pantalla» y «Excel» a un clic. Ya no es un selector con estado:
 * la grilla ES el selector (flota de 7; si algún día pasan de ~12, entonces
 * un filtro por matrícula). Server-safe: sin hooks ni estado, así que al
 * volver de la vista (`BackLink` = `router.back()`) todo sigue igual.
 *
 * - El orden lo decide la PÁGINA (`ordenarAvionesBalance`: activos A–Z,
 *   inactivos al final); aquí se pinta tal cual llega.
 * - Un avión INACTIVO se lista igual (su libro histórico sirve) con el Badge
 *   «Inactiva» como única marca: sin `opacity`, sus botones a plena vista.
 * - Sin marca «En taller» a propósito: es una pantalla de CONSULTA, no un
 *   selector para operar (el mantenimiento no cambia el libro).
 * - La descarga es `descargaVistaBalance` (la MISMA ruta, archivo y query que
 *   la vista en pantalla: `/v1/aircraft/<id>/balance.xlsx`,
 *   `balance-<matricula>-<desde>-<hasta>.xlsx`) con `ExcelExportButton`: el
 *   único toast de descarga de balances («No se pudo exportar»).
 * - La `<ul>` lleva `role="list"`: el preflight de Tailwind quita las viñetas
 *   y Safari/VoiceOver dejan de anunciar la lista («Aviones, lista, 7
 *   elementos») sin el rol explícito.
 * - Columnas: 2 desde `sm`, 3 desde `xl`, 4 desde `2xl`. Con el sidebar de
 *   256 px, 3 columnas en `lg` o 4 en `xl` dejan ~200 px útiles por tile y
 *   parten «Ver en pantalla» + «Excel» (~223 px) en dos renglones.
 * - `disponibles=false` = el catálogo NO cargó y se DICE; `[]` con
 *   `disponibles` = de verdad no hay aviones. Un 502 jamás se pinta como «sin aviones».
 *
 * CIERRE POR AVIÓN (23-oct-2026, API 0.0.104, invariante 105; pedido del
 * cliente: «un botón de cierre de mes individual en cada avión»): con
 * `periodo` (el mes del selector de arriba, `mesDeVistaCierre`) y `mesCierre`
 * (la fila del mes de `GET /v1/cierres`), cada tile lleva el chip del estado
 * de ESE avión y, para ADMIN/FACTURACION, «Cerrar <mes>» (o «Reabrir» si
 * está cerrado y el rol puede) vía `CierreAvionAcciones` (cliente). En modo
 * `GLOBAL` (API previo) el chip es el del mes global y no hay botones.
 * `rol` decide además si se ofrecen los enlaces del libro
 * (`puedeAbrirBalances`: ADMIN y ANALISTA); FACTURACION ve el tile con
 * matrícula, modelo, chip y botón, sin «Ver en pantalla» ni «Excel».
 */
export function AircraftBalancePicker({
  aircraft,
  disponibles = true,
  desde,
  hasta,
  rol = null,
  mesCierre = null,
  periodo = null,
  modoCierre = "GLOBAL",
}: {
  aircraft: AircraftPickItem[];
  /** false = el catálogo NO cargó (se dice); true con [] = de verdad no hay aviones. */
  disponibles?: boolean;
  desde: string;
  hasta: string;
  /** Rol de quien mira: enlaces del libro solo a quien los abre; botones de cierre según `cierre-mes.ts`. */
  rol?: string | null;
  /** La fila del mes de `GET /v1/cierres` (null = no se leyó o el mes no está en la lista). */
  mesCierre?: MesCierre | null;
  /** El mes del periodo elegido (null = el rango no es un mes: sin chips ni botones). */
  periodo?: MesDeVista | null;
  /** `POR_AVION` solo con `por_avion: true` del API; `GLOBAL` = chip del mes global, sin botones. */
  modoCierre?: ModoCierre;
}) {
  if (!disponibles) {
    return (
      <p role="status" data-aviones="no-cargaron" className="text-sm text-muted-foreground">
        {TEXTO_AVIONES_NO_CARGARON}
      </p>
    );
  }
  if (aircraft.length === 0) {
    return (
      <p data-aviones="vacio" className="text-sm text-muted-foreground">
        {TEXTO_SIN_AVIONES}
      </p>
    );
  }
  const abreLibros = puedeAbrirBalances(rol);
  // Modo GLOBAL: el mismo chip del mes para todos (solo si el mes está en la lista).
  const badgeGlobal =
    periodo && modoCierre === "GLOBAL" && mesCierre ? badgeEstadoCierre(mesCierre, periodo.mes, periodo.enCurso) : null;
  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label={ARIA_LISTA_AVIONES}>
      {aircraft.map((avion) => {
        // MISMA ruta, archivo y query que la vista en pantalla (fuente única
        // congelada en balance-vista.test.ts).
        const descarga = abreLibros
          ? descargaVistaBalance({ tipo: "avion", avionId: avion.id }, desde, hasta, avion.matricula)
          : null;
        const filaAvion = periodo && modoCierre === "POR_AVION" ? estadoAvionDeMes(mesCierre, avion.id) : null;
        return (
          <li
            key={avion.id}
            data-avion={avion.matricula}
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {avion.color && (
                  <span
                    aria-hidden
                    title={tituloColorAvion(avion.color)}
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: avion.color }}
                  />
                )}
                <span className="truncate font-mono">{avion.matricula}</span>
                {!avion.activa && (
                  <>
                    <Badge variant="secondary" title={TITULO_AVION_INACTIVO}>
                      {MARCA_AVION_INACTIVO}
                    </Badge>
                    {/* Lo que explica el `title` (solo ratón), también para teclado, táctil y lector. */}
                    <span className="sr-only">{TITULO_AVION_INACTIVO}</span>
                  </>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{avion.modelo}</p>
            </div>
            {abreLibros && (
              <div className="flex flex-wrap gap-2">
                {/* «Ver en pantalla» PRIMERO: la posición es la jerarquía (prioridad a la vista, 12-oct-2026). */}
                <VerEnPantallaLink
                  destino={{ tipo: "avion", avionId: avion.id }}
                  desde={desde}
                  hasta={hasta}
                  aria-label={ariaVerEnPantalla(avion.matricula)}
                />
                {descarga && (
                  <ExcelExportButton
                    path={descarga.path}
                    filename={descarga.filename}
                    query={descarga.query}
                    label={ETIQUETA_EXCEL_AVION}
                    title={tituloExcelAvion(avion.matricula)}
                    aria-label={tituloExcelAvion(avion.matricula)}
                  />
                )}
              </div>
            )}
            {/* CIERRE POR AVIÓN: chip del avión + «Cerrar <mes>» / «Reabrir»;
                en modo GLOBAL, solo el chip del mes. */}
            {periodo && modoCierre === "POR_AVION" && (
              <CierreAvionAcciones
                mes={periodo.mes}
                enCurso={periodo.enCurso}
                rol={rol}
                avion={filaAvion}
                aeronaveId={avion.id}
                matricula={avion.matricula}
              />
            )}
            {badgeGlobal && (
              <div className="flex flex-wrap items-center gap-2" data-cierre-avion={avion.matricula}>
                <ChipEstadoCierre badge={badgeGlobal} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
