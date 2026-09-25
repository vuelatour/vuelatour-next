"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightCircleIcon,
  LinkSlashIcon,
  PaperClipIcon,
  PencilSquareIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { BadgeEstadoConciliacion } from "@/components/admin/ingresos/entradas-table";
import {
  DialogosIngreso,
  verComprobanteIngreso,
  type AccionIngreso,
} from "@/components/admin/ingresos/ingresos-table";
import type { CatalogosIngreso } from "@/components/admin/ingresos/registrar-ingreso-dialog";
import {
  desaplicarAnticipoAction,
  ligarAbonoIngresoAction,
  quitarArchivoIngresoAction,
} from "@/app/admin/ingresos/actions";
import {
  CATEGORIA_INGRESO_DESTINO,
  esAnticipo,
  etiquetaIngreso,
} from "@/lib/admin/categorias-ingreso";
import {
  ACCION_BITACORA_INGRESO,
  hrefIngresos,
  puedeConciliarIngresos,
  textoCampoBitacora,
  textoConfirmarDesaplicar,
  textoSaldoAnticipo,
  textoValorBitacora,
  type FiltrosIngresos,
} from "@/lib/admin/ingresos-ui";
import { diaMas } from "@/lib/admin/conciliacion-auto";
import { fmtMonto, fmtTc } from "@/lib/format";
import { fmtDate, fmtDateOnly, fmtDateTime, todayCancun } from "@/lib/datetime";
import type { IngresoAplicacion, IngresoDetalle } from "@/types/ingresos";

/** El menor de dos días `YYYY-MM-DD` (comparación de texto = de calendario). */
const minDia = (a: string, b: string) => (a < b ? a : b);

type Confirmacion =
  | { tipo: "desvincular" }
  | { tipo: "desaplicar"; aplicacion: IngresoAplicacion }
  | { tipo: "quitar-archivo" };

/**
 * Detalle de un ingreso (`?ingreso=<id>`, 24-sep-2026): ficha, conciliación
 * con el banco, aplicaciones a vuelos (anticipos), comprobante y bitácora.
 * Desvincular y desaplicar son SOLO ADMIN/FACTURACION (espejo del API) y
 * confirman; quitar el comprobante también confirma.
 */
