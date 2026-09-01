"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  ChartBarIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/admin/empty-state";
import { Field } from "@/components/admin/form-field";
import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { fmtInt, fmtUsd } from "@/lib/format";
import { capturarIaSaldoAction } from "@/app/admin/configuracion/actions";
import type { IaUsoResumen } from "@/lib/api/ia-uso-server";

/** Primer mes con registro en `ia_uso` (antes no hay nada que consultar). */
const MES_INICIO_REGISTRO = "2026-09";

const CONSOLE_URL = "https://console.anthropic.com/settings/billing";

/**
 * Etiquetas es-MX por categoría de llamada de IA. Fallback = clave cruda: una
 * categoría nueva en pyservices aparece sola sin tocar el panel.
 */
const CATEGORIA_LABELS: Record<string, string> = {
  TACOMETRO: "Lectura de tacómetro",
  GASTO_TICKET: "Ticket de gasto",
  REANALISIS: "Reanálisis de comprobante",
  CONSTANCIA_FISCAL: "Constancia fiscal",
  COMBUSTIBLE_TICKET: "Ticket de combustible",
  INVENTARIO_ITEM: "Ficha de inventario",
  COMPRA_PDF: "PDF de compra",
  ESTADO_CUENTA_PDF: "Estado de cuenta PDF",
  CONCILIACION_SUGERIR: "Sugerencia de conciliación",
  GASTO_VUELO_SUGERIR: "Gasto→vuelo",
  VENCIMIENTO_DOC: "Documento de vencimiento",
};

/** Numérico defensivo: el API puede serializar `numeric` como string. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Costos chicos: hasta 4 decimales para no pintar "$0.00" en consumo real. */
const costoUsdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function fmtCostoUsd(v: unknown): string {
  return costoUsdFmt.format(num(v));
}

