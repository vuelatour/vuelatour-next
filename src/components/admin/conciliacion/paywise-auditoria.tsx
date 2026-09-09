"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { Field } from "@/components/admin/form-field";
import {
  CobroFormSheet,
  type CobroPrefill,
} from "@/components/admin/flights/cobro-form-sheet";
import {
  conciliarPaywiseAction,
  vueloParaCobroAction,
  type VueloParaCobro,
} from "@/app/admin/conciliacion/actions";
import {
  buscarVuelosCercanosAction,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { descargarDelApi } from "@/lib/download";
import { fmtDate, fmtDateOnly } from "@/lib/datetime";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { pendienteCobro } from "@/lib/admin/cobros";
import { cn } from "@/lib/utils";
import type {
  PaywiseAmbiguo,
  PaywiseAuditoria,
  PaywiseCobro,
  PaywiseCruce,
  PaywiseMovimiento,
} from "@/types/conciliacion";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const fmtMoney = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CRITERIO_LABEL: Record<PaywiseCruce["criterio"], string> = {
  YA_CONCILIADO: "Ya conciliado",
  NETO: "Cuadra por neto",
  BRUTO: "Cuadra por bruto",
  REFERENCIA: "Misma referencia",
};

/** Liga al vuelo o al grupo de un cobro del sistema. */
function hrefCobro(c: PaywiseCobro): string | null {
  if (c.tipo === "SOBRE_GRUPO") return c.grupo_id ? `/admin/quotes/grupo/${c.grupo_id}` : null;
  return c.vuelo_id ? `/admin/flights/${c.vuelo_id}` : null;
}

function QuienCobro({ c }: { c: PaywiseCobro }) {
  const href = hrefCobro(c);
  const texto =
    c.tipo === "SOBRE_GRUPO"
      ? `Grupo ${folioTexto(c.grupo_folio ?? null)}`
      : `Vuelo #${c.folio ?? "—"}`;
  return (
    <span className="block">
      {href ? (
        <Link href={href} className="text-brand-600 hover:underline">
          {texto}
        </Link>
      ) : (
        texto
      )}
      {c.cliente && (
        <span className="block truncate text-[10px] text-muted-foreground max-w-[200px]">
          {c.cliente}
        </span>
      )}
    </span>
  );
}

/** Comisión del archivo (directa o bruto − neto) de un abono de Paywise. */
function comisionDeMov(m: PaywiseMovimiento): number | null {
  if (m.comision_monto != null && Number.isFinite(Number(m.comision_monto)))
    return Number(m.comision_monto);
  if (m.monto_bruto != null && Number.isFinite(Number(m.monto_bruto)))
    return Math.round((Number(m.monto_bruto) - m.monto) * 100) / 100;
  return null;
}

interface PaywiseAuditoriaPanelProps {
  auditoria: PaywiseAuditoria | null;
  /** Mensaje del API cuando no se pudo armar (p. ej. sin cuenta PASARELA). */
  error: string | null;
  desde: string;
  hasta: string;
  dias: number;
  cuentaId: string;
  /** Cuentas PASARELA (para acotar la auditoría a una). */
  cuentasPasarela: { id: string; label: string; moneda: string }[];
  /** Comisión % sugerida al registrar un cobro Paywise (config). */
  paywiseComisionPct?: number;
}

/**
 * Auditoría Paywise (pedido del cliente 9-sep-2026): «cuando subamos los
 * estados de cuenta de Paywise, comparar si todos los movimientos
 * coinciden». Pinta el resultado del API (cruce NETO → BRUTO → referencia a
 * ±días): coinciden (verde, con comisión), comisión distinta (ámbar), en
 * Paywise sin cobro (ámbar, «Registrar cobro» prellenado), cobros sin
 * movimiento (rojo), referencia con monto distinto y ambiguos. «Conciliar
 * los que cuadran» liga los NETO/BRUTO exactos; «Descargar reporte» baja el
 * Excel de 3 hojas. El panel NO cruza nada: solo pinta lo del API.
 */
export function PaywiseAuditoriaPanel({
  auditoria,
  error,
  desde,
  hasta,
  dias,
  cuentaId,
  cuentasPasarela,
  paywiseComisionPct,
}: PaywiseAuditoriaPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [descargando, setDescargando] = useState(false);
  const [confirmarConciliar, setConfirmarConciliar] = useState(false);
  // «Registrar cobro» desde un abono de Paywise sin cobro.
  const [movARegistrar, setMovARegistrar] = useState<PaywiseMovimiento | null>(null);

  const query = useMemo(
    () => ({
      desde,
      hasta,
      dias,
      ...(cuentaId ? { cuenta_bancaria_id: cuentaId } : {}),
    }),
    [desde, hasta, dias, cuentaId],
  );

  const conciliables = auditoria?.resumen.conciliables ?? 0;

  const conciliar = () => {
    startTransition(async () => {
      const res = await conciliarPaywiseAction(query);
      setConfirmarConciliar(false);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo conciliar");
        return;
      }
      const n = res.data.resumen.conciliados_ahora;
      const errs = res.data.errores.length;
      if (n === 0 && errs === 0) {
        toast.info("No había cruces exactos pendientes de conciliar.");
      } else {
        toast.success(
          `Conciliados ${n} abono(s) de Paywise` +
            (errs > 0 ? ` · ${errs} no se pudieron ligar (ver detalle abajo)` : ""),
          { duration: 8000 },
        );
      }
      if (errs > 0) {
        for (const e of res.data.errores.slice(0, 3)) {
          toast.error(`Abono ${e.movimiento_id.slice(0, 8)}: ${e.error}`, { duration: 10000 });
        }
      }
      router.refresh();
    });
  };

  const descargar = async () => {
    setDescargando(true);
    const err = await descargarDelApi("/v1/conciliacion/paywise/auditoria.xlsx", {
      filename: `auditoria-paywise-${desde}-a-${hasta}.xlsx`,
      query: {
        desde,
        hasta,
        dias: String(dias),
        cuenta_bancaria_id: cuentaId || undefined,
      },
    });
    if (err) toast.error("No se pudo generar el reporte", { description: err });
    setDescargando(false);
  };

  // ---- columnas ----
  const colsCruce = useMemo<DataTableColumn<PaywiseCruce>[]>(
    () => [
      {
        key: "fecha",
        header: "Fecha Paywise",
        cellClassName: "whitespace-nowrap",
        cell: (c) => fmtDateOnly(c.movimiento.fecha),
      },
      {
        key: "ref",
        header: "Referencia",
        cellClassName: "font-mono text-xs",
        cell: (c) => c.movimiento.referencia ?? c.cobro.referencia ?? "—",
      },
      { key: "quien", header: "Vuelo / Grupo", noLink: true, cell: (c) => <QuienCobro c={c.cobro} /> },
      {
        key: "fcobro",
        header: "Fecha cobro",
        cellClassName: "whitespace-nowrap",
        cell: (c) => (
          <span>
            {fmtDate(c.cobro.fecha_cobro)}
            {c.dif_dias > 0 && (
              <span className="block text-[10px] text-muted-foreground">
                {c.dif_dias} día{c.dif_dias === 1 ? "" : "s"} de diferencia
              </span>
            )}
          </span>
        ),
      },
      {
        key: "bruto",
        header: "Bruto",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (c) => (
          <span>
            {fmtMoney(c.cobro.monto)}
            {c.dif_bruto != null && Math.abs(c.dif_bruto) > 0.01 && (
              <span className="block text-[10px] text-amber-600">
                Paywise {fmtMoney(c.movimiento.monto_bruto)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "comision",
        header: "Comisión sistema / Paywise",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (c) => (
          <span className={cn(c.comision_distinta && "text-amber-600 dark:text-amber-400")}>
            {fmtMoney(c.comision_sistema)} / {fmtMoney(c.comision_paywise)}
            {c.dif_comision != null && Math.abs(c.dif_comision) > 0.01 && (
              <span className="block text-[10px]">
                dif. {c.dif_comision > 0 ? "+" : ""}
                {fmtMoney(c.dif_comision)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "neto",
        header: "Neto depositado",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (c) => (
          <span>
            {fmtMoney(c.movimiento.monto)} {c.movimiento.moneda ?? c.cobro.moneda}
            {Math.abs(c.dif_neto) > 0.01 && (
              <span className="block text-[10px] text-muted-foreground">
                sistema esperaba {fmtMoney(c.neto_sistema)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "estatus",
        header: "Estatus",
        cell: (c) => (
          <Badge
            variant="outline"
            className={
              c.criterio === "YA_CONCILIADO"
                ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                : c.criterio === "REFERENCIA"
                  ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
                  : "border-sky-500/50 text-sky-600 dark:text-sky-400"
            }
          >
            {CRITERIO_LABEL[c.criterio]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const colsSoloPaywise = useMemo<DataTableColumn<PaywiseMovimiento>[]>(
    () => [
      {
        key: "fecha",
        header: "Fecha Paywise",
        cellClassName: "whitespace-nowrap",
        cell: (m) => fmtDateOnly(m.fecha),
      },
      { key: "ref", header: "Referencia", cellClassName: "font-mono text-xs", cell: (m) => m.referencia ?? "—" },
      {
        key: "desc",
        header: "Descripción",
        cellClassName: "text-muted-foreground truncate max-w-[260px]",
        cell: (m) => m.descripcion ?? "—",
      },
      {
        key: "bruto",
        header: "Bruto",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (m) => fmtMoney(m.monto_bruto),
      },
      {
        key: "comision",
        header: "Comisión",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums text-muted-foreground",
        cell: (m) => fmtMoney(comisionDeMov(m)),
      },
      {
        key: "neto",
        header: "Neto depositado",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (m) => `${fmtMoney(m.monto)} ${m.moneda ?? ""}`,
      },
      {
        key: "accion",
        header: "",
        noLink: true,
        cell: (m) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setMovARegistrar(m)}
            title="Registra el cobro Paywise en el vuelo que corresponda, prellenado con este abono"
          >
            <BanknotesIcon className="h-4 w-4" />
            Registrar cobro
          </Button>
        ),
      },
    ],
    [],
  );

  const colsSoloSistema = useMemo<DataTableColumn<PaywiseCobro>[]>(
    () => [
      {
        key: "fecha",
        header: "Fecha cobro",
        cellClassName: "whitespace-nowrap",
        cell: (c) => fmtDate(c.fecha_cobro),
      },
      { key: "quien", header: "Vuelo / Grupo", noLink: true, cell: (c) => <QuienCobro c={c} /> },
      { key: "ref", header: "Referencia", cellClassName: "font-mono text-xs", cell: (c) => c.referencia ?? "—" },
      {
        key: "bruto",
        header: "Bruto",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (c) => `${fmtMoney(c.monto)} ${c.moneda}`,
      },
      {
        key: "comision",
        header: "Comisión registrada",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums text-muted-foreground",
        cell: (c) => fmtMoney(c.comision_banco_monto ?? 0),
      },
      {
        key: "neto",
        header: "Neto esperado",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (c) => fmtMoney(c.monto - (c.comision_banco_monto ?? 0)),
      },
    ],
    [],
  );

  const colsAmbiguos = useMemo<DataTableColumn<PaywiseAmbiguo>[]>(
    () => [
      {
        key: "fecha",
        header: "Fecha Paywise",
        cellClassName: "whitespace-nowrap",
        cell: (a) => fmtDateOnly(a.movimiento.fecha),
      },
      { key: "ref", header: "Referencia", cellClassName: "font-mono text-xs", cell: (a) => a.movimiento.referencia ?? "—" },
      {
        key: "neto",
        header: "Neto depositado",
        headClassName: "text-right",
        cellClassName: "text-right font-mono tabular-nums",
        cell: (a) => `${fmtMoney(a.movimiento.monto)} ${a.movimiento.moneda ?? ""}`,
      },
      {
        key: "cands",
        header: "Cobros candidatos (empate)",
        noLink: true,
        cell: (a) => (
          <span className="flex flex-wrap gap-2">
            {a.candidatos.map((c) => {
              const href = hrefCobro(c);
              const texto =
                c.tipo === "SOBRE_GRUPO"
                  ? `Grupo ${folioTexto(c.grupo_folio ?? null)}`
                  : `Vuelo #${c.folio ?? "—"}`;
              return href ? (
                <Link key={`${c.tipo}:${c.id}`} href={href} className="text-brand-600 hover:underline">
                  {texto} · {fmtDate(c.fecha_cobro)}
                </Link>
              ) : (
                <span key={`${c.tipo}:${c.id}`}>{texto}</span>
              );
            })}
          </span>
        ),
      },
    ],
    [],
  );

  const r = auditoria?.resumen;

  return (
    <div className="space-y-4">
      {/* Filtros del periodo (GET: la página vuelve a armar la auditoría). */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" action="/admin/conciliacion" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="f" value="paywise" />
            <div className="space-y-1.5">
              <label htmlFor="pw-desde" className="text-sm font-medium">
                Desde
              </label>
              <input id="pw-desde" name="desde" type="date" className={inputCls} defaultValue={desde} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pw-hasta" className="text-sm font-medium">
                Hasta
              </label>
              <input id="pw-hasta" name="hasta" type="date" className={inputCls} defaultValue={hasta} required />
            </div>
            {cuentasPasarela.length > 1 && (
              <div className="space-y-1.5 min-w-[200px]">
                <label htmlFor="pw-cuenta" className="text-sm font-medium">
                  Cuenta Paywise
                </label>
                <select id="pw-cuenta" name="cuenta" className={inputCls} defaultValue={cuentaId}>
                  <option value="">Todas las pasarelas</option>
                  {cuentasPasarela.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="submit" variant="outline" className="gap-2">
              <ArrowPathIcon className="h-4 w-4" />
              Auditar
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={descargar}
                disabled={descargando || !auditoria}
              >
                <TableCellsIcon className="h-4 w-4" />
                {descargando ? "Generando…" : "Descargar reporte"}
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => setConfirmarConciliar(true)}
                disabled={pending || !auditoria || conciliables === 0}
                title={
                  conciliables === 0
                    ? "No hay cruces exactos pendientes"
                    : "Liga los abonos que cuadran por neto o bruto con su cobro"
                }
              >
                <CheckCircleIcon className="h-4 w-4" />
                {pending ? "Conciliando…" : `Conciliar los que cuadran (${conciliables})`}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Se comparan los abonos importados de Paywise del periodo con los cobros registrados con
            método Paywise (±{dias} días, por neto depositado, bruto y referencia). Al conciliar, la
            comisión real de Paywise se escribe en el cobro del vuelo.
          </p>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
              No se pudo armar la auditoría
            </CardTitle>
            <CardDescription>
              {error}{" "}
              <Link href="/admin/bank-accounts" className="underline underline-offset-2">
                Ir a Cuentas bancarias
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {auditoria && r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Abonos Paywise"
              value={String(r.movimientos_paywise)}
              sub={`neto $${fmtMoney(r.neto_paywise)}`}
            />
            <Tile
              label="Coinciden"
              value={String(r.coinciden)}
              sub={`${r.ya_conciliados} ya conciliados · ${r.conciliables} por conciliar`}
              tone="ok"
            />
            <Tile
              label="En Paywise sin cobro"
              value={String(r.solo_paywise)}
              sub={`neto $${fmtMoney(r.neto_solo_paywise)}`}
              tone={r.solo_paywise > 0 ? "warn" : "muted"}
            />
            <Tile
              label="Cobros sin Paywise"
              value={String(r.solo_sistema)}
              sub={`bruto $${fmtMoney(r.bruto_solo_sistema)}`}
              tone={r.solo_sistema > 0 ? "bad" : "muted"}
            />
          </div>
          {(r.comision_distinta > 0 ||
            r.referencia_monto_distinto > 0 ||
            r.ambiguos > 0 ||
            r.movimientos_conciliados_fuera > 0 ||
            r.cobros_conciliados_fuera > 0) && (
            <p className="text-xs text-muted-foreground">
              {r.comision_distinta > 0 && (
                <>
                  {r.comision_distinta} con comisión distinta (dif. total $
                  {fmtMoney(r.dif_comision_total)}) ·{" "}
                </>
              )}
              {r.referencia_monto_distinto > 0 && (
                <>{r.referencia_monto_distinto} con misma referencia y monto distinto · </>
              )}
              {r.ambiguos > 0 && <>{r.ambiguos} ambiguos · </>}
              {r.movimientos_conciliados_fuera > 0 && (
                <>{r.movimientos_conciliados_fuera} abonos ligados a cobros fuera del periodo · </>
              )}
              {r.cobros_conciliados_fuera > 0 && (
                <>{r.cobros_conciliados_fuera} cobros ya conciliados en otro periodo</>
              )}
            </p>
          )}

          <Seccion
            titulo="Coinciden"
            tono="ok"
            count={auditoria.coinciden.length}
            descripcion="Abono de Paywise y cobro del sistema que cuadran (ya conciliados o por conciliar). La comisión en ámbar difiere de la registrada: al conciliar se escribe la real."
          >
            <DataTable
              rows={auditoria.coinciden}
              columns={colsCruce}
              rowKey={(c) => `${c.movimiento.id}:${c.cobro.id}`}
              rowClassName={(c) => (c.comision_distinta ? "bg-amber-500/5" : undefined)}
              searchText={(c) =>
                `${c.movimiento.referencia ?? ""} ${c.cobro.folio ?? ""} ${c.cobro.grupo_folio ?? ""} ${c.cobro.cliente ?? ""} ${c.movimiento.monto}`
              }
              searchPlaceholder="Buscar (referencia, folio, cliente, monto)…"
              syncId="pwc"
            />
          </Seccion>

          {auditoria.comision_distinta.length > 0 && (
            <Seccion
              titulo="Comisión distinta"
              tono="warn"
              count={auditoria.comision_distinta.length}
              descripcion="Cuadran, pero la comisión que retuvo Paywise (o el bruto) no es la que se registró en el cobro. Al conciliar, el cobro toma la comisión real del estado de cuenta."
            >
              <DataTable
                rows={auditoria.comision_distinta}
                columns={colsCruce}
                rowKey={(c) => `${c.movimiento.id}:${c.cobro.id}`}
                syncId="pwd"
              />
            </Seccion>
          )}

          <Seccion
            titulo="En Paywise sin cobro"
            tono={auditoria.solo_paywise.length > 0 ? "warn" : "muted"}
            count={auditoria.solo_paywise.length}
            descripcion="Abonos de Paywise sin ningún cobro Paywise del sistema que cuadre en la ventana. Regístralo en su vuelo (prellenado con bruto, comisión, fecha y referencia) y vuelve a conciliar."
          >
            <DataTable
              rows={auditoria.solo_paywise}
              columns={colsSoloPaywise}
              rowKey={(m) => m.id}
              searchText={(m) => `${m.referencia ?? ""} ${m.descripcion ?? ""} ${m.monto}`}
              searchPlaceholder="Buscar abono (referencia, descripción, monto)…"
              syncId="pws"
            />
          </Seccion>

          <Seccion
            titulo="Cobros sin movimiento en Paywise"
            tono={auditoria.solo_sistema.length > 0 ? "bad" : "muted"}
            count={auditoria.solo_sistema.length}
            descripcion="Cobros registrados con método Paywise que no aparecen en el estado de cuenta del periodo (±días). Puede faltar el periodo por importar, la liquidación llegar después, o el cobro nunca entró a Paywise."
          >
            <DataTable
              rows={auditoria.solo_sistema}
              columns={colsSoloSistema}
              rowKey={(c) => `${c.tipo}:${c.id}`}
              searchText={(c) =>
                `${c.folio ?? ""} ${c.grupo_folio ?? ""} ${c.cliente ?? ""} ${c.referencia ?? ""} ${c.monto}`
              }
              searchPlaceholder="Buscar cobro (folio, cliente, referencia, monto)…"
              syncId="pwx"
            />
          </Seccion>

          {auditoria.referencia_monto_distinto.length > 0 && (
            <Seccion
              titulo="Misma referencia, monto distinto"
              tono="warn"
              count={auditoria.referencia_monto_distinto.length}
              descripcion="La referencia coincide pero el dinero no cuadra: se reporta y NO se liga solo. Revisa el monto del cobro o del abono y concilia a mano desde Movimientos."
            >
              <DataTable
                rows={auditoria.referencia_monto_distinto}
                columns={colsCruce}
                rowKey={(c) => `${c.movimiento.id}:${c.cobro.id}`}
                syncId="pwr"
              />
            </Seccion>
          )}

          {auditoria.ambiguos.length > 0 && (
            <Seccion
              titulo="Ambiguos"
              tono="muted"
              count={auditoria.ambiguos.length}
              descripcion="Más de un cobro cuadra igual de bien con el mismo abono: la oficina decide cuál es y lo vincula a mano desde Movimientos."
            >
              <DataTable
                rows={auditoria.ambiguos}
                columns={colsAmbiguos}
                rowKey={(a) => a.movimiento.id}
                syncId="pwa"
              />
            </Seccion>
          )}
        </>
      )}

      {/* Confirmación antes de escribir (liga abonos y comisiones). */}
      <Dialog open={confirmarConciliar} onOpenChange={setConfirmarConciliar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Conciliar {conciliables} abono(s) de Paywise?</DialogTitle>
            <DialogDescription>
              Se ligará cada abono que cuadra exacto (por neto o por bruto) con su cobro y, en los
              cobros de vuelo, se escribirá la comisión real que retuvo Paywise. Los ambiguos y los
              de referencia con monto distinto no se tocan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarConciliar(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={conciliar} disabled={pending} className="gap-2">
              <CheckCircleIcon className="h-4 w-4" />
              {pending ? "Conciliando…" : "Conciliar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {movARegistrar && (
        <RegistrarCobroDesdePaywise
          movimiento={movARegistrar}
          onClose={() => setMovARegistrar(null)}
          paywiseComisionPct={paywiseComisionPct}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={cn("text-lg font-semibold mt-1", color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Seccion({
  titulo,
  descripcion,
  count,
  tono,
  children,
}: {
  titulo: string;
  descripcion: string;
  count: number;
  tono: "ok" | "warn" | "bad" | "muted";
  children: React.ReactNode;
}) {
  const borde =
    tono === "ok"
      ? "border-emerald-500/40"
      : tono === "warn"
        ? "border-amber-500/40"
        : tono === "bad"
          ? "border-red-500/40"
          : "border-border";
  const dot =
    tono === "ok"
      ? "bg-emerald-500"
      : tono === "warn"
        ? "bg-amber-400"
        : tono === "bad"
          ? "bg-red-500"
          : "bg-muted-foreground/40";
  return (
    <Card className={borde}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", dot)} />
          {titulo}
          <Badge variant="secondary" className="font-mono">
            {count}
          </Badge>
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Nada aquí.</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/**
 * «Registrar cobro» desde un abono de Paywise sin cobro: elige el vuelo
 * (±15 días de la fecha del abono) y abre el MISMO formulario de cobro del
 * detalle del vuelo prellenado con el abono (método Paywise, bruto,
 * comisión, fecha, referencia, cuenta Paywise). Tras guardar, «Conciliar los
 * que cuadran» liga el abono.
 */
function RegistrarCobroDesdePaywise({
  movimiento,
  onClose,
  paywiseComisionPct,
}: {
  movimiento: PaywiseMovimiento;
  onClose: () => void;
  paywiseComisionPct?: number;
}) {
  const router = useRouter();
  const [vuelos, setVuelos] = useState<VueloCercano[] | null>(null);
  const [vueloId, setVueloId] = useState("");
  const [ctx, setCtx] = useState<VueloParaCobro | null>(null);
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Vuelos alrededor de la fecha del abono (una carga por abono).
  useEffect(() => {
    let cancelado = false;
    void buscarVuelosCercanosAction(movimiento.fecha).then((res) => {
      if (cancelado) return;
      if (res.ok && res.data) setVuelos(res.data);
      else {
        setVuelos([]);
        toast.error(res.error ?? "No se pudieron cargar los vuelos");
      }
    });
    return () => {
      cancelado = true;
    };
  }, [movimiento.fecha]);

  const continuar = () => {
    if (!vueloId) {
      toast.error("Elige el vuelo al que corresponde el cobro");
      return;
    }
    startTransition(async () => {
      const res = await vueloParaCobroAction(vueloId);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo cargar el vuelo");
        return;
      }
      setCtx(res.data);
      setSheetOpen(true);
    });
  };

  const bruto = movimiento.monto_bruto != null ? Number(movimiento.monto_bruto) : null;
  const comision = comisionDeMov(movimiento);
  const prefill: CobroPrefill = {
    metodo_cobro: "PAYWISE",
    // El cobro se registra BRUTO (lo que pagó el cliente); la comisión va aparte.
    monto: bruto != null && bruto > 0 ? bruto : movimiento.monto,
    moneda: movimiento.moneda === "USD" ? "USD" : "MXN",
    comision_banco_monto: comision != null && comision > 0 ? comision : undefined,
    referencia: movimiento.referencia ?? undefined,
    cuenta_destino: "Paywise",
    fecha_cobro: movimiento.fecha,
    notas: movimiento.descripcion ? `Paywise: ${movimiento.descripcion}` : undefined,
  };

  const opciones = (vuelos ?? []).map((v) => ({
    value: v.id,
    label: `#${v.folio ?? "—"} · ${v.ruta ?? ""}${v.matricula ? ` · ${v.matricula}` : ""}`,
    description: `${v.fecha ? fmtDate(v.fecha) : "sin fecha"}${v.estado === "CANCELADO" ? " · CANCELADO" : ""}`,
  }));

  return (
    <>
      <Dialog open={!sheetOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar cobro Paywise</DialogTitle>
            <DialogDescription>
              Abono del {fmtDateOnly(movimiento.fecha)}
              {movimiento.referencia ? ` · ref. ${movimiento.referencia}` : ""} · neto $
              {fmtMoney(movimiento.monto)}
              {bruto != null ? ` (bruto $${fmtMoney(bruto)}` : ""}
              {bruto != null && comision != null ? `, comisión $${fmtMoney(comision)})` : bruto != null ? ")" : ""}
              . Elige el vuelo y el formulario se abre prellenado.
            </DialogDescription>
          </DialogHeader>
          <Field label="Vuelo" required hint="Vuelos a ±15 días de la fecha del abono.">
            <SearchableSelect
              options={opciones}
              value={vueloId}
              onChange={setVueloId}
              placeholder={vuelos && vuelos.length === 0 ? "Sin vuelos cerca de esa fecha" : "Elige el vuelo"}
              searchPlaceholder="Buscar por folio, ruta o matrícula…"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={continuar} disabled={pending || !vueloId} className="gap-2">
              <BanknotesIcon className="h-4 w-4" />
              {pending ? "Cargando…" : "Continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ctx && (
        <CobroFormSheet
          open={sheetOpen}
          onOpenChange={(o) => {
            setSheetOpen(o);
            if (!o) onClose();
          }}
          flightId={ctx.id}
          flightFolio={ctx.folio}
          montoTotalUsd={ctx.monto_total_usd}
          pendingUsd={
            ctx.estado === "CANCELADO" ? 0 : pendienteCobro(ctx.monto_total_usd, ctx.total_cobrado)
          }
          cancelado={ctx.estado === "CANCELADO"}
          tcCotizacion={ctx.tc_usd_mxn}
          paywiseComisionPct={paywiseComisionPct}
          prefill={prefill}
          onRegistrado={() => {
            toast.info("Cobro registrado. Usa «Conciliar los que cuadran» para ligarlo al abono.", {
              duration: 8000,
            });
            router.refresh();
          }}
        />
      )}
    </>
  );
}