export function IngresoDetalleSheet({
  detalle,
  noExiste,
  filtros,
  catalogos,
  rol,
}: {
  detalle: IngresoDetalle | null;
  noExiste: boolean;
  filtros: FiltrosIngresos;
  catalogos: CatalogosIngreso;
  rol: string | null;
}) {
  const router = useRouter();
  const abierto = !!filtros.ingreso;
  const [accion, setAccion] = useState<{ accion: AccionIngreso; ingreso: IngresoDetalle["ingreso"] } | null>(
    null,
  );
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [pending, start] = useTransition();
  const conciliador = puedeConciliarIngresos(rol);

  const cerrar = () => router.push(hrefIngresos(filtros, { ingreso: null }), { scroll: false });

  const ejecutar = () => {
    if (!detalle || !confirmar) return;
    const i = detalle.ingreso;
    start(async () => {
      if (confirmar.tipo === "desvincular" && detalle.movimiento) {
        const r = await ligarAbonoIngresoAction(detalle.movimiento.id, null);
        if (r.ok) toast.success("Ingreso desvinculado del abono: el abono vuelve a «Por conciliar».");
        else toast.error(r.error ?? "No se pudo desvincular");
      } else if (confirmar.tipo === "desaplicar") {
        const a = confirmar.aplicacion;
        const r = await desaplicarAnticipoAction(i.id, a.cobro_id, a.vuelo_id);
        if (r.ok) {
          toast.success(
            `Desaplicado: el saldo del anticipo es ${fmtMonto(r.data?.anticipo.saldo ?? 0, i.moneda)}`,
          );
        } else toast.error(r.error ?? "No se pudo desaplicar");
      } else if (confirmar.tipo === "quitar-archivo") {
        const r = await quitarArchivoIngresoAction(i.id);
        if (r.ok) toast.success("Comprobante quitado (queda en el historial del ingreso).");
        else toast.error(r.error ?? "No se pudo quitar el comprobante");
      }
      setConfirmar(null);
      router.refresh();
    });
  };

  const i = detalle?.ingreso ?? null;
  const vivo = i ? !i.baja : false;
  const ant = i ? esAnticipo(i.categoria) : false;

  return (
    <>
      <Sheet open={abierto} onOpenChange={(o) => !o && cerrar()}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl data-[side=right]:sm:max-w-xl">
          {!i ? (
            <SheetHeader>
              <SheetTitle>{noExiste ? "Ese ingreso ya no existe" : "No se pudo cargar el ingreso"}</SheetTitle>
              <SheetDescription>
                {noExiste
                  ? "Puede que el enlace sea viejo. Cierra y búscalo en la lista."
                  : "El sistema no respondió. Cierra y vuelve a abrirlo en un momento."}
              </SheetDescription>
            </SheetHeader>
          ) : (
            <div className="flex flex-col gap-5 p-4">
              <SheetHeader className="p-0 pr-8">
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {i.etiqueta || etiquetaIngreso(i.folio)}
                  <BadgeEstadoConciliacion estado={i.conciliacion.estado} />
                  {i.baja && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      Dado de baja
                    </Badge>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {i.categoria_etiqueta}
                  <span className="block text-[11px] text-green-600 dark:text-green-400">
                    {CATEGORIA_INGRESO_DESTINO[i.categoria]}
                  </span>
                </SheetDescription>
              </SheetHeader>

              {vivo && (
                <div className="flex flex-wrap gap-2">
                  {ant && (i.anticipo?.saldo ?? 0) > 0.005 && (
                    <Button size="sm" className="gap-1.5" onClick={() => setAccion({ accion: "aplicar", ingreso: i })}>
                      <ArrowRightCircleIcon className="h-4 w-4" />
                      Aplicar a vuelo
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setAccion({ accion: "editar", ingreso: i })}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Editar
                  </Button>
                  {ant && (i.anticipo?.aplicaciones_n ?? 0) === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setAccion({ accion: "reclasificar", ingreso: i })}
                      title="Anticipo retenido sin vuelo (penalización): pásalo a «Otros ingresos»"
                    >
                      <TagIcon className="h-4 w-4" />
                      Reclasificar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setAccion({ accion: "baja", ingreso: i })}
                  >
                    <TrashIcon className="h-4 w-4" />
                    Dar de baja
                  </Button>
                </div>
              )}
              {i.baja && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <p className="font-medium text-destructive">
                    Dado de baja el {fmtDateTime(i.baja.at)}
                    {i.baja.por_nombre ? ` por ${i.baja.por_nombre}` : ""}
                  </p>
                  <p className="text-muted-foreground">Motivo: {i.baja.motivo}</p>
                </div>
              )}

              <Seccion titulo="Ficha">
                <Dato etiqueta="Fecha">{fmtDateOnly(i.fecha)}</Dato>
                <Dato etiqueta="Concepto">{i.descripcion}</Dato>
                <Dato etiqueta="Monto">
                  <span className="font-mono font-semibold">{fmtMonto(i.monto, i.moneda)}</span>
                  {i.comision_monto != null && i.comision_monto > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      comisión {fmtMonto(i.comision_monto, i.moneda)} · neto {fmtMonto(i.neto, i.moneda)}
                    </span>
                  )}
                </Dato>
                {i.tc_usd_mxn != null && <Dato etiqueta="Tipo de cambio">{fmtTc(i.tc_usd_mxn)}</Dato>}
                <Dato etiqueta="Dónde entró">
                  {i.cuenta
                    ? `${i.cuenta.alias} · ${i.cuenta.banco} (${i.cuenta.moneda})`
                    : "Efectivo / caja (no pasa por el banco)"}
                </Dato>
                <Dato etiqueta="Método">{i.metodo_etiqueta}</Dato>
                {i.referencia && <Dato etiqueta="Referencia">{i.referencia}</Dato>}
                {(i.cliente_nombre || i.pagador) && (
                  <Dato etiqueta={i.cliente_nombre ? "Cliente" : "Quién pagó"}>
                    {i.cliente_nombre ?? i.pagador}
                    {i.cliente_nombre && i.pagador ? ` · pagó ${i.pagador}` : ""}
                  </Dato>
                )}
                {i.vuelo_id && (
                  <Dato etiqueta="Vuelo relacionado">
                    <Link href={`/admin/flights/${i.vuelo_id}`} className="text-brand-600 hover:underline">
                      Vuelo #{i.vuelo_folio ?? "—"}
                    </Link>
                  </Dato>
                )}
                {i.matricula && <Dato etiqueta="Avión">{i.matricula}</Dato>}
                {i.gasto_id && <Dato etiqueta="Gasto relacionado">Ligado</Dato>}
                {i.notas && <Dato etiqueta="Notas">{i.notas}</Dato>}
                <Dato etiqueta="Registró">
                  {i.registrado_por_nombre ?? "—"} · {fmtDateTime(i.created_at)}
                </Dato>
              </Seccion>

              {ant && i.anticipo && (
                <Seccion titulo="Aplicaciones a vuelos">
                  <p className="text-sm">{textoSaldoAnticipo(i.anticipo, i.moneda) || "—"}</p>
                  {detalle!.aplicaciones.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Todavía no se aplica a ningún vuelo. Cuando exista la reserva, usa «Aplicar a vuelo».
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detalle!.aplicaciones.map((a) => (
                        <li
                          key={a.cobro_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
                        >
                          <span className="min-w-0">
                            <Link href={`/admin/flights/${a.vuelo_id}#cobros`} className="font-medium text-brand-600 hover:underline">
                              Vuelo #{a.vuelo_folio ?? "—"}
                            </Link>{" "}
                            <span className="font-mono">{fmtMonto(a.monto, a.moneda)}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {[fmtDate(a.fecha_cobro), a.registrado_por_nombre ? `Aplicó: ${a.registrado_por_nombre}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {conciliador && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmar({ tipo: "desaplicar", aplicacion: a })}
                              disabled={pending}
                            >
                              Desaplicar
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Seccion>
              )}

              <Seccion titulo="Conciliación con el banco">
                {i.conciliacion.estado === "NO_BANCARIO" ? (
                  <p className="text-sm text-muted-foreground">
                    Efectivo en mano: no se concilia con ningún estado de cuenta.
                  </p>
                ) : detalle!.movimiento ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      Abono del {fmtDateOnly(detalle!.movimiento.fecha)} ·{" "}
                      <span className="font-mono">{fmtMonto(detalle!.movimiento.monto, i.moneda)}</span>
                      {detalle!.movimiento.cuenta_alias ? ` · ${detalle!.movimiento.cuenta_alias}` : ""}
                    </p>
                    {detalle!.movimiento.descripcion && (
                      <p className="text-xs text-muted-foreground">«{detalle!.movimiento.descripcion}»</p>
                    )}
                    {conciliador && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setConfirmar({ tipo: "desvincular" })}
                        disabled={pending}
                      >
                        <LinkSlashIcon className="h-4 w-4" />
                        Desvincular del abono
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Todavía no aparece en ningún estado de cuenta importado. Al subir el estado de cuenta se
                    cruza solo si el monto cuadra; si no,{" "}
                    {conciliador ? (
                      <Link
                        // Con la ventana del INGRESO (−7 / +30 días, hasta hoy) y
                        // su cuenta: con el periodo de la vista, el abono de otro
                        // mes no aparecía en «Por conciliar».
                        href={hrefIngresos(filtros, {
                          tab: "por-conciliar",
                          desde: diaMas(i.fecha, -7),
                          hasta: minDia(diaMas(i.fecha, 30), todayCancun()),
                          cuenta: i.cuenta_bancaria_id,
                        })}
                        className="text-brand-600 hover:underline"
                      >
                        concílialo en «Por conciliar»
                      </Link>
                    ) : (
                      "lo concilia Administración o Facturación"
                    )}
                    .
                  </p>
                )}
              </Seccion>

              <Seccion titulo="Comprobante">
                {i.archivo ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <PaperClipIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 truncate">{i.archivo.nombre}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {[i.archivo.subido_por_nombre, i.archivo.subido_at ? fmtDate(i.archivo.subido_at) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <Button size="xs" variant="outline" onClick={() => void verComprobanteIngreso(i.id)}>
                      Ver
                    </Button>
                    {vivo && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmar({ tipo: "quitar-archivo" })}
                        disabled={pending}
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin comprobante.{vivo ? " Adjúntalo con «Editar»." : ""}
                  </p>
                )}
              </Seccion>

              <Seccion titulo="Bitácora">
                {detalle!.bitacora.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
                ) : (
                  <ul className="space-y-2">
                    {detalle!.bitacora.map((b) => (
                      <li key={b.id} className="rounded-lg border border-border p-2 text-xs">
                        <p className="font-medium">
                          {ACCION_BITACORA_INGRESO[b.accion] ?? b.accion}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {b.actor_nombre ?? "Sistema"} · {fmtDateTime(b.created_at)}
                          </span>
                        </p>
                        {b.nota && <p className="text-muted-foreground">{b.nota}</p>}
                        {b.cambios.length > 0 && b.accion !== "INSERT" && (
                          <ul className="mt-1 space-y-0.5 text-muted-foreground">
                            {b.cambios.map((c) => (
                              <li key={c.campo}>
                                {textoCampoBitacora(c.campo)}: {textoValorBitacora(c.campo, c.antes)} →{" "}
                                {textoValorBitacora(c.campo, c.despues)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DialogosIngreso estado={accion} onCerrar={() => setAccion(null)} catalogos={catalogos} />

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.tipo === "desvincular"
                ? "¿Desvincular el ingreso del abono?"
                : confirmar?.tipo === "desaplicar"
                  ? "¿Desaplicar del vuelo?"
                  : "¿Quitar el comprobante?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.tipo === "desvincular"
                ? "El abono del banco vuelve a «Por conciliar» y el ingreso queda sin conciliar. Nada se borra."
                : confirmar?.tipo === "desaplicar" && i
                  ? textoConfirmarDesaplicar({
                      monto: confirmar.aplicacion.monto,
                      moneda: confirmar.aplicacion.moneda,
                      folio: confirmar.aplicacion.vuelo_folio,
                      etiquetaAnticipo: i.etiqueta,
                    })
                  : "El ingreso se queda sin comprobante; el archivo queda en su historial."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                ejecutar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending
                ? "Un momento…"
                : confirmar?.tipo === "desvincular"
                  ? "Desvincular"
                  : confirmar?.tipo === "desaplicar"
                    ? "Desaplicar"
                    : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
