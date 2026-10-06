"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MovimientoActions } from "@/components/admin/conciliacion/movimiento-actions";
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
  ETIQUETA_REVERSO,
  contraparteReverso,
  esConciliadoPorReverso,
  pistaPendienteDevolucion,
  textoParejaReverso,
  tituloParejaReverso,
} from "@/lib/admin/conciliacion-reverso";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { etiquetaCategoriaIngreso, etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { fmtMonto } from "@/lib/format";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

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
}

export function MovimientosTable({ movimientos, gastos, cuentas }: MovimientosTableProps) {
  // La columna «Cuenta» solo aparece cuando la vista mezcla varias (con una
  // sola cuenta filtrada sería una columna que repite lo mismo en cada fila).
  const variasCuentas = useMemo(
    () => new Set(movimientos.map((m) => m.cuenta_bancaria_id)).size > 1,
    [movimientos],
  );
  const nombreCuenta = (id: string) => cuentas?.[id] ?? "—";

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
        cellClassName: "text-muted-foreground truncate max-w-[280px]",
        cell: (m) => m.descripcion ?? "—",
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
            const lote = resumenLoteFila(m);
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
                  <Link
                    key={l.key}
                    href={l.href}
                    className="block text-xs text-emerald-600 hover:underline"
                    title={TITULO_VER_GASTO_CONCILIADO}
                  >
                    {l.principal}
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
          const gasto = m.conciliado ? gastoUnicoDe(m) : null;
          // Número de la factura con la que se liga el cargo (pedido del
          // cliente, 5-oct-2026): lo resuelve el API (`folio_comprobante`);
          // aquí solo se rotula. Sin él no se pinta nada.
          const factura = etiquetaFolioComprobante(gasto?.folio_comprobante);
          if (m.conciliado && tieneGastoLigado(m) && !gasto) {
            return (
              <span className="block text-sm text-emerald-600" title={TOOLTIP_LOTE_SIN_DETALLE}>
                {textoLoteSinDetalle(numeroGastosDe(m) || 1)}
              </span>
            );
          }
          return gasto ? (
            // Verificable de un clic: al vuelo del gasto (donde se
            // ve su desglose) o, sin vuelo, a la lista de gastos.
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
        cell: (m) => <MovimientoActions movimiento={m} gastos={gastos} />,
      },
    ],
    // `nombreCuenta` deriva de `cuentas`: se recalcula con ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gastos, cuentas, variasCuentas],
  );

  return (
    <DataTable
      // /admin/conciliacion tiene dos tablas: prefijo propio para no chocar
      syncId="mv"
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.id}
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
        }`
      }
      searchPlaceholder="Buscar movimiento (descripción, monto, referencia)…"
    />
  );
}
