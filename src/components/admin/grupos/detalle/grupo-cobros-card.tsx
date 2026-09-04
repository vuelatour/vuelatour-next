"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  ChevronDownIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import {
  eliminarCobroGrupoAction,
  repartirCobroGrupoAction,
} from "@/app/admin/quotes/grupo/actions";
import { toastAvisos } from "@/lib/admin/avisos";
import { pendienteCobro, type EstadoCobroSemaforo } from "@/lib/admin/cobros";
import { etiquetaModoParticion, mensajeErrorGrupo } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtDate } from "@/lib/datetime";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GrupoDetalle, SobreSalida } from "@/types/grupos";
import { GrupoCobroDialog, type TipoSobre } from "./grupo-cobro-dialog";

/**
 * «Cobros del grupo» (Fase 2): los SOBRES de cobro — el pago único del
 * cliente que el API parte en un cobro por avión. Cabecera con total /
 * cobrado / saldo (del API) y semáforo del grupo (fuente única
 * estadoCobroSemaforo vía semaforoCobroGrupo, calculado en la página);
 * lista de sobres con fila expandible (partes por avión) y acciones:
 * Recibo (solo positivos; proxy /api/grupos/cobros/:id/recibo en pestaña
 * nueva), Re-partir (AlertDialog) y Eliminar (AlertDialog; si está
 * conciliado, explica que primero hay que desvincular en Conciliación).
 * Todo número que se pinta viene del API; aquí no se suma nada.
 */
