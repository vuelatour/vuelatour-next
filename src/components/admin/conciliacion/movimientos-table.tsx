"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MovimientoActions } from "@/components/admin/conciliacion/movimiento-actions";
import { FacturaConceptoChip } from "@/components/admin/conciliacion/factura-concepto-chip";
import { EnlacesBalanceGasto } from "@/components/admin/conciliacion/enlaces-balance-gasto";
import { BarraSeleccionMovimientos } from "@/components/admin/conciliacion/barra-seleccion-movimientos";
import { VincularGastoDialog } from "@/components/admin/conciliacion/vincular-gasto-dialog";
import { enlacesBalanceDeGasto } from "@/lib/admin/conciliacion-balance";
import { textoBusquedaFacturaConcepto } from "@/lib/admin/conciliacion-factura-concepto";
import { marcaLigaCruzada, sufijoMonedaLigada } from "@/lib/admin/conciliacion-tc";
import {
  CLASE_FILA_ENFOCADA,
  CLASE_LINEA_ENFOCADA,
  SUFIJO_GASTO_ENFOCADO,
  SYNC_ID_MOVIMIENTOS,
} from "@/lib/admin/conciliacion-vista";
import { cn } from "@/lib/utils";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  motivoPendienteDe,
  reglaAutomaticaDe,
  tonoMotivo,
} from "@/lib/admin/conciliacion-auto";
import { textoFaltanteGasto } from "@/lib/admin/conciliacion-parcial";
import {
  etiquetaFolioComprobante,
  tituloFolioComprobante,
} from "@/lib/admin/conciliacion-folio";
import {
  TITULO_VER_GASTO_CONCILIADO,
  TOOLTIP_LOTE_SIN_DETALLE,
  gastoUnicoDe,
  numeroGastosDe,
  resumenLoteFila,
  textoBusquedaGastos,
  textoLoteSinDetalle,
  tieneGastoLigado,
} from "@/lib/admin/conciliacion-lote";
import { badgeVinculoNoBancario, type BadgeVinculoNoBancario } from "@/lib/admin/conciliacion-no-bancario";
import {
  TITULO_VER_VUELO_COBRO,
  TOOLTIP_LOTE_COBROS_SIN_DETALLE,
  esAbonoConLote,
  numeroCobrosDe,
  resumenLoteCobrosFila,
  textoBusquedaCobros,
  textoLoteCobrosSinDetalle,
} from "@/lib/admin/conciliacion-cobros-lote";
import {
  ETIQUETA_REVERSO,
  contraparteReverso,
  esConciliadoPorReverso,
  pistaPendienteDevolucion,
  textoParejaReverso,
  tituloParejaReverso,
} from "@/lib/admin/conciliacion-reverso";
import {
  BOTON_QUITAR_SELECCION,
  ENCABEZADO_SELECCION,
  MIN_CARGOS_A_GASTO,
  alternarSeleccion,
  esSeleccionable,
  etiquetaCasillaMovimiento,
  monedaDeMovimiento,
  resumenSeleccion,
  seleccionVigente,
  seleccionarTodas,
  textoSeleccionarTodas,
  type VistaSeleccion,
} from "@/lib/admin/conciliacion-seleccion";
import {
  ETIQUETA_BADGE_OMITIDO,
  apiConOmision,
  esOmitido,
  textoBusquedaOmision,
  textoMotivoFila,
  tituloOmision,
} from "@/lib/admin/conciliacion-omision";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { etiquetaCategoriaIngreso, etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { fmtMonto } from "@/lib/format";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { MovimientoBancario } from "@/types/conciliacion";
import type { AbonosConciliacion } from "@/lib/admin/conciliacion-abonos";
import type { CatalogosGastoDesdeCargo } from "@/lib/admin/gasto-desde-cargo";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

/**
 * Los diálogos de la selección (14-oct-2026, API 0.0.77): `next/dynamic` sin
 * SSR y montados SOLO al abrirse, con una COPIA CONGELADA de la selección (un
 * refresh que la pode no los desmonta ni les cambia la lista).
 */
const OmitirMovimientosDialog = dynamic(
  () => import("@/components/admin/conciliacion/omitir-movimientos-dialog").then((m) => m.OmitirMovimientosDialog),
  { ssr: false },
);
const QuitarOmisionDialog = dynamic(
  () => import("@/components/admin/conciliacion/quitar-omision-dialog").then((m) => m.QuitarOmisionDialog),
  { ssr: false },
);
/** «Vincular a un gasto…» con 2..50 cargos (invariante 76 del API); con UNO, el «Vincular gasto» de siempre. */
const VincularCargosGastoDialog = dynamic(
  () =>
    import("@/components/admin/conciliacion/vincular-cargos-gasto-dialog").then((m) => m.VincularCargosGastoDialog),
  { ssr: false },
);

/** La selección de la tabla (ADITIVA): dónde se selecciona y la moneda de cada cuenta. */
export interface SeleccionMovimientos {
  vista: VistaSeleccion;
  /** Moneda por cuenta (los totales de la barra nunca suman monedas). */
  monedaPorCuenta: Record<string, string>;
}

type DialogoSeleccion = { tipo: "omitir" | "deshacer" | "vincular"; movimientos: MovimientoBancario[] };

const SIN_SELECCION: ReadonlySet<string> = new Set();

/**
 * «Efectivo» junto a un gasto ligado que NO pasó por el banco (6-oct-2026,
 * API 0.0.63): se vinculó con una justificación; el tooltip la trae de las
 * notas del cargo. Sin `medio_pago` (API previo) no se monta: el marcado
 * queda IDÉNTICO.
 */
function BadgeMedioLigado({ badge }: { badge: BadgeVinculoNoBancario | null }) {
  if (!badge) return null;
  return (
    <Badge
      variant="outline"
      className="ml-1.5 h-4 border-amber-500/40 bg-amber-500/10 px-1 py-0 align-middle text-[10px] text-amber-700 dark:text-amber-300"
      title={badge.titulo}
    >
      {badge.texto}
    </Badge>
  );
}

interface MovimientosTableProps {
  movimientos: MovimientoBancario[];
  /** Opciones del diálogo «Vincular gasto» (la página las precarga; los
   *  gastos con pago parcial traen «faltan $X de $Y» en la descripción). */
  gastos: SearchableSelectOption[];
  /** Alias por cuenta bancaria: la bandeja mezcla cuentas y el operador
   *  necesita ver de cuál es cada línea (columna «Cuenta»). */
  cuentas?: Record<string, string>;
  /** Menú de Ingresos para los ABONOS sin identificar (12-oct-2026):
   *  catálogos y cuentas; sin él (catálogos que no cargaron) el menú de
   *  siempre. */
  abonos?: AbonosConciliacion | null;
  /** Catálogos del alta de gasto para «¿No está el gasto? Créalo» del
   *  diálogo «Vincular gasto» (12-oct-2026). Sin ellos no se ofrece crear. */
  catalogosGasto?: CatalogosGastoDesdeCargo | null;
  /** «Conciliación al revés» (13-oct-2026, ADITIVOS): el movimiento que se
   *  abrió desde Gastos (`?mov=`, ya validado; la página lo pone PRIMERO) va
   *  con el anillo ámbar y se trae a la vista; `gastoResaltado` (`?gasto=`)
   *  marca su línea dentro del lote. Sin ellos, el marcado de siempre. */
  resaltar?: string | null;
  gastoResaltado?: string | null;
  /** La lista llegó al tope de la vista: la búsqueda vacía lo dice. */
  huboCorte?: boolean;
  /** «Ver en balance…» bajo cada gasto ligado (13-oct-2026, punto 5): los
   *  balances son de ADMIN/ANALISTA (`puedeAbrirBalances`); sin la prop se
   *  ofrecen y el candado es el API. */
  abreBalances?: boolean;
  /**
   * SELECCIÓN (14-oct-2026, API 0.0.77, ADITIVA): casillas en las filas
   * seleccionables, «Seleccionar los N…» y la barra fija con «Vincular a un
   * gasto…» / «Omitir…» / «Deshacer la omisión…». Solo en «Todos» /
   * «Pendientes» (vista 'lista') y «Omitidos». Sin la prop —o con un API ≤ 0.0.76, cuyas filas no traen la
   * llave `omision`— el marcado sale IDÉNTICO byte a byte al de antes.
   */
  seleccion?: SeleccionMovimientos | null;
}

export function MovimientosTable({
  movimientos,
  gastos,
  cuentas,
  abonos,
  catalogosGasto,
  resaltar = null,
  gastoResaltado = null,
  huboCorte = false,
  abreBalances = true,
  seleccion = null,
}: MovimientosTableProps) {
  // La fila que se abrió desde Gastos se trae a la vista (mismo patrón que
  // «Por facturar»). El id ya llega validado (uuid).
  useEffect(() => {
    if (!resaltar) return;
    document
      .querySelector(`[data-fila="${CSS.escape(resaltar)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltar]);
  // La columna «Cuenta» solo aparece cuando la vista mezcla varias (con una
  // sola cuenta filtrada sería una columna que repite lo mismo en cada fila).
  const variasCuentas = useMemo(
    () => new Set(movimientos.map((m) => m.cuenta_bancaria_id)).size > 1,
    [movimientos],
  );
  const nombreCuenta = (id: string) => cuentas?.[id] ?? "—";

  // ── SELECCIÓN (14-oct-2026): el Set es local; lo VIGENTE se deriva en
  // render (sin setState en efectos). La página monta la tabla con
  // `key={claveVista}`: cambiar de pestaña, cuenta o fechas la reinicia.
  const vista: VistaSeleccion | null = seleccion?.vista ?? null;
  const monedaPorCuenta = seleccion?.monedaPorCuenta;
  // Con un API ≤ 0.0.76 (sin la llave `omision`) no se ofrece nada de lo nuevo.
  const conSeleccion = vista !== null && apiConOmision(movimientos);
  const [sel, setSel] = useState<ReadonlySet<string>>(SIN_SELECCION);
  const [filtradas, setFiltradas] = useState<MovimientoBancario[] | null>(null);
  const [dialogo, setDialogo] = useState<DialogoSeleccion | null>(null);
  const { vigentes, retirados } = useMemo(
    () =>
      conSeleccion && vista
        ? seleccionVigente(movimientos, sel, vista)
        : { vigentes: [] as MovimientoBancario[], retirados: 0 },
    [conSeleccion, vista, movimientos, sel],
  );
  const idsVigentes = useMemo(() => new Set(vigentes.map((m) => m.id)), [vigentes]);
  // Lo que la búsqueda deja (todas las páginas), con los datos de HOY de cada
  // fila (un refresh con los mismos ids no vuelve a avisar desde DataTable).
  const filasVista = useMemo(() => {
    if (!filtradas) return movimientos;
    const porId = new Map(movimientos.map((m) => [m.id, m]));
    return filtradas.map((f) => porId.get(f.id)).filter((m): m is MovimientoBancario => m != null);
  }, [filtradas, movimientos]);
  const conBusqueda = filtradas !== null && filtradas.length < movimientos.length;

  const alternar = useCallback(
    (id: string) => {
      const r = alternarSeleccion(idsVigentes, id);
      if (r.aviso) toast.info(r.aviso);
      setSel(r.sel);
    },
    [idsVigentes],
  );
  const quitarDeSeleccion = useCallback((ids: string[]) => {
    setSel((prev) => {
      const s = new Set(prev);
      for (const id of ids) s.delete(id);
      return s;
    });
  }, []);
  const limpiarSeleccion = () => setSel(SIN_SELECCION);

  // Columna de las casillas, PRIMERA y aparte de las de siempre (que no
  // dependen de la selección). Casilla NATIVA solo en filas seleccionables;
  // marcada, la CELDA se tiñe (la línea `rowClassName` no se toca).
  const columnaSel = useMemo<DataTableColumn<MovimientoBancario> | null>(() => {
    if (!conSeleccion || !vista) return null;
    return {
      key: "sel",
      header: <span className="sr-only">{ENCABEZADO_SELECCION}</span>,
      headClassName: "w-10",
      cellClassName: "relative w-10",
      noLink: true,
      cell: (m: MovimientoBancario) => {
        if (!esSeleccionable(m, vista)) return null;
        const marcada = idsVigentes.has(m.id);
        return (
          <>
            {marcada && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-brand-50 dark:bg-brand-900/30" />
            )}
            <input
              type="checkbox"
              className="relative h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
              checked={marcada}
              onChange={() => alternar(m.id)}
              aria-label={etiquetaCasillaMovimiento(
                m,
                cuentas?.[m.cuenta_bancaria_id] ?? null,
                vista,
                monedaDeMovimiento(m, monedaPorCuenta),
              )}
            />
          </>
        );
      },
    };
  }, [conSeleccion, vista, idsVigentes, alternar, cuentas, monedaPorCuenta]);

  const columns = useMemo<Array<DataTableColumn<MovimientoBancario>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (m) => fmtDate(m.fecha),
      },
      ...(variasCuentas
        ? [
            {
              key: "cuenta",
              header: "Cuenta",
              cellClassName: "whitespace-nowrap text-muted-foreground text-xs",
              cell: (m: MovimientoBancario) => nombreCuenta(m.cuenta_bancaria_id),
            } as DataTableColumn<MovimientoBancario>,
          ]
        : []),
      {
        key: "descripcion",
        header: "Descripción",
        // Concepto del SPEI (13-oct-2026): el concepto («BANORTE fact vip
        // 7360») va al FINAL del texto y el `truncate` lo cortaba. Dos
        // renglones y el texto completo en el tooltip; debajo, «Factura 7360»
        // cuando el API la leyó (sin el campo, solo la celda de siempre).
        cellClassName: "text-muted-foreground max-w-[320px]",
        cell: (m) => (
          <>
            <span className="line-clamp-2" title={m.descripcion ?? undefined}>
              {m.descripcion ?? "—"}
            </span>
            {m.factura_concepto && (
              <FacturaConceptoChip fc={m.factura_concepto} fecha={m.fecha} tipo={m.tipo} />
            )}
          </>
        ),
      },
      {
        key: "tipo",
        header: "Tipo",
        cell: (m) => (
          <Badge
            variant="outline"
            className={
              m.tipo === "CARGO"
                ? "border-brand-600/50 text-brand-600"
                : "border-emerald-500/50 text-emerald-600"
            }
          >
            {m.tipo === "CARGO" ? "Cargo" : "Abono"}
          </Badge>
        ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums",
        // PASARELA (Paywise): el monto es el NETO depositado; debajo, el
        // bruto que pagó el cliente y la comisión retenida (si el archivo
        // los trajo).
        cell: (m) => {
          const bruto = m.monto_bruto != null ? Number(m.monto_bruto) : null;
          const comision = m.comision_monto != null ? Number(m.comision_monto) : null;
          if (!(bruto != null && bruto > 0) && !(comision != null && comision > 0)) {
            return fmtMoney(m.monto);
          }
          return (
            <span className="block">
              {fmtMoney(m.monto)}
              <span className="block text-[10px] font-normal text-muted-foreground whitespace-nowrap">
                {bruto != null && bruto > 0 ? `bruto ${fmtMoney(String(bruto))}` : null}
                {bruto != null && bruto > 0 && comision != null && comision > 0 ? " · " : null}
                {comision != null && comision > 0 ? `comisión ${fmtMoney(String(comision))}` : null}
              </span>
            </span>
          );
        },
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        cell: (m) => {
          // 1 CARGO ↔ N GASTOS (2-oct-2026): un cargo que paga VARIOS gastos
          // trae `gasto_id`/`gasto` NULL (son espejo solo con UNA parte); la
          // liga se lee con `tieneGastoLigado` y el detalle en `gastos[]`.
          // Esta rama va ANTES que todas: sin ella el lote se pintaba
          // «Pendiente».
          if (m.conciliado && tieneGastoLigado(m) && numeroGastosDe(m) >= 2) {
            // Con `?gasto=` (13-oct-2026) la línea de ese gasto se resalta y,
            // si quedaba en «y N más», se trae a la vista.
            const lote = resumenLoteFila(m, { destacar: gastoResaltado });
            if (!lote) {
              // El API no mandó el detalle (skew de deploy): se dice cuántos
              // sin inventar ligas.
              return (
                <span className="block text-sm text-emerald-600" title={TOOLTIP_LOTE_SIN_DETALLE}>
                  {textoLoteSinDetalle(numeroGastosDe(m))}
                </span>
              );
            }
            return (
              <span className="block text-sm">
                <span className="block text-emerald-600">{lote.titulo}</span>
                {lote.lineas.map((l) => (
                  // «Ver en balance…» de ESE gasto (13-oct-2026, punto 5): HERMANO
                  // del <Link> de la línea, nunca dentro (un <a> en otro <a> es
                  // HTML inválido). Sin `balance` no pinta nada.
                  <Fragment key={l.key}>
                    <Link
                      href={l.href}
                      className={cn(
                        "block text-xs text-emerald-600 hover:underline",
                        l.destacada && CLASE_LINEA_ENFOCADA,
                      )}
                      title={TITULO_VER_GASTO_CONCILIADO}
                    >
                      {l.principal}
                      {l.destacada && <span className="text-[10px] font-normal">{SUFIJO_GASTO_ENFOCADO}</span>}
                      <BadgeMedioLigado badge={l.medio} />
                      <span className="block max-w-[240px] truncate text-[10px] text-muted-foreground">
                        {l.secundaria}
                      </span>
                      {/* Número de factura de ESE gasto (5-oct-2026, API 0.0.57). */}
                      {l.factura && (
                        <span
                          className="block max-w-[240px] truncate text-[10px] font-medium text-muted-foreground"
                          title={l.facturaTitulo ?? undefined}
                        >
                          {l.factura}
                        </span>
                      )}
                    </Link>
                    {abreBalances ? <EnlacesBalanceGasto enlaces={l.balances} /> : null}
                  </Fragment>
                ))}
                {lote.mas && (
                  // Facturas de los gastos que no caben (tooltip).
                  <span
                    className="block text-[10px] text-muted-foreground"
                    title={lote.masTitulo ?? undefined}
                  >
                    {lote.mas}
                  </span>
                )}
                {lote.diferencia && (
                  <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                    {lote.diferencia}
                  </span>
                )}
              </span>
            );
          }
          // 1 ABONO ↔ N COBROS (12-oct-2026): un abono que paga VARIOS cobros
          // trae `cobro_id`/`cobro` NULL; la liga se lee de `cobros_n` y el
          // detalle en `cobros[]`. Antes de las ramas de siempre, o el lote
          // se pintaba «Pendiente».
          if (m.conciliado && esAbonoConLote(m)) {
            const lote = resumenLoteCobrosFila(m);
            if (!lote) {
              return (
                <span className="block text-sm text-emerald-600" title={TOOLTIP_LOTE_COBROS_SIN_DETALLE}>
                  {textoLoteCobrosSinDetalle(numeroCobrosDe(m))}
                </span>
              );
            }
            return (
              <span className="block text-sm">
                <span className="block text-emerald-600">{lote.titulo}</span>
                {lote.lineas.map((l) => (
                  <Link
                    key={l.key}
                    href={l.href}
                    className="block text-xs text-emerald-600 hover:underline"
                    title={TITULO_VER_VUELO_COBRO}
                  >
                    {l.principal}
                    <span className="block max-w-[240px] truncate text-[10px] text-muted-foreground">
                      {l.secundaria}
                    </span>
                  </Link>
                ))}
                {lote.mas && <span className="block text-[10px] text-muted-foreground">{lote.mas}</span>}
                {lote.diferencia && (
                  <span className="block text-[10px] text-amber-600 dark:text-amber-400">{lote.diferencia}</span>
                )}
              </span>
            );
          }
          const gasto = m.conciliado ? gastoUnicoDe(m) : null;
          // Número de la factura con la que se liga el cargo (pedido del
          // cliente, 5-oct-2026): lo resuelve el API (`folio_comprobante`);
          // aquí solo se rotula. Sin él no se pinta nada.
          const factura = etiquetaFolioComprobante(gasto?.folio_comprobante);
          // Compra en dólares pagada con este cargo en pesos (13-oct-2026,
          // API 0.0.75): «$422.86 USD» y su T.C. contra el oficial del día;
          // «⚠ …» ámbar si quedó fuera de lugar. Una fila en pesos (sufijo
          // vacío y sin `tc_cruce`) queda byte a byte como antes.
          const sufijoMoneda = sufijoMonedaLigada(gasto?.moneda);
          const marcaTc = marcaLigaCruzada(m.tc_cruce);
          if (m.conciliado && tieneGastoLigado(m) && !gasto) {
            return (
              <span className="block text-sm text-emerald-600" title={TOOLTIP_LOTE_SIN_DETALLE}>
                {textoLoteSinDetalle(numeroGastosDe(m) || 1)}
              </span>
            );
          }
          return gasto ? (
            // Verificable de un clic: al vuelo del gasto (donde se
            // ve su desglose) o, sin vuelo, a la lista de gastos. Debajo, como
            // HERMANOS del <Link> (13-oct-2026, punto 5), «Ver en balance…»:
            // sin `balance` el fragmento no emite nada y la celda es la de siempre.
            <>
              <Link
                href={
                  gasto.vuelo_id
                    ? `/admin/flights/${gasto.vuelo_id}`
                    : "/admin/expenses"
                }
                className="block text-sm text-emerald-600 hover:underline"
                title="Ver el gasto con el que se concilió"
              >
                {categoriaGastoLabel(gasto.categoria)} · ${fmtMoney(gasto.monto)}
                {sufijoMoneda ? sufijoMoneda : null}
                {gasto.vuelo?.folio != null && (
                  <span className="text-muted-foreground"> · vuelo #{gasto.vuelo.folio}</span>
                )}
                <BadgeMedioLigado badge={badgeVinculoNoBancario(gasto, m.notas)} />
                <span className="block text-[10px] text-muted-foreground">
                  {[
                    gasto.proveedor?.nombre,
                    gasto.fecha_gasto ? fmtDate(gasto.fecha_gasto) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Gasto conciliado"}
                </span>
                {marcaTc && (
                  <span
                    data-tc-cruce={marcaTc.tono}
                    className={
                      marcaTc.tono === "ambar"
                        ? "block text-[11px] font-medium text-amber-700 dark:text-amber-300"
                        : "block text-[11px] text-muted-foreground"
                    }
                    title={marcaTc.titulo}
                  >
                    {marcaTc.texto}
                  </span>
                )}
                {factura && (
                  <span
                    className="block max-w-[240px] truncate text-[10px] font-medium text-muted-foreground"
                    title={tituloFolioComprobante(gasto.folio_comprobante) ?? undefined}
                  >
                    {factura}
                  </span>
                )}
                {/* Pago parcial (14-sep-2026): este cargo es solo una parte del
                    gasto (1 factura pagada en 2 cargos). */}
                {textoFaltanteGasto(gasto) && (
                  <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                    Pago parcial: {textoFaltanteGasto(gasto)}
                  </span>
                )}
              </Link>
              {abreBalances ? <EnlacesBalanceGasto enlaces={enlacesBalanceDeGasto(gasto)} /> : null}
            </>
          ) : m.conciliado && m.cobro_grupo_id ? (
            // Conciliado contra el SOBRE de un grupo (lo que depositó el
            // cliente por N aviones): se verifica en el detalle del grupo.
            m.cobro_grupo ? (
              <Link
                href={`/admin/quotes/grupo/${m.cobro_grupo.grupo_id}`}
                className="block text-sm text-emerald-600 hover:underline"
                title={
                  m.cobro_grupo.grupo_nombre
                    ? `${m.cobro_grupo.grupo_nombre} — ver el grupo cuyo sobre se concilió`
                    : "Ver el grupo cuyo sobre se concilió"
                }
              >
                Cobro grupo {folioTexto(m.cobro_grupo.grupo_folio)}
                {m.cobro_grupo.aviones_n > 0 && (
                  <>
                    {" "}
                    · {m.cobro_grupo.aviones_n}{" "}
                    {m.cobro_grupo.aviones_n === 1 ? "avión" : "aviones"}
                  </>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  · ${fmtMoney(String(m.cobro_grupo.monto))} {m.cobro_grupo.moneda}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {[
                    metodoPagoLabel(m.cobro_grupo.metodo_cobro),
                    // fecha_cobro es timestamptz: hora Cancún.
                    m.cobro_grupo.fecha_cobro
                      ? fmtDateCancun(m.cobro_grupo.fecha_cobro)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ver grupo"}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-emerald-600">Cobro de grupo</span>
            )
          ) : m.conciliado && m.cobro_id ? (
            m.cobro?.vuelo_id ? (
              <Link
                href={`/admin/flights/${m.cobro.vuelo_id}`}
                className="block text-sm text-emerald-600 hover:underline"
                title="Ver el vuelo cuyo cobro se concilió"
              >
                Cobro de vuelo
                {m.cobro.vuelo?.folio != null && <> #{m.cobro.vuelo.folio}</>}
                {m.cobro.monto != null && (
                  <span className="text-muted-foreground"> · ${fmtMoney(m.cobro.monto)}</span>
                )}
                <span className="block text-[10px] text-muted-foreground">
                  {[
                    metodoPagoLabel(m.cobro.metodo_cobro),
                    // fecha_cobro es timestamptz: formatear en hora Cancún
                    // (recortar la fecha UTC correría el día en la noche).
                    m.cobro.fecha_cobro ? fmtDateCancun(m.cobro.fecha_cobro) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ver vuelo"}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-emerald-600">Cobro de vuelo</span>
            )
          ) : m.conciliado && m.ingreso_id ? (
            // ABONO conciliado contra un INGRESO registrado (otro ingreso o
            // anticipo, 24-sep-2026): se verifica en Ingresos.
            <Link
              href={`/admin/ingresos?ingreso=${m.ingreso_id}`}
              className="block text-sm text-emerald-600 hover:underline"
              title="Ver el ingreso con el que se concilió"
            >
              Ingreso {m.ingreso ? etiquetaIngreso(m.ingreso.folio) : ""}
              {m.ingreso && (
                <span className="text-muted-foreground">
                  {" "}
                  · {etiquetaCategoriaIngreso(m.ingreso.categoria)}
                </span>
              )}
              {m.ingreso && (
                <span className="block max-w-[220px] truncate text-[10px] text-muted-foreground">
                  {m.ingreso.descripcion} · {fmtMonto(m.ingreso.monto, m.ingreso.moneda)}
                </span>
              )}
            </Link>
          ) : m.conciliado && esConciliadoPorReverso(m) ? (
            // Cargo devuelto ↔ su devolución (30-sep-2026): conciliados JUNTOS.
            // Se dice CON QUÉ se emparejó (la otra fecha y descripción); las
            // notas del API quedan en el tooltip.
            <span
              className="block text-sm text-sky-600 dark:text-sky-400"
              title={tituloParejaReverso(m, m.clasificacion?.nombre)}
            >
              {m.clasificacion?.nombre ?? ETIQUETA_REVERSO}
              <span className="block max-w-[240px] truncate text-[10px] text-muted-foreground">
                {textoParejaReverso(m)}
              </span>
            </span>
          ) : m.conciliado && esOmitido(m) ? (
            // OMITIDO de la conciliación (14-oct-2026, API 0.0.77): badge gris
            // y el motivo; quién y cuándo, en el tooltip. ANTES de la rama de
            // la clasificación (la omisión ES una clasificación canónica).
            <span className="block text-sm" title={tituloOmision(m.omision)}>
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                {ETIQUETA_BADGE_OMITIDO}
              </Badge>
              <span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-muted-foreground">
                {textoMotivoFila(m.omision)}
              </span>
            </span>
          ) : m.conciliado && m.clasificacion_id ? (
            // Conciliado por CLASIFICACIÓN: no corresponde a ningún vuelo
            // (comisión del banco, impuestos, personal…).
            <span
              className="block text-sm text-sky-600 dark:text-sky-400"
              title={m.notas ?? undefined}
            >
              {m.clasificacion?.nombre ?? "Clasificado"}
              {/* Clasificado por una REGLA automática (traspaso entre cuentas,
                  comisión del banco…): se distingue de lo que decidió una
                  persona. */}
              {reglaAutomaticaDe(m) && (
                <Badge
                  variant="outline"
                  className="ml-1.5 border-sky-500/40 px-1 py-0 text-[10px] text-sky-600 dark:text-sky-400"
                  title={`Clasificado automáticamente por la regla «${reglaAutomaticaDe(m)}»`}
                >
                  automático
                </Badge>
              )}
              {m.notas && (
                <span className="block text-[10px] text-muted-foreground truncate max-w-[220px]">
                  {m.notas}
                </span>
              )}
            </span>
          ) : (
            // PENDIENTE: POR QUÉ lo está, cuando el API lo sabe (15-sep-2026).
            // «Pendiente» a secas no le decía nada al operador («no se están
            // conciliando los gastos, salen como pendiente»).
            (() => {
              const motivo = motivoPendienteDe(m);
              if (!motivo) {
                // ABONO que el banco rotula como devolución (el API no calcula
                // motivo para abonos): se dice qué es y qué hacer.
                const pista = pistaPendienteDevolucion(m);
                if (pista) {
                  return (
                    <span className="block" title={pista.detalle}>
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                        Pendiente
                      </Badge>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {pista.etiqueta}
                      </span>
                    </span>
                  );
                }
                return (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                    Pendiente
                  </Badge>
                );
              }
              const tono = tonoMotivo(motivo.codigo);
              return (
                <span className="block" title={motivo.detalle}>
                  <Badge
                    variant="outline"
                    className={
                      tono === "rojo"
                        ? "border-destructive/50 text-destructive"
                        : tono === "gris"
                          ? "border-border text-muted-foreground"
                          : "border-amber-500/50 text-amber-600"
                    }
                  >
                    Pendiente
                  </Badge>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {motivo.etiqueta}
                  </span>
                </span>
              );
            })()
          );
        },
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        // CARGO vincula gastos y ABONO vincula cobros de vuelo: ambos tienen
        // camino manual (el auto-cruce solo resuelve los montos exactos).
        cell: (m) => (
          <MovimientoActions
            movimiento={m}
            gastos={gastos}
            abonos={abonos}
            catalogosGasto={catalogosGasto}
            cuentas={cuentas}
            monedaPorCuenta={monedaPorCuenta}
          />
        ),
      },
    ],
    // `nombreCuenta` deriva de `cuentas`: se recalcula con ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gastos, cuentas, variasCuentas, abonos, catalogosGasto, monedaPorCuenta, gastoResaltado, abreBalances],
  );
  const columnas = useMemo(() => (columnaSel ? [columnaSel, ...columns] : columns), [columnaSel, columns]);

  const tabla = (
    <DataTable
      // /admin/conciliacion tiene dos tablas: prefijo propio para no chocar
      // (su búsqueda `?mvq=` la prellenan las ligas de `hrefConciliacion`).
      syncId={SYNC_ID_MOVIMIENTOS}
      columns={columnas}
      rows={movimientos}
      rowKey={(m) => m.id}
      // La fila que se abrió desde Gastos (13-oct-2026): el MISMO anillo de
      // «Por facturar». DataTable no se toca: la página ya la puso primero.
      rowClassName={(m) => (resaltar && m.id === resaltar ? CLASE_FILA_ENFOCADA : undefined)}
      huboCorte={huboCorte}
      searchText={(m) =>
        `${m.descripcion ?? ""} ${m.monto} ${m.referencia ?? ""} ${
          m.cobro_grupo ? folioTexto(m.cobro_grupo.grupo_folio) : ""
        } ${m.ingreso ? etiquetaIngreso(m.ingreso.folio) : ""} ${cuentas?.[m.cuenta_bancaria_id] ?? ""} ${
          motivoPendienteDe(m)?.etiqueta ?? ""
        } ${esConciliadoPorReverso(m) ? `${ETIQUETA_REVERSO} ${contraparteReverso(m)?.descripcion ?? ""}` : ""} ${
          // Categorías, proveedores, lugar, notas, folios y montos de los
          // gastos que paga el cargo (uno o varios): «SAESA» o «#315» lo
          // encuentran.
          textoBusquedaGastos(m)
        } ${
          // Folios y clientes de los cobros que paga el abono (uno o varios).
          textoBusquedaCobros(m)
        } ${
          // «factura 7360» encuentra el SPEI aunque el banco diga «fact».
          textoBusquedaFacturaConcepto(m)
        } ${
          // «omitido» o el motivo de la omisión los encuentran (14-oct-2026).
          textoBusquedaOmision(m)
        }`
      }
      searchPlaceholder="Buscar movimiento (descripción, monto, referencia)…"
      // Solo con la selección: las filas que deja la búsqueda (todas las
      // páginas) para «Seleccionar los N…». Sin ella no se pasa.
      alCambiarFiltradas={conSeleccion ? setFiltradas : undefined}
    />
  );
  // Sin selección (otra pestaña, o un API ≤ 0.0.76): la tabla de siempre, sin envoltura.
  if (!conSeleccion || !vista) return tabla;

  const candidatas = filasVista.filter((m) => esSeleccionable(m, vista));
  const objetivo = seleccionarTodas(filasVista, vista).sel;
  const yaTodas = objetivo.size === idsVigentes.size && [...objetivo].every((id) => idsVigentes.has(id));
  const seleccionarLasN = () => {
    const r = seleccionarTodas(filasVista, vista);
    if (r.aviso) toast.info(r.aviso);
    setSel(r.sel);
  };
  const cerrarDialogo = (abierto: boolean) => {
    if (!abierto) setDialogo(null);
  };

  return (
    <>
      {(candidatas.length > 0 || vigentes.length > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
          {candidatas.length > 0 && !yaTodas && (
            <button
              type="button"
              onClick={seleccionarLasN}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
            >
              <CheckIcon className="h-3.5 w-3.5" aria-hidden />
              {textoSeleccionarTodas({ n: candidatas.length, conBusqueda, vista })}
            </button>
          )}
          {vigentes.length > 0 && (
            <button
              type="button"
              onClick={limpiarSeleccion}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
              {BOTON_QUITAR_SELECCION}
            </button>
          )}
        </div>
      )}
      {tabla}
      {vigentes.length > 0 && (
        <>
          {/* Mientras la barra se ve, el paginado no queda debajo de ella. */}
          <div aria-hidden="true" className="h-24" />
          <BarraSeleccionMovimientos
            vista={vista}
            resumen={resumenSeleccion(vigentes, monedaPorCuenta)}
            retirados={retirados}
            onVincular={() => setDialogo({ tipo: "vincular", movimientos: [...vigentes] })}
            onOmitir={() => setDialogo({ tipo: "omitir", movimientos: [...vigentes] })}
            onDeshacer={() => setDialogo({ tipo: "deshacer", movimientos: [...vigentes] })}
            onLimpiar={limpiarSeleccion}
          />
        </>
      )}
      {dialogo?.tipo === "omitir" && (
        <OmitirMovimientosDialog
          movimientos={dialogo.movimientos}
          aliasPorCuenta={cuentas}
          monedaPorCuenta={monedaPorCuenta}
          open
          onOpenChange={cerrarDialogo}
          onOmitidos={limpiarSeleccion}
          onQuitarDeSeleccion={quitarDeSeleccion}
        />
      )}
      {dialogo?.tipo === "deshacer" && (
        <QuitarOmisionDialog
          movimientos={dialogo.movimientos}
          aliasPorCuenta={cuentas}
          monedaPorCuenta={monedaPorCuenta}
          open
          onOpenChange={cerrarDialogo}
          onRestaurados={limpiarSeleccion}
        />
      )}
      {/* «Vincular a un gasto…» (14-oct-2026, API 0.0.77): con UN cargo, el
          «Vincular gasto» de siempre (sin editarlo); con 2..50, varios cargos
          → un gasto (la barra ya revisó que sean solo cargos de una moneda),
          con «¿No está el gasto? Créalo por $X» si cargaron los catálogos. */}
      {dialogo?.tipo === "vincular" && dialogo.movimientos.length === 1 && (
        <VincularGastoDialog
          movimiento={dialogo.movimientos[0]}
          gastos={gastos}
          catalogosGasto={catalogosGasto}
          open
          onOpenChange={cerrarDialogo}
        />
      )}
      {dialogo?.tipo === "vincular" && dialogo.movimientos.length >= MIN_CARGOS_A_GASTO && (
        <VincularCargosGastoDialog
          movimientos={dialogo.movimientos}
          aliasPorCuenta={cuentas}
          monedaPorCuenta={monedaPorCuenta}
          catalogosGasto={catalogosGasto}
          open
          onOpenChange={cerrarDialogo}
          onVinculados={limpiarSeleccion}
          onQuitarDeSeleccion={quitarDeSeleccion}
        />
      )}
    </>
  );
}
