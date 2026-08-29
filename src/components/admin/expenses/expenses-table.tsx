"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { FacturacionBadge } from "@/components/admin/expenses/facturacion-badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import {
  CompraEstadoBadge,
  CompraRolBadge,
} from "@/components/admin/inventory/compras/compra-badges";
import {
  aGastoSeleccionado,
  useSeleccionGastos,
} from "@/components/admin/expenses/expenses-seleccion";
import { fmtDate, fmtDateOnly } from "@/lib/datetime";
import { verificadorNombre, type Gasto } from "@/types/expenses";
import { esCategoriaCompra, type CompraEstado } from "@/types/compras";

const fmtMoney = (monto: string | number, moneda: string) =>
  Number(monto).toLocaleString("es-MX", { style: "currency", currency: moneda });

const ESTATUS_STYLE: Record<string, string> = {
  FACTURA: "border-emerald-500/50 text-emerald-600",
  VALE: "border-amber-500/50 text-amber-600",
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

// Distintivo pedido por el cliente: los gastos que sube administración (o que
// genera el sistema, p.ej. pistas) se distinguen de los capturados en campo.
const ORIGEN_BADGE: Record<string, { label: string; cls: string }> = {
  OFICINA: { label: "Oficina", cls: "border-sky-500/50 text-sky-600" },
  SISTEMA: { label: "Sistema", cls: "border-violet-500/50 text-violet-600" },
  VISITANTE: { label: "Visitante", cls: "border-teal-500/50 text-teal-600" },
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
      /** Pagos que SÍ llegaron a esta vista (filtros + corte de 200). */
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

export function ExpensesTable({
  gastos,
  aircraft,
  providers,
  fotoUrls,
  huboCorte = false,
}: {
  gastos: Gasto[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  fotoUrls: Record<string, string>;
  /** true = la página no logró cargar TODOS los gastos (corte defensivo). */
  huboCorte?: boolean;
}) {
  const seleccion = useSeleccionGastos();
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());

  const toggleCompra = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filas = useMemo<Fila[]>(() => {
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
      const pagos = gastos.filter((x) => x.compra_id === cid);
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

    if (seleccion) {
      cols.push({
        key: "sel",
        header: "",
        headClassName: "w-8",
        cellClassName: "w-8",
        // Solo gastos sueltos de categoría de compra (fuente única
        // esCategoriaCompra): GAS, VISITA, PERSONAL_DUENO… no se unen.
        cell: (f) =>
          f.kind === "gasto" && !f.gasto.compra_id && esCategoriaCompra(f.gasto.categoria) ? (
            <input
              type="checkbox"
              checked={seleccion.seleccion.has(f.gasto.id)}
              onChange={() => seleccion.toggle(aGastoSeleccionado(f.gasto))}
              className="h-4 w-4 accent-brand-600"
              aria-label="Seleccionar gasto para unir en compra"
              title="Seleccionar para unir en compra"
            />
          ) : null,
      });
    }

    cols.push(
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (f) =>
          f.kind === "compra" ? (
            <button
              type="button"
              onClick={() => toggleCompra(f.compraId)}
              className="inline-flex items-center gap-1 font-medium hover:text-brand-600"
              title={f.abierta ? "Ocultar pagos" : "Ver los pagos de la compra"}
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
            <span className={f.hijo ? "pl-6 text-muted-foreground" : undefined}>
              {fmtDateOnly(f.gasto.fecha_gasto)}
              {/* Pista de CAPTURA (28-ago): cuando el ticket trae otra fecha
                  (la IA leyó 2025, o se subió días después) se ve aquí — así
                  "lo que subí hoy" se encuentra aunque esté fechado atrás. */}
              {(() => {
                const fecha = f.gasto.fecha_gasto;
                const cap = f.gasto.created_at;
                if (!fecha || !cap) return null;
                const diffDias = Math.round(
                  (Date.parse(`${cap.slice(0, 10)}T12:00:00Z`) -
                    Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`)) /
                    86_400_000,
                );
                const anio = Number(fecha.slice(0, 4));
                const anioActual = new Date().getFullYear();
                const anioRaro = Number.isFinite(anio) && anio < anioActual;
                if (!anioRaro && Math.abs(diffDias) <= 2) return null;
                return (
                  <span
                    className={
                      "block text-[10px] " +
                      (anioRaro || Math.abs(diffDias) > 120
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground")
                    }
                    title={
                      anioRaro
                        ? `Ojo: el ticket quedó fechado en ${anio} — revisa el año`
                        : "Fecha en que se capturó (la del ticket es la de arriba)"
                    }
                  >
                    {anioRaro ? "⚠ año " + anio + " · " : ""}cap. {fmtDateOnly(cap.slice(0, 10))}
                  </span>
                );
              })()}
            </span>
          ),
      },
      {
        key: "categoria",
        header: "Categoría",
        cell: (f) =>
          f.kind === "compra" ? (
            <span className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="border-brand-600/50 text-brand-600">
                Compra #{f.folio}
              </Badge>
              <CompraEstadoBadge estado={f.estado} />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {f.gasto.categoria === "PERSONAL_DUENO" ? "Personal dueño" : f.gasto.categoria}
              {f.gasto.compra_rol && <CompraRolBadge rol={f.gasto.compra_rol} />}
              {f.gasto.duplicado_sospechado && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                  Duplicado?
                </Badge>
              )}
              {f.gasto.requiere_visto_bueno === true && (
                <Badge
                  variant="outline"
                  className="border-sky-500/50 text-sky-600"
                  title="Prellenado con IA desde la app: pendiente del visto bueno de administración (menú ⋯ → Dar visto bueno)."
                >
                  Visto bueno
                </Badge>
              )}
            </span>
          ),
      },
      {
        // Descripción/motivo a la vista (pedido oficina 20-ago): la primera
        // línea de la nota — antes había que abrir Verificar/editar para
        // leerla. El hover muestra la nota completa.
        key: "descripcion",
        header: "Descripción",
        cell: (f) => {
          if (f.kind === "compra") {
            const texto = [f.proveedor, f.referencia].filter(Boolean).join(" · ");
            return texto ? (
              <span className="block max-w-[240px] truncate text-xs" title={texto}>
                {texto}
              </span>
            ) : (
              GUION
            );
          }
          const linea = (f.gasto.notas ?? "").split("\n")[0].trim();
          return linea ? (
            <span
              className="block max-w-[240px] truncate text-xs text-muted-foreground"
              title={f.gasto.notas ?? undefined}
            >
              {linea}
            </span>
          ) : (
            GUION
          );
        },
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        // El monto ES el total pagado (ticket + propina): lo que llega al
        // banco. La propina solo se anota como sub-línea informativa.
        cell: (f) =>
          f.kind === "compra" ? (
            <span className="font-medium">
              {f.totales.map((t) => (
                <span key={t.moneda} className="block">
                  {fmtMoney(t.total, t.moneda)}
                </span>
              ))}
            </span>
          ) : (
            <>
              {fmtMoney(f.gasto.monto, f.gasto.moneda)}
              {Number(f.gasto.propina ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  incl. propina {fmtMoney(f.gasto.propina!, f.gasto.moneda)}
                </p>
              )}
            </>
          ),
      },
      {
        key: "pago",
        header: "Pago",
        cellClassName: "whitespace-nowrap",
        cell: (f) =>
          f.kind === "compra" ? (
            f.nPagos !== null && f.nPagos > f.pagos.length ? (
              // El API sabe cuántos pagos tiene la compra; aquí solo llegaron
              // los que caben en el filtro/corte: el conteo y los totales del
              // grupo son parciales y hay que decirlo.
              <span
                className="text-xs text-amber-600"
                title="La compra tiene pagos que no entran en el filtro o en el corte de esta vista; los totales del grupo son parciales. Abre la compra para verlos todos."
              >
                {f.pagos.length} de {f.nPagos} pagos
                <span className="block text-[10px]">(parcial: hay pagos fuera de este filtro)</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {f.pagos.length} {f.pagos.length === 1 ? "pago" : "pagos"}
              </span>
            )
          ) : (
            <span className="text-xs">
              {MEDIO_PAGO_LABELS[f.gasto.medio_pago] ?? f.gasto.medio_pago}
              {f.gasto.medio_pago === "TARJETA_CORP" && f.gasto.tarjeta_terminacion && (
                <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                  **** {f.gasto.tarjeta_terminacion}
                </span>
              )}
            </span>
          ),
      },
      {
        key: "avion",
        header: "Avión",
        cell: (f) =>
          f.kind === "compra" ? (
            GUION
          ) : f.gasto.aeronave?.matricula ? (
            <span className="font-mono">{f.gasto.aeronave.matricula}</span>
          ) : (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Pendiente
            </Badge>
          ),
      },
      {
        key: "vuelo",
        header: "Vuelo",
        cell: (f) =>
          f.kind === "gasto" && f.gasto.vuelo_id ? (
            <Link
              href={`/admin/flights/${f.gasto.vuelo_id}`}
              className="font-mono text-brand-600 hover:underline"
            >
              #{f.gasto.vuelo?.folio ?? "ver"}
            </Link>
          ) : (
            GUION
          ),
      },
      {
        key: "capturo",
        header: "Capturó",
        cellClassName: "text-muted-foreground",
        cell: (f) =>
          f.kind === "compra" ? (
            GUION
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {f.gasto.captura?.nombre ?? "—"}
              {f.gasto.origen && ORIGEN_BADGE[f.gasto.origen] && (
                <Badge variant="outline" className={ORIGEN_BADGE[f.gasto.origen].cls}>
                  {ORIGEN_BADGE[f.gasto.origen].label}
                </Badge>
              )}
            </span>
          ),
      },
      {
        key: "comprobante",
        header: "Comp.",
        cell: (f) => {
          if (f.kind === "compra") return GUION;
          const g = f.gasto;
          return (
            <div className="flex items-center gap-2">
              {g.foto_url && fotoUrls[g.foto_url] && (
                <ComprobantePreview
                  path={g.foto_url}
                  url={fotoUrls[g.foto_url]}
                  alt={`Comprobante · ${g.categoria}`}
                />
              )}
              <Badge variant="outline" className={ESTATUS_STYLE[g.estatus_comprobante] ?? ""}>
                {g.estatus_comprobante === "SIN_COMPROBANTE"
                  ? "Sin comp."
                  : g.estatus_comprobante === "VALE"
                    ? "Vale"
                    : "Factura"}
              </Badge>
              {/* Sello de confirmación del panel (opcional: skew de deploy). */}
              {g.verificado_at && (
                <span
                  className="text-emerald-600 dark:text-emerald-400"
                  title={`Confirmado por ${verificadorNombre(g) ?? "oficina"} · ${fmtDate(g.verificado_at)}`}
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
        // ago 2026): semáforo de un clic, independiente del comprobante.
        key: "facturacion",
        header: "Facturación",
        cell: (f) => (f.kind === "compra" ? GUION : <FacturacionBadge gasto={f.gasto} />),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        cell: (f) =>
          f.kind === "compra" ? (
            <Link
              href={`/admin/inventory/compras/${f.compraId}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-600 hover:bg-muted"
              title="Abrir la compra"
            >
              Ver compra
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <ExpenseActions
              gasto={f.gasto}
              aircraft={aircraft}
              providers={providers}
              fotoUrl={f.gasto.foto_url ? fotoUrls[f.gasto.foto_url] : undefined}
            />
          ),
      },
    );
    return cols;
  }, [aircraft, providers, fotoUrls, seleccion]);

  return (
    <DataTable
      columns={columns}
      rows={filas}
      rowKey={(f) => f.key}
      huboCorte={huboCorte}
      rowClassName={(f) =>
        f.kind === "compra" ? "bg-brand-600/5" : f.hijo ? "bg-muted/30" : undefined
      }
      // Los pagos van pegados al grupo (no se paginan ni se filtran sueltos).
      subRows={(f) => (f.kind === "compra" && f.abierta ? f.hijos : undefined)}
      searchText={(f) => {
        if (f.kind === "compra") {
          return [
            `compra #${f.folio}`,
            f.proveedor ?? "",
            f.referencia ?? "",
            ...f.pagos.map(textoGasto),
          ].join(" ");
        }
        return textoGasto(f.gasto);
      }}
      searchPlaceholder="Buscar gasto (proveedor, categoría, matrícula, descripción, compra)…"
    />
  );
}

function textoGasto(g: Gasto): string {
  return [
    g.categoria,
    // El label mostrado también se indexa ("personal dueño" con espacio
    // no es substring de PERSONAL_DUENO).
    g.categoria === "PERSONAL_DUENO" ? "Personal dueño" : "",
    g.proveedor?.nombre ?? "",
    g.aeronave?.matricula ?? "",
    g.lugar ?? "",
    g.vuelo?.folio ?? "",
    g.captura?.nombre ?? "",
    g.tarjeta_terminacion ?? "",
    g.notas ?? "",
    g.compra ? `compra #${g.compra.folio}` : "",
  ].join(" ");
}

export const MEDIO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CORP: "Tarjeta corporativa",
  TRANSFERENCIA: "Transferencia",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  BODEGA: "Bodega",
};