export function GrupoCobrosCard({
  grupo,
  semaforo,
  puedeCobrar,
  puedeEliminar,
  tcOficial = null,
  tcOficialFecha = null,
}: {
  grupo: GrupoDetalle;
  /** Semáforo del grupo ya resuelto por la página (semaforoCobroGrupo). */
  semaforo: EstadoCobroSemaforo;
  /** ADMIN / COORDINADOR / FACTURACION: registrar, reembolsar, re-partir. */
  puedeCobrar: boolean;
  /** ADMIN / FACTURACION: eliminar un sobre (paridad con el cobro por vuelo). */
  puedeEliminar: boolean;
  tcOficial?: number | null;
  tcOficialFecha?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState<TipoSobre | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [aRepartir, setARepartir] = useState<SobreSalida | null>(null);
  const [aEliminar, setAEliminar] = useState<SobreSalida | null>(null);

  const sobres = grupo.cobros ?? [];
  const total = grupo.consolidado?.total_usd ?? 0;
  const cobrado = grupo.cobrado_usd ?? 0;
  const saldo = grupo.saldo_usd ?? 0;
  // Deuda REAL (tolerancia de redondeo de 1 USD): misma regla que la cabecera
  // de la página y que el semáforo (fuente única pendienteCobro).
  const pendiente = pendienteCobro(total, cobrado);
  const cancelado = grupo.estado === "CANCELADO" || grupo.cancelado_at != null;
  const vivos = grupo.aviones.filter((a) => !a.cancelado);
  const hijoPorVuelo = new Map(grupo.aviones.map((a) => [a.vuelo_id, a]));

  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const abrirRecibo = (s: SobreSalida) => {
    // Proxy autenticado por cookie (sin token en el cliente); el handler
    // fuerza `inline` para que la pestaña muestre el PDF.
    window.open(`/api/grupos/cobros/${s.id}/recibo`, "_blank", "noopener");
  };

  const handleRepartir = () => {
    if (!aRepartir) return;
    const s = aRepartir;
    startTransition(async () => {
      const res = await repartirCobroGrupoAction(
        s.id,
        grupo.id,
        s.partes.map((p) => p.vuelo_id),
      );
      if (res.ok) {
        const n = res.data.sobre.partes.length;
        toast.success(
          `Sobre re-partido en ${n} ${n === 1 ? "avión" : "aviones"} (${etiquetaModoParticion(res.data.sobre.modo_particion)})`,
        );
        toastAvisos(res.data.avisos);
        setARepartir(null);
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  const handleEliminar = () => {
    if (!aEliminar) return;
    const s = aEliminar;
    startTransition(async () => {
      const res = await eliminarCobroGrupoAction(s.id, grupo.id);
      if (res.ok) {
        toast.success(
          `${s.es_reembolso ? "Reembolso" : "Cobro"} del grupo eliminado: se borraron sus ${res.data.partes_eliminadas} ${res.data.partes_eliminadas === 1 ? "parte" : "partes"} y el saldo se recalculó.`,
        );
        setAEliminar(null);
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  const puedeRegistrar = puedeCobrar && !cancelado && vivos.length > 0;

  return (
    <>
      <Card id="cobros-grupo" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <BanknotesIcon className="h-4 w-4 text-emerald-500" />
              Cobros del grupo
              <CobroEstadoBadge estado={semaforo} />
            </CardTitle>
            <CardDescription className="text-xs">
              Total <span className="font-mono text-foreground">{fmtUsd(total)}</span> · Cobrado{" "}
              <span className="font-mono text-foreground">{fmtUsd(cobrado)}</span> · Saldo{" "}
              <span
                className={cn(
                  "font-mono",
                  pendiente > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                )}
              >
                {fmtUsd(saldo)}
              </span>
              {sobres.length > 0 && (
                <>
                  {" · "}
                  {sobres.length} {sobres.length === 1 ? "sobre" : "sobres"}
                </>
              )}
            </CardDescription>
          </div>
          {puedeRegistrar && (
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {cobrado > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialogo("REEMBOLSO")}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  title="Devolver dinero al cliente: resta del cobrado de cada avión"
                >
                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                  Registrar reembolso
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogo("COBRO")}
                className="gap-1.5"
                title="Un solo pago del cliente que se parte en un cobro por avión"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Registrar cobro
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {sobres.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin cobros del grupo todavía.{" "}
              {puedeRegistrar
                ? "«Registrar cobro» reparte un solo pago entre los aviones; "
                : ""}
              los cobros hechos directamente en un vuelo (p. ej. por el piloto) no aparecen
              aquí pero sí cuentan en «Cobrado».
            </p>
          ) : (
            sobres.map((s) => {
              const abierto = abiertos.has(s.id);
              const descuadrado = !s.cuadra || s.partes_en_cancelados > 0;
              const n = s.partes.length;
              const puedeRepartir = puedeCobrar && !cancelado;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border",
                    s.es_reembolso ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 text-sm space-y-0.5">
                      <p
                        className={cn(
                          "font-mono font-semibold flex items-center gap-2 flex-wrap",
                          s.es_reembolso && "text-red-600 dark:text-red-400",
                        )}
                      >
                        {s.moneda === "MXN" ? fmtMxn(s.monto) : `${fmtUsd(s.monto)} USD`}
                        {s.es_reembolso && (
                          <Badge
                            variant="outline"
                            className="border-red-500/50 text-red-600 dark:text-red-400 font-sans font-medium"
                            title="Devolución al cliente: resta del cobrado de cada avión"
                          >
                            Reembolso
                          </Badge>
                        )}
                        {s.moneda === "MXN" && s.tc_usd_mxn != null && s.tc_usd_mxn > 0 && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            (tc {fmtDecimal(s.tc_usd_mxn, 4)})
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className="font-sans font-normal text-[10px]"
                          title="Cómo se partió el sobre entre los aviones"
                        >
                          {etiquetaModoParticion(s.modo_particion)}
                        </Badge>
                        {s.conciliado && (
                          <Badge
                            variant="outline"
                            className="font-sans font-medium text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1"
                            title="El banco enlaza este sobre (movimiento bancario conciliado)"
                          >
                            <LinkIcon className="h-3 w-3" />
                            Conciliado
                          </Badge>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {metodoPagoLabel(s.metodo_cobro)}
                        {s.cuenta_destino ? ` · → ${s.cuenta_destino}` : ""}
                        {s.referencia ? ` · ${s.referencia}` : ""}
                      </p>
                      {s.es_reembolso && s.notas && (
                        <p className="text-[11px] text-muted-foreground truncate" title={s.notas}>
                          Motivo: {s.notas.split("\n")[0]}
                        </p>
                      )}
                      {!s.es_reembolso && s.notas && (
                        <p className="text-[11px] text-muted-foreground truncate" title={s.notas}>
                          {s.notas.split("\n")[0]}
                        </p>
                      )}
                      {s.comision_banco_monto != null && s.comision_banco_monto > 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Comisión banco{" "}
                          {s.comision_banco_pct != null ? `${fmtDecimal(s.comision_banco_pct, 2)}% ` : ""}
                          −{s.moneda === "MXN" ? fmtMxn(s.comision_banco_monto) : `${fmtUsd(s.comision_banco_monto)} ${s.moneda}`} · neto al banco{" "}
                          {s.moneda === "MXN" ? fmtMxn(s.neto) : `${fmtUsd(s.neto)} ${s.moneda}`}
                        </p>
                      )}
                      {descuadrado && (
                        <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                          <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>
                            {!s.cuadra
                              ? `Sus partes suman ${s.moneda === "MXN" ? fmtMxn(s.partes_suma) : fmtUsd(s.partes_suma)} y el sobre es ${s.moneda === "MXN" ? fmtMxn(s.monto) : fmtUsd(s.monto)}. `
                              : ""}
                            {s.partes_en_cancelados > 0
                              ? `${s.partes_en_cancelados} ${s.partes_en_cancelados === 1 ? "parte quedó" : "partes quedaron"} en aviones cancelados (ese dinero no cuenta en el cobrado del grupo). `
                              : ""}
                            {puedeRepartir ? "Usa «Re-partir»." : "Pide a oficina re-partirlo."}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <p className="text-[11px] text-muted-foreground font-mono mr-1">
                        {fmtDate(s.fecha_cobro)}
                      </p>
                      {s.recibo_disponible && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Recibo de pago (PDF) para el cliente"
                          onClick={() => abrirRecibo(s)}
                        >
                          <DocumentArrowDownIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {puedeRepartir && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "h-7 w-7 text-muted-foreground hover:text-foreground",
                            descuadrado && "text-amber-600 dark:text-amber-400",
                          )}
                          title="Re-partir entre los aviones vivos (tras quitar o cambiar un avión)"
                          onClick={() => setARepartir(s)}
                          disabled={pending}
                        >
                          <ArrowPathIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {puedeEliminar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={
                            s.es_reembolso
                              ? "Eliminar reembolso (capturado por error)"
                              : "Eliminar cobro del grupo (capturado por error)"
                          }
                          onClick={() => setAEliminar(s)}
                          disabled={pending}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => toggle(s.id)}
                        aria-expanded={abierto}
                        title={abierto ? "Ocultar partes por avión" : "Ver partes por avión"}
                      >
                        {n} {n === 1 ? "avión" : "aviones"}
                        <ChevronDownIcon
                          className={cn("h-3.5 w-3.5 transition-transform", abierto && "rotate-180")}
                        />
                      </Button>
                    </div>
                  </div>

                  {abierto && (
                    <div className="border-t border-border/60 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Avión</TableHead>
                            <TableHead>Vuelo</TableHead>
                            <TableHead className="text-right">Parte ({s.moneda})</TableHead>
                            {s.comision_banco_monto != null && s.comision_banco_monto > 0 && (
                              <TableHead className="text-right">Comisión</TableHead>
                            )}
                            <TableHead className="text-right">Peso</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...s.partes]
                            .sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999))
                            .map((p) => {
                              const hijo = hijoPorVuelo.get(p.vuelo_id);
                              const enCancelado = p.cancelado || hijo?.cancelado === true;
                              return (
                                <TableRow key={p.cobro_vuelo_id} className={cn(enCancelado && "opacity-70")}>
                                  <TableCell className="font-mono text-xs">{p.posicion ?? "—"}</TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {p.matricula ?? hijo?.aeronave?.matricula ?? "Sin avión"}
                                    {enCancelado && (
                                      <Badge
                                        variant="outline"
                                        className="ml-1.5 font-sans text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        title="Este avión ya no está en el grupo: re-parte el sobre"
                                      >
                                        cancelado
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {p.folio != null ? (
                                      <Link
                                        href={`/admin/quotes/${p.vuelo_id}`}
                                        className="font-mono text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                                        title="Abrir la cotización de este avión"
                                      >
                                        #{p.folio}
                                      </Link>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-right font-mono text-xs",
                                      p.monto < 0 && "text-red-600 dark:text-red-400",
                                    )}
                                  >
                                    {s.moneda === "MXN" ? fmtMxn(p.monto) : fmtUsd(p.monto)}
                                  </TableCell>
                                  {s.comision_banco_monto != null && s.comision_banco_monto > 0 && (
                                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                      {p.comision_banco_monto != null
                                        ? `−${s.moneda === "MXN" ? fmtMxn(p.comision_banco_monto) : fmtUsd(p.comision_banco_monto)}`
                                        : "—"}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                                    {p.factor != null ? `${fmtDecimal(p.factor * 100, 2)}%` : "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                      <p className="px-3 py-2 text-[10px] text-muted-foreground">
                        Cada parte es un cobro real del vuelo de ese avión; se edita o elimina
                        solo desde aquí (el sobre), nunca desde el vuelo.
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {sobres.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              «Cobrado» y «Saldo» suman TODOS los cobros de los aviones vivos (sobres y cobros
              hechos en cada vuelo). Las partes en aviones cancelados no cuentan hasta re-partir.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Registrar cobro / reembolso: se monta al abrir (estado limpio + llave de idempotencia nueva). */}
      {dialogo && (
        <GrupoCobroDialog
          grupo={grupo}
          tipo={dialogo}
          onClose={() => setDialogo(null)}
          tcOficial={tcOficial}
          tcOficialFecha={tcOficialFecha}
        />
      )}

      {/* Re-partir: regenera las partes SOLO entre aviones vivos (regla AUTO). */}
      <AlertDialog open={aRepartir !== null} onOpenChange={(o) => !o && !pending && setARepartir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Re-partir el {aRepartir?.es_reembolso ? "reembolso" : "cobro"} de{" "}
              {aRepartir
                ? aRepartir.moneda === "MXN"
                  ? fmtMxn(aRepartir.monto)
                  : `${fmtUsd(aRepartir.monto)} USD`
                : ""}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borran sus {aRepartir?.partes.length ?? 0} partes actuales y se vuelven a
              generar SOLO entre los {vivos.length} {vivos.length === 1 ? "avión vivo" : "aviones vivos"}{" "}
              del grupo con la regla automática (liquidación si cubre los saldos, si no
              proporcional al precio). El monto del sobre y su conciliación con el banco no
              cambian.
              {aRepartir?.modo_particion === "MANUAL"
                ? " Este sobre se partió A MANO: al re-partir pasa a la regla automática."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRepartir();
              }}
              disabled={pending}
            >
              {pending ? "Re-partiendo…" : "Re-partir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar: borra el sobre y sus N partes (irreversible). */}
      <AlertDialog open={aEliminar !== null} onOpenChange={(o) => !o && !pending && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar este {aEliminar?.es_reembolso ? "reembolso" : "cobro"} del grupo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aEliminar
                ? `${aEliminar.moneda === "MXN" ? fmtMxn(aEliminar.monto) : `${fmtUsd(aEliminar.monto)} USD`} · ${metodoPagoLabel(aEliminar.metodo_cobro)} · ${fmtDate(aEliminar.fecha_cobro)}. `
                : ""}
              {aEliminar?.conciliado ? (
                <>
                  Este sobre está <span className="font-semibold">conciliado con el banco</span>:
                  primero desvincúlalo en{" "}
                  <Link href="/admin/conciliacion" className="underline underline-offset-2">
                    Conciliación
                  </Link>{" "}
                  y después podrás eliminarlo.
                </>
              ) : (
                <>
                  Se borran sus {aEliminar?.partes.length ?? 0}{" "}
                  {(aEliminar?.partes.length ?? 0) === 1 ? "parte" : "partes"} (el cobro de cada
                  avión) y el saldo del grupo se recalcula al instante. Úsalo solo para
                  capturas erróneas: no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleEliminar();
              }}
              disabled={pending || aEliminar?.conciliado === true}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
