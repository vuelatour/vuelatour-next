"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CLASE_FILA_RESALTADA,
  claseFilaResaltada,
  conjuntoResaltado,
} from "@/lib/admin/pre-cierre-resolver";
import { FacturacionBadge } from "@/components/admin/expenses/facturacion-badge";
import { BancoBadge } from "@/components/admin/expenses/banco-badge";
import { GastoBancoSheet, useDetalleBancoGasto } from "@/components/admin/expenses/gasto-banco-sheet";
import { puedeVerDetalleBancoGasto } from "@/lib/admin/gasto-banco";
import { GastoFacturaButton } from "@/components/admin/expenses/gasto-factura-button";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { hojasDe } from "@/lib/admin/comprobante-hojas";
import { HojasComprobanteBoton } from "@/components/admin/expenses/hojas-comprobante-boton";
import { etiquetaComprobante } from "@/lib/admin/comprobante-badge";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import {
  CompraEstadoBadge,
  CompraRolBadge,
} from "@/components/admin/inventory/compras/compra-badges";
import {
  aGastoSeleccionado,
  useSeleccionGastos,
} from "@/components/admin/expenses/expenses-seleccion";
import { CapturadoCompacto } from "@/components/admin/expenses/capturado-linea";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { CHIP_PAGO_AFAC, TITULO_CHIP_PAGO_AFAC, esPagoAfac } from "@/lib/admin/pago-afac";
import { lineaCapturaCompacta } from "@/lib/admin/gastos-captura";
import { MEDIO_PAGO_LABELS, textoPagoCorto } from "@/lib/admin/medios-pago";
import {
  ETIQUETA_AVION_VUELATOUR,
  ETIQUETA_FALTA_AVION,
  ETIQUETA_REPARTIDO,
  MATRICULA_DESCONOCIDA,
  TEXTO_VER_AVION,
  TITULO_FALTA_AVION,
  TITULO_REFERENCIA_AVION,
  estadoAvionGasto,
  textoReferenciaAvion,
  textoVueloGasto,
  tituloRemanenteReparto,
} from "@/lib/admin/gasto-avion";
import {
  ENCABEZADO_COLUMNA_UNIR,
  ENCABEZADOS_GASTOS,
  ETIQUETA_SIN_VISTA_PREVIA,
  PLACEHOLDER_BUSCAR_GASTOS,
  TEXTO_DUPLICADO,
  TEXTO_FALTA_VISTO_BUENO,
  TITULO_COLUMNA_UNIR,
  TITULO_DUPLICADO,
  TITULO_ENCABEZADO_COMP,
  TITULO_ENCABEZADO_FECHA,
  TITULO_FALTA_VISTO_BUENO,
  TITULO_OCULTAR_PAGOS_COMPRA,
  TITULO_SIN_VISTA_PREVIA,
  TITULO_VER_PAGOS_COMPRA,
  altComprobanteGasto,
  descripcionGasto,
  etiquetaCompra,
  lineaComprobanteGasto,
  lineaEstadoMovilGasto,
  textoBusquedaGasto,
  textoPagosCompra,
  textoPropinaGasto,
  tituloAbrirCompra,
  tituloConfirmadoGasto,
} from "@/lib/admin/gastos-vista";
import type { Gasto } from "@/types/expenses";
import { esCategoriaCompra, type CompraEstado } from "@/types/compras";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";