function nombreDelMes(mes: string): string {
  // Mediodía UTC: date-only sin corrimiento de día/mes por zona horaria.
  const d = new Date(`${mes}-15T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return mes;
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Diálogo de captura del saldo leído en console.anthropic.com. */
function ActualizarSaldoDialog({
  open,
  onOpenChange,
  checkpoint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  checkpoint: IaUsoResumen["checkpoint"];
}) {
  const [saldo, setSaldo] = useState("");
  const [notas, setNotas] = useState("");
  const [pending, startTransition] = useTransition();

  const numero = Number(saldo);
  const valido = saldo.trim() !== "" && Number.isFinite(numero) && numero >= 0;

  const guardar = () => {
    if (!valido || pending) return;
    startTransition(async () => {
      const res = await capturarIaSaldoAction({
        saldo_usd: numero,
        notas: notas.trim() || undefined,
      });
      if (res.ok) {
        toast.success(
          "Saldo capturado. La estimación se recalcula desde este punto.",
        );
        setSaldo("");
        setNotas("");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo capturar el saldo");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar saldo de créditos</DialogTitle>
          <DialogDescription>
            Entra a{" "}
            <a
              href={CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              console.anthropic.com
            </a>{" "}
            , copia el saldo de créditos que muestra y captúralo aquí. A partir
            de esta captura el sistema estima el saldo restando el consumo que
            registre.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {checkpoint && (
            <p className="text-xs text-muted-foreground rounded-lg border bg-muted/20 p-3">
              Última captura: <strong>{fmtUsd(checkpoint.saldo_usd)}</strong> el{" "}
              {fmtDateTime(checkpoint.created_at)}
              {checkpoint.notas ? ` — ${checkpoint.notas}` : ""}
            </p>
          )}
          <Field label="Saldo actual (USD)" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              disabled={pending}
            />
          </Field>
          <Field
            label="Notas"
            hint="Opcional. Por ejemplo: se recargaron $100 de créditos."
          >
            <Textarea
              rows={2}
              maxLength={500}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !valido}>
            {pending ? "Guardando…" : "Guardar saldo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IaCreditosSection({
  resumen,
  mes,
  mesActual,
}: {
  resumen: IaUsoResumen | null;
  mes: string;
  mesActual: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [capturando, setCapturando] = useState(false);

  const cambiarMes = useCallback(
    (v: string) => {
      const sp = new URLSearchParams(params.toString());
      if (v && v !== mesActual) sp.set("mes", v);
      else sp.delete("mes");
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router, mesActual],
  );

  // Serie por día del mes completo (rellena con 0 los días sin llamadas).
  const dias = useMemo(() => {
    if (!resumen) return [];
    const porDia = new Map(
      resumen.por_dia.map((d) => [d.fecha.slice(0, 10), d]),
    );
    const [y, m] = mes.split("-").map(Number);
    const nDias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: { fecha: string; dia: number; llamadas: number; costo: number }[] =
      [];
    for (let d = 1; d <= nDias; d++) {
      const fecha = `${mes}-${String(d).padStart(2, "0")}`;
      const row = porDia.get(fecha);
      out.push({
        fecha,
        dia: d,
        llamadas: num(row?.llamadas),
        costo: num(row?.costo_usd),
      });
    }
    return out;
  }, [resumen, mes]);

  const maxCosto = useMemo(
    () => dias.reduce((mx, d) => Math.max(mx, d.costo), 0),
    [dias],
  );

  const categorias = useMemo(
    () =>
      resumen
        ? [...resumen.por_categoria].sort(
            (a, b) => num(b.costo_usd) - num(a.costo_usd),
          )
        : [],
    [resumen],
  );

  const saldo = resumen?.saldo_estimado != null ? num(resumen.saldo_estimado) : null;
  // Umbral visual acordado: < $50 ámbar, < $20 rojo.
  const saldoClase =
    saldo == null
      ? "text-muted-foreground"
      : saldo < 20
        ? "text-red-600 dark:text-red-400"
        : saldo < 50
          ? "text-amber-600 dark:text-amber-400"
          : "";

  const encabezado = (
    <div className="pt-2">
      <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
        <SparklesIcon className="h-5 w-5 text-muted-foreground" />
        Créditos de IA (Anthropic)
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Lo que consumen las lecturas por IA (tacómetros, tickets, PDFs) y el
        saldo estimado de créditos.
      </p>
    </div>
  );

  const dialogo = (
    <ActualizarSaldoDialog
      open={capturando}
      onOpenChange={setCapturando}
      checkpoint={resumen?.checkpoint ?? null}
    />
  );

  // El fetch es best-effort: sin datos (endpoint caído o registro recién
  // estrenado) la sección no se cae — estado vacío y la captura de saldo
  // sigue disponible para dejar listo el punto de partida.
  if (!resumen) {
    return (
      <section className="space-y-4">
        {encabezado}
        <EmptyState
          icon={SparklesIcon}
          title="Aún sin datos"
          description="Aún sin datos — el registro comenzó el 1-sep-2026. En cuanto haya llamadas de IA registradas aquí verás el consumo por categoría y el saldo estimado."
        >
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button size="sm" onClick={() => setCapturando(true)}>
              <BanknotesIcon className="h-4 w-4 mr-1.5" />
              Actualizar saldo
            </Button>
            <a
              href={CONSOLE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline underline-offset-2 inline-flex items-center gap-1"
            >
              Ver saldo exacto en console.anthropic.com
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </EmptyState>
        {dialogo}
      </section>
    );
  }

  const total = resumen.total;

  return (
    <section className="space-y-4">
      {encabezado}

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* ── Card de SALDO ─────────────────────────────────────────── */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
              Saldo estimado
            </CardTitle>
            <CardDescription>
              {resumen.checkpoint
                ? `Según el saldo capturado el ${fmtDateTime(resumen.checkpoint.created_at)}.`
                : "Todavía no se captura un saldo de referencia."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className={`text-4xl font-semibold tracking-tight ${saldoClase}`}>
              {saldo != null ? fmtUsd(saldo) : "—"}
            </p>
            {resumen.checkpoint?.notas && (
              <p className="text-xs text-muted-foreground">
                Nota de la captura: {resumen.checkpoint.notas}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setCapturando(true)}>
                Actualizar saldo
              </Button>
              <a
                href={CONSOLE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-2 inline-flex items-center gap-1"
              >
                Ver saldo exacto en console.anthropic.com
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anthropic no expone el saldo por API: este número es una
              estimación (último saldo capturado menos el consumo registrado
              después). Una llamada que falla puede consumir créditos sin
              quedar registrada.
            </p>
          </CardContent>
        </Card>

        {/* ── Card de CONSUMO del periodo ───────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <ChartBarIcon className="h-4 w-4 text-muted-foreground" />
                Consumo de {nombreDelMes(mes)}
              </CardTitle>
              <CardDescription>
                Llamadas, tokens y costo estimado por tipo de lectura.
              </CardDescription>
            </div>
            <Input
              type="month"
              // key = valor: si el server corrige el mes (p. ej. uno futuro
              // en la URL), el input se re-monta con el vigente.
              key={mes}
              defaultValue={mes}
              min={MES_INICIO_REGISTRO}
              max={mesActual}
              onChange={(e) => e.target.value && cambiarMes(e.target.value)}
              className="w-44 shrink-0"
              aria-label="Mes del consumo"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {num(total.llamadas) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sin llamadas de IA registradas en {nombreDelMes(mes)}.
              </p>
            ) : (
              <>
                {/* Serie por día: barras simples con divs (sin librerías). */}
                <div>
                  <div className="flex items-end gap-px h-16">
                    {dias.map((d) => (
                      <div
                        key={d.fecha}
                        className="flex-1 flex flex-col justify-end h-full"
                        title={`${fmtDateOnly(d.fecha)} · ${fmtInt(d.llamadas)} llamada(s) · ${fmtCostoUsd(d.costo)}`}
                      >
                        <div
                          className={
                            d.costo > 0
                              ? "rounded-sm bg-primary/70"
                              : "rounded-sm bg-muted"
                          }
                          style={{
                            height:
                              d.costo > 0 && maxCosto > 0
                                ? `${Math.max((d.costo / maxCosto) * 100, 6)}%`
                                : "2px",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{dias[0]?.dia ?? ""}</span>
                    <span>Costo estimado por día (USD)</span>
                    <span>{dias[dias.length - 1]?.dia ?? ""}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Llamadas</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">
                          Costo estimado (USD)
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorias.map((c) => (
                        <TableRow key={c.categoria}>
                          <TableCell>
                            {CATEGORIA_LABELS[c.categoria] ?? c.categoria}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(num(c.llamadas))}
                          </TableCell>
                          <TableCell
                            className="text-right tabular-nums"
                            title={`Entrada: ${fmtInt(num(c.input_tokens))} · Salida: ${fmtInt(num(c.output_tokens))}`}
                          >
                            {fmtInt(num(c.input_tokens) + num(c.output_tokens))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtCostoUsd(c.costo_usd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">Total</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtInt(num(total.llamadas))}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums font-medium"
                          title={`Entrada: ${fmtInt(num(total.input_tokens))} · Salida: ${fmtInt(num(total.output_tokens))}`}
                        >
                          {fmtInt(
                            num(total.input_tokens) + num(total.output_tokens),
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtCostoUsd(total.costo_usd)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {dialogo}
    </section>
  );
}