// Solo se pinta badge cuando NO hay comprobante (14-sep-2026: la columna
// responde «¿hay papel?» y con papel la miniatura ya lo dice). Las etiquetas
// salen de @/lib/admin/comprobante-badge.
const ESTATUS_STYLE: Record<string, string> = {
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

/**
 * Filas de la tabla: un gasto suelto, o UNA COMPRA (los gastos que comparten
 * compra_id se ven como un solo renglón-grupo, expandible a sus pagos). Los
 * pagos siguen siendo gastos completos: cada uno cuenta en los totales y
 * en el conteo de la tarjeta — el grupo solo cambia cómo se ven.
 *
 * Los pagos NO son filas de la tabla: viajan como `hijos` del grupo y la
 * DataTable los pinta pegados al padre vía `subRows` (no cuentan para
 * paginar ni los filtra la búsqueda), así el grupo nunca se parte.
 */
type Fila =
  | { kind: "gasto"; key: string; gasto: Gasto; hijo: boolean }
  | {
      kind: "compra";
      key: string;
      compraId: string;
      folio: number;
      estado: CompraEstado;
      proveedor: string | null;
      referencia: string | null;
      fecha: string | null;
      /** Pagos que SÍ llegaron a esta vista (filtros + corte). */
      pagos: Gasto[];
      /** Total real de pagos de la compra según el API; null si no viene. */
      nPagos: number | null;
      /** Totales POR MONEDA (nunca se mezclan MXN y USD). */
      totales: Array<{ moneda: string; total: number }>;
      abierta: boolean;
      /** Filas-hijo (los pagos) listas para `subRows` cuando está abierta. */
      hijos: Fila[];
    };

const GUION = <span className="text-muted-foreground">—</span>;

/**
 * La tabla ÚNICA de Gastos (14-oct-2026; antes «Gastos generales» y «Gastos
 * operativos» en dos tarjetas). 8 columnas (9 con el modo «Unir en compra»)
 * que caben sin scroll horizontal desde 1280 px: Fecha (con la captura y
 * quién, una sola vez), Concepto (categoría + insignias + descripción),
 * Monto (con el medio de pago corto y la propina), Avión · vuelo (a dónde va
 * el dinero: `gasto-avion.ts`), Comp. (desde 1280 px), Facturación, Banco y ⋯.
 * Concepto absorbe el ancho sobrante (`w-full`). Breakpoints de VIEWPORT, no
 * container queries: `container-type` atraparía el visor `fixed` de
 * ImagePreview dentro de la tabla. Textos y reglas: `lib/admin/gastos-vista.ts`.
 */
export function ExpensesTable({
  gastos,
  aircraft,
  providers,
  fotoUrls,
  huboCorte = false,
  rol,
  resaltados,
}: {
  gastos: Gasto[];
  aircraft: AvionCatalogoGasto[];
  providers: { id: string; nombre: string }[];
  fotoUrls: Record<string, string>;
  /** true = la página no logró cargar TODOS los gastos (corte defensivo). */
  huboCorte?: boolean;
  /** Rol de quien mira: el menú ⋯ esconde lo que su rol no puede hacer. */
  rol?: string | null;
  /** ADITIVO (15-oct-2026): ids de gasto que el pre-cierre manda resolver
      («Resolver →»): se pintan en ámbar (la página ya los puso PRIMERO). */
  resaltados?: string[];
}) {
  const resaltadosSet = useMemo(() => conjuntoResaltado(resaltados), [resaltados]);
  const seleccion = useSeleccionGastos();
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  // «Conciliación al revés» (13-oct-2026): UNA hoja por tabla. Solo ADMIN /
  // FACTURACION (o rol desconocido: el API es el candado) abren el detalle;
  // para los demás el badge queda exactamente como antes.
  const detalleBanco = useDetalleBancoGasto();
  const abrirBanco = puedeVerDetalleBancoGasto(rol) ? detalleBanco.abrir : null;

  const toggleCompra = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filas = useMemo<Fila[]>(() => {
    // Pagos por compra en UNA pasada (antes un `filter` por compra dentro del
    // ciclo); el orden de las filas es el mismo: la compra aparece donde
    // aparece su primer pago.
    const pagosPorCompra = new Map<string, Gasto[]>();
    for (const g of gastos) {
      if (!g.compra_id || !g.compra) continue;
      const lista = pagosPorCompra.get(g.compra_id);
      if (lista) lista.push(g);
      else pagosPorCompra.set(g.compra_id, [g]);
    }
    const out: Fila[] = [];
    const vistas = new Set<string>();
    for (const g of gastos) {
      const cid = g.compra_id;
      if (!cid || !g.compra) {
        out.push({ kind: "gasto", key: g.id, gasto: g, hijo: false });
        continue;
      }
      if (vistas.has(cid)) continue;
      vistas.add(cid);
      const pagos = pagosPorCompra.get(cid) ?? [g];
      const porMoneda = new Map<string, number>();
      for (const p of pagos) {
        porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? 0) + Number(p.monto));
      }
      // Fecha del grupo: la de la factura de mercancía (o la primera).
      const mercancia = pagos.find((p) => p.compra_rol === "MERCANCIA") ?? pagos[0];
      const abierta = expandidas.has(cid);
      const nPagos =
        typeof g.compra.n_pagos === "number" && Number.isFinite(g.compra.n_pagos)
          ? g.compra.n_pagos
          : null;
      out.push({
        kind: "compra",
        key: `compra-${cid}`,
        compraId: cid,
        folio: g.compra.folio,
        estado: g.compra.estado,
        proveedor: g.compra.proveedor?.nombre ?? null,
        referencia: g.compra.referencia,
        fecha: mercancia?.fecha_gasto ?? null,
        pagos,
        nPagos,
        totales: [...porMoneda.entries()].map(([moneda, total]) => ({ moneda, total })),
        abierta,
        hijos: pagos.map((p) => ({ kind: "gasto", key: p.id, gasto: p, hijo: true })),
      });
    }
    return out;
  }, [gastos, expandidas]);

  const columns = useMemo<Array<DataTableColumn<Fila>>>(() => {
    const cols: Array<DataTableColumn<Fila>> = [];

    // Casillas SOLO con el modo «Unir en compra» encendido (14-oct-2026).
    if (seleccion?.modoUnir) {
      cols.push({
        key: "sel",
        header: (
          <span title={TITULO_COLUMNA_UNIR} className="inline-flex">
            <ShoppingCartIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{ENCABEZADO_COLUMNA_UNIR}</span>
          </span>
        ),
        headClassName: "w-8 text-center",
        cellClassName: "w-8 text-center",
        // Solo gastos sueltos de categoría de compra (fuente única
        // esCategoriaCompra): GAS, VISITA, PERSONAL_DUENO… no se unen.
        cell: (f) =>
          f.kind === "gasto" && !f.gasto.compra_id && esCategoriaCompra(f.gasto.categoria) ? (
            <input
              type="checkbox"
              checked={seleccion.seleccion.has(f.gasto.id)}
              onChange={() => seleccion.toggle(aGastoSeleccionado(f.gasto))}
              className="h-4 w-4 cursor-pointer accent-brand-600"
              aria-label="Seleccionar gasto para unir en compra"
              title="Seleccionar para unir en compra"
            />
          ) : null,
      });
    }

    const claseComp = seleccion?.modoUnir
      ? "hidden min-[1300px]:table-cell"
      : "hidden xl:table-cell";
    // Respaldo de «Comp.» bajo el concepto con el MISMO corte que la oculta
    // (desde 768 px; debajo lo dice la línea del teléfono): entre 768 y
    // 1279 px nada decía si el gasto trae papel (revisión del 14-oct-2026).
    const claseRespaldoComp = seleccion?.modoUnir
      ? "hidden md:block min-[1300px]:hidden"
      : "hidden md:block xl:hidden";

    cols.push(
      {
        key: "fecha",
        header: <span title={TITULO_ENCABEZADO_FECHA}>{ENCABEZADOS_GASTOS.fecha}</span>,
        headClassName: "w-[8rem]",
        cellClassName: "w-[8rem]",
        cell: (f) =>
          f.kind === "compra" ? (
            <button
              type="button"
              onClick={() => toggleCompra(f.compraId)}
              className="inline-flex cursor-pointer items-center gap-1 font-medium hover:text-brand-600 dark:hover:text-brand-400"
              title={f.abierta ? TITULO_OCULTAR_PAGOS_COMPRA : TITULO_VER_PAGOS_COMPRA}
              aria-expanded={f.abierta}
            >
              {f.abierta ? (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5" />
              )}
              {fmtDateOnly(f.fecha)}
            </button>
          ) : (
            // Pago de una compra: sangría de 12 px y sublíneas de 6.25rem
            // (12 + 100 = 112 px, lo mismo que una fila suelta): la columna
            // ya no crece al desplegar la compra (revisión del 14-oct-2026).
            <div className={f.hijo ? "pl-3 text-muted-foreground" : undefined}>
              <span className="block">{fmtDateOnly(f.gasto.fecha_gasto)}</span>
              {/* Cuándo, quién y desde dónde se capturó (7-sep), en hora
                  Cancún, con la pista ámbar del 28-ago y el DISTINTIVO de
                  origen (Oficina / Sistema / Visitante, pedido del 9-jul). */}
              <CapturadoCompacto captura={lineaCapturaCompacta(f.gasto)} angosto={f.hijo} />
            </div>
          ),
      },
      {
        key: "concepto",
        header: ENCABEZADOS_GASTOS.concepto,
        headClassName: "w-full",
        cellClassName: "whitespace-normal",
        cell: (f) => {
          if (f.kind === "compra") {
            const texto = [f.proveedor, f.referencia].filter(Boolean).join(" · ");
            return (
              <div className="min-w-[10rem] max-w-[40rem]">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <Badge
                    variant="outline"
                    className="border-brand-600/50 text-brand-600 dark:text-brand-400"
                  >
                    {etiquetaCompra(f.folio)}
                  </Badge>
                  <CompraEstadoBadge estado={f.estado} />
                </div>
                {texto && (
                  <p className="mt-0.5 line-clamp-1 text-xs" title={texto}>
                    {texto}
                  </p>
                )}
              </div>
            );
          }
          const g = f.gasto;
          const desc = descripcionGasto(g);
          const comp = lineaComprobanteGasto(g, !!(g.foto_url && fotoUrls[g.foto_url]));
          return (
            <div className="min-w-[10rem] max-w-[40rem]">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="font-medium">{categoriaGastoLabel(g.categoria)}</span>
                {g.compra_rol && <CompraRolBadge rol={g.compra_rol} />}
                {/* «Pago de AFAC» (16-oct-2026, API 0.0.89, invariante 90): lo
                    paga VuelaTour y no le resta al avión. */}
                {esPagoAfac(g) && (
                  <Badge
                    variant="outline"
                    className="border-violet-500/50 text-violet-600 dark:text-violet-400"
                    title={TITULO_CHIP_PAGO_AFAC}
                    data-pago-afac=""
                  >
                    {CHIP_PAGO_AFAC}
                    <span className="sr-only"> · {TITULO_CHIP_PAGO_AFAC}</span>
                  </Badge>
                )}
                {g.duplicado_sospechado && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-600 dark:text-amber-400"
                    title={TITULO_DUPLICADO}
                  >
                    {TEXTO_DUPLICADO}
                  </Badge>
                )}
                {g.requiere_visto_bueno === true && (
                  <Badge
                    variant="outline"
                    className="border-sky-500/50 text-sky-600 dark:text-sky-400"
                    title={TITULO_FALTA_VISTO_BUENO}
                  >
                    {TEXTO_FALTA_VISTO_BUENO}
                  </Badge>
                )}
              </div>
              {desc.texto && (
                <p
                  className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                  title={desc.title ?? undefined}
                >
                  {desc.texto}
                </p>
              )}
              {comp && (
                <p
                  className={cn("mt-0.5 text-[11px] text-muted-foreground", claseRespaldoComp)}
                  title={comp.title ?? undefined}
                  data-respaldo-comp=""
                >
                  {comp.texto}
                </p>
              )}
              {/* Teléfono (<768 px): lo de las columnas de la derecha, en texto. */}
              <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                {lineaEstadoMovilGasto(g)}
              </p>
            </div>
          );
        },
      },
      {
        key: "monto",
        header: ENCABEZADOS_GASTOS.monto,
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        // El monto ES el total pagado (ticket + propina): lo que llega al
        // banco. Debajo, con qué se pagó y la propina (informativa).
        cell: (f) => {
          if (f.kind === "compra") {
            const pagos = textoPagosCompra(f.pagos.length, f.nPagos);
            return (
              <>
                {f.totales.map((t) => (
                  <span key={t.moneda} className="block font-medium">
                    {fmtMonto(t.total, t.moneda)}
                  </span>
                ))}
                {pagos.parcial ? (
                  // El API sabe cuántos pagos tiene la compra; aquí solo
                  // llegaron los que caben en el filtro/corte: el conteo y los
                  // totales del grupo son parciales y hay que decirlo.
                  // El aviso envuelve (renglones cortos alineados a la derecha):
                  // en una línea ensanchaba la columna ≈80 px (medido).
                  <span
                    className="ml-auto block max-w-[7.5rem] whitespace-normal text-[11px] leading-tight text-amber-600 dark:text-amber-400"
                    title={pagos.title ?? undefined}
                  >
                    {pagos.texto}
                    <span className="block text-[10px]">{pagos.parcial}</span>
                  </span>
                ) : (
                  <span className="block text-[11px] text-muted-foreground">{pagos.texto}</span>
                )}
              </>
            );
          }
          const g = f.gasto;
          const pago = textoPagoCorto(g.medio_pago, g.tarjeta_terminacion);
          const propina = textoPropinaGasto(g.propina, g.moneda);
          return (
            <>
              <span className="block font-medium">{fmtMonto(g.monto, g.moneda)}</span>
              {pago && (
                <span className="block text-[11px] text-muted-foreground" title={pago.title}>
                  {pago.texto}
                </span>
              )}
              {/* Puede partirse en dos renglones si el monto de la propina es largo. */}
              {propina && (
                <span className="ml-auto block max-w-[7.5rem] whitespace-normal text-[10px] leading-tight text-muted-foreground">
                  {propina}
                </span>
              )}
            </>
          );
        },
      },
      {
        key: "avion",
        header: ENCABEZADOS_GASTOS.avion,
        cellClassName: "whitespace-normal",
        cell: (f) => {
          if (f.kind === "compra") return GUION;
          const g = f.gasto;
          const e = estadoAvionGasto(g);
          let principal: React.ReactNode;
          if (e.tipo === "REPARTIDO") {
            // Cada parte liga a la ficha del avión con su monto en el title;
            // «VuelaTour» si queda remanente (centavos: lo absorbe la empresa).
            principal = (
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-full text-[10px] text-muted-foreground">{ETIQUETA_REPARTIDO}</span>
                {e.partes.map((p) => (
                  <Link key={p.aeronaveId} href={`/admin/aircraft/${p.aeronaveId}`}>
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] transition-colors hover:border-brand-600/60 hover:text-brand-600 dark:hover:text-brand-400"
                      title={fmtMonto(p.monto, g.moneda)}
                    >
                      {p.matricula ?? MATRICULA_DESCONOCIDA}
                    </Badge>
                  </Link>
                ))}
                {e.remanente > 0.004 && (
                  <Badge
                    variant="secondary"
                    className="text-[11px]"
                    title={tituloRemanenteReparto(e.remanente, g.moneda)}
                  >
                    {ETIQUETA_AVION_VUELATOUR}
                  </Badge>
                )}
              </div>
            );
          } else if (e.tipo === "FUERA_DEL_AVION") {
            principal = (
              <>
                <Badge variant="secondary" className="text-[11px]" title={e.titulo}>
                  {e.etiqueta}
                  <span className="sr-only"> · {e.titulo}</span>
                </Badge>
                {/* PERMISO marcado «Pago de AFAC» (16-oct-2026, invariante 90). */}
                {e.detalle && (
                  <span className="block text-[10px] text-muted-foreground" title={e.titulo}>
                    {e.detalle}
                  </span>
                )}
                {e.referencia && (
                  <span
                    className="block text-[10px] text-muted-foreground"
                    title={TITULO_REFERENCIA_AVION}
                  >
                    {textoReferenciaAvion(e.referencia)}
                  </span>
                )}
              </>
            );
          } else if (e.tipo === "AVION") {
            principal = (
              <Link
                href={`/admin/aircraft/${e.aeronaveId}`}
                className="font-mono text-brand-600 hover:underline dark:text-brand-400"
              >
                {e.matricula ?? TEXTO_VER_AVION}
              </Link>
            );
          } else {
            principal = (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-600 dark:text-amber-400"
                title={TITULO_FALTA_AVION}
              >
                {ETIQUETA_FALTA_AVION}
                <span className="sr-only"> · {TITULO_FALTA_AVION}</span>
              </Badge>
            );
          }
          return (
            <div className="max-w-[6.5rem]">
              {principal}
              {g.vuelo_id && (
                <Link
                  href={`/admin/flights/${g.vuelo_id}`}
                  className="block whitespace-nowrap text-xs text-brand-600 hover:underline dark:text-brand-400"
                >
                  {textoVueloGasto(g.vuelo?.folio)}
                </Link>
              )}
            </div>
          );
        },
      },
      {
        key: "comprobante",
        header: (
          <span title={TITULO_ENCABEZADO_COMP}>
            <span aria-hidden="true">{ENCABEZADOS_GASTOS.comp}</span>
            <span className="sr-only">{ENCABEZADOS_GASTOS.compLargo}</span>
          </span>
        ),
        // Desde 1280 px de VIEWPORT (en modo «Unir en compra», desde 1300:
        // la casilla suma 32 px y a 1280 en Windows la tabla se deslizaba
        // 9 px con un monto de seis cifras — medido). Debajo, «Sin comp.»
        // sigue en la línea del teléfono y la foto en «Verificar / editar».
        headClassName: claseComp,
        cellClassName: claseComp,
        cell: (f) => {
          if (f.kind === "compra") return GUION;
          const g = f.gasto;
          // Hojas 2..N del comprobante (12-oct-2026): «+N hojas» las abre.
          const nHojas = hojasDe(g).length;
          const firmada = g.foto_url ? fotoUrls[g.foto_url] : undefined;
          return (
            <div className="flex max-w-[6.5rem] flex-wrap items-center gap-x-2 gap-y-0.5">
              {g.foto_url && firmada && (
                <ComprobantePreview
                  bucket="gasto-fotos"
                  path={g.foto_url}
                  url={firmada}
                  alt={altComprobanteGasto(g.categoria)}
                />
              )}
              {/* La firma falló o no llegó esa ruta: se dice, en vez de una
                  celda vacía que parece «sin comprobante». */}
              {g.foto_url && !firmada && (
                <span
                  className="whitespace-normal text-[11px] leading-tight text-muted-foreground"
                  title={TITULO_SIN_VISTA_PREVIA}
                >
                  {ETIQUETA_SIN_VISTA_PREVIA}
                </span>
              )}
              {/* «+N hojas» abre el comprobante completo con el visor (16-oct-2026). */}
              {nHojas > 0 && <HojasComprobanteBoton gasto={g} fotoUrl={firmada} />}
              {/* «Factura» ya no se pinta (14-sep-2026): se confundía con el
                  semáforo «Facturada/Pendiente» de al lado; la miniatura basta. */}
              {etiquetaComprobante(g.estatus_comprobante) && (
                <Badge variant="outline" className={ESTATUS_STYLE[g.estatus_comprobante] ?? ""}>
                  {etiquetaComprobante(g.estatus_comprobante)}
                </Badge>
              )}
              {/* Sello de confirmación del panel (opcional: skew de deploy). */}
              {g.verificado_at && (
                <span
                  className="text-emerald-600 dark:text-emerald-400"
                  title={tituloConfirmadoGasto(g)}
                >
                  ✓
                </span>
              )}
            </div>
          );
        },
      },
      {
        // Seguimiento de oficina "¿ya lo facturé?" (pedido del cliente,
        // ago 2026): semáforo de un clic, independiente del comprobante;
        // «No requiere» en corto (compacta) para no ensanchar la columna.
        //
        // AL LADO, «Subir factura» (22-sep-2026): el XML del CFDI se registra
        // en Facturas recibidas y se amarra a ESTE gasto sin salir de la
        // pantalla — al amarrar, el trigger del API pone el semáforo en
        // 🟢 Facturada (el panel no lo toca por su cuenta).
        key: "facturacion",
        header: ENCABEZADOS_GASTOS.facturacion,
        // La columna tiene botones y la fila no es un link (Gastos no usa
        // `rowHref`), pero se marca igual por si algún día lo usa.
        noLink: true,
        cell: (f) =>
          f.kind === "compra" ? (
            GUION
          ) : (
            <span className="inline-flex items-center gap-1">
              <FacturacionBadge gasto={f.gasto} compacta />
              <GastoFacturaButton gasto={f.gasto} />
            </span>
          ),
      },
      {
        // ¿Ya cruzó con el banco? (9-oct-2026, pedido de oficina: «un
        // apartado donde me diga si el gasto está conciliado con el banco»).
        // Clic para ADMIN/FACTURACION: conciliación al revés (13-oct-2026,
        // el cargo, su cuenta y su estado de cuenta); el cruce sigue en
        // Conciliación.
        key: "banco",
        header: ENCABEZADOS_GASTOS.banco,
        cellClassName: "whitespace-nowrap",
        noLink: true,
        cell: (f) =>
          f.kind === "compra" ? (
            GUION
          ) : (
            <BancoBadge gasto={f.gasto} alAbrir={abrirBanco ? () => abrirBanco(f.gasto) : undefined} />
          ),
      },
      {
        key: "acciones",
        header: <span className="sr-only">{ENCABEZADOS_GASTOS.acciones}</span>,
        headClassName: "w-12",
        cellClassName: "w-12 text-center",
        cell: (f) =>
          f.kind === "compra" ? (
            // Solo ícono: «Ver compra» con texto ensanchaba la columna ≈60 px
            // cada vez que una compra caía en la página.
            <Link
              href={`/admin/inventory/compras/${f.compraId}`}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-600 hover:bg-muted dark:text-brand-400"
              aria-label={tituloAbrirCompra(f.folio)}
              title={tituloAbrirCompra(f.folio)}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <ExpenseActions
              gasto={f.gasto}
              aircraft={aircraft}
              providers={providers}
              fotoUrl={f.gasto.foto_url ? fotoUrls[f.gasto.foto_url] : undefined}
              rol={rol}
            />
          ),
      },
    );
    return cols;
  }, [aircraft, providers, fotoUrls, seleccion, rol, abrirBanco]);

  return (
    <>
      <DataTable
        columns={columns}
        rows={filas}
        rowKey={(f) => f.key}
        huboCorte={huboCorte}
        // Tinte neutro (antes `bg-brand-600/5`, que se confundía con el
        // tinte rojizo de la fila ACTIVA).
        // Ámbar (15-oct-2026) = lo que el pre-cierre manda resolver; la
        // compra plegada que contiene un pago resaltado también se marca.
        rowClassName={(f) =>
          f.kind === "compra"
            ? cn("bg-muted/40", f.pagos.some((p) => resaltadosSet.has(p.id.toLowerCase())) && CLASE_FILA_RESALTADA)
            : cn(f.hijo && "bg-muted/20", claseFilaResaltada(resaltadosSet, f.gasto.id)) || undefined
        }
        // Los pagos van pegados al grupo (no se paginan ni se filtran sueltos).
        subRows={(f) => (f.kind === "compra" && f.abierta ? f.hijos : undefined)}
        searchText={(f) => {
          if (f.kind === "compra") {
            return [
              `compra #${f.folio}`,
              f.proveedor ?? "",
              f.referencia ?? "",
              ...f.pagos.map(textoBusquedaGasto),
            ].join(" ");
          }
          return textoBusquedaGasto(f.gasto);
        }}
        searchPlaceholder={PLACEHOLDER_BUSCAR_GASTOS}
      />
      <GastoBancoSheet detalle={detalleBanco} />
    </>
  );
}

// Fuente única movida a @/lib/admin/medios-pago (la necesita también el
// historial de gastos, que es server component). Re-export para no tocar a
// los consumidores existentes (otros-gastos, gastos-personales, compras).
export { MEDIO_PAGO_LABELS };
