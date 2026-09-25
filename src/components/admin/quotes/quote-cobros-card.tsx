"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknotesIcon,
  DocumentArrowDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { fmtDate } from "@/lib/datetime";
import { fmtMonto, fmtUsd } from "@/lib/format";
import { deleteCobroAction } from "@/app/admin/flights/actions";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { rutaReciboDeCobro } from "@/lib/admin/pdf-urls";
import { ReembolsoButton } from "@/components/admin/flights/reembolso-dialog";
import {
  CobroConciliadoBadge,
  CobroSobreNota,
  esParteDeSobre,
} from "@/components/admin/flights/cobro-sobre-nota";
import { ComprobanteCobro } from "@/components/admin/flights/comprobante-cobro";
import { FacturaServicioBurbuja } from "@/components/admin/facturas-emitidas/factura-servicio-burbuja";
import { puedeAdjuntarComprobante } from "@/lib/admin/facturas-emitidas";
import { ChipDelAnticipo } from "@/components/admin/ingresos/entradas-table";
import { desaplicarAnticipoAction } from "@/app/admin/ingresos/actions";
import { puedeConciliarIngresos } from "@/lib/admin/ingresos-ui";
import type { FlightCobro } from "@/types/flights";
import type { FacturaServicioBloque } from "@/types/facturas-emitidas";
import {
  TITULO_REGISTRO_COBRO,
  TOLERANCIA_COBRO_USD,
  textoRegistroCobro,
} from "@/lib/admin/cobros";

/**
 * Cobros del vuelo VISIBLES desde la cotización: el desglose a cobrar no
 * cambiaba al registrarse un cobro y parecía que "no pasó nada". Además,
 * mientras exista un cobro la cotización no puede editarse (cambiaría un
 * total ya cobrado): desde aquí se elimina el cobro (con confirmación) para
 * desbloquear la edición, o se navega al vuelo.
 *
 * SIEMPRE visible (pedido del cliente 9-sep-2026): con 0 cobros pinta el
 * estado vacío «Sin cobros registrados» + «Registrar cobro» — antes con 0
 * cobros no había dónde registrar desde la cotización.
 *
 * 24-sep-2026 (captura de Itzi):
 *  1. Encabezado en TRES renglones —título (+ estado), descripción a todo lo
 *     ancho y botones que envuelven—. Con los botones `shrink-0` en la misma
 *     fila `justify-between`, el texto quedaba aplastado en una columna.
 *  2. Montos con `fmtMonto` («$136,856.80 MXN», jamás «$136,856.8»).
 *  3. La «burbujita» de FACTURA: número ⇒ PDF, «pedida — pendiente» o
 *     «Necesito factura»; facturación ve «Registrar factura».
 *  4. El COMPROBANTE de cada cobro (ver o adjuntar DESPUÉS de registrado).
 */
export function QuoteCobrosCard({
  quoteId,
  quoteFolio = null,
  montoTotalUsd,
  totalCobrado,
  cobros,
  puedeReembolsar = false,
  onRegistrar,
  registrarTitle,
  facturaServicio,
  rol = null,
  vueloEstado = "",
  clienteId = null,
  clienteNombre = null,
  fechaVuelo = null,
  grupo = null,
  voucherUrls = {},
}: {
  quoteId: string;
  /** Folio del vuelo (encabezado del diálogo de reembolso). */
  quoteFolio?: number | null;
  montoTotalUsd: number;
  totalCobrado: number;
  cobros: FlightCobro[];
  /** Rol de oficina (ADMIN/COORDINADOR): habilita "Registrar reembolso". */
  puedeReembolsar?: boolean;
  /** Abre el formulario de cobro (el mismo del detalle del vuelo); undefined
      = sin permiso o vuelo aún no cobrable (no se pinta el botón). */
  onRegistrar?: () => void;
  registrarTitle?: string;
  /** `snapshot.factura_servicio` (ADITIVO; ausente/null ⇒ sin burbuja). */
  facturaServicio?: FacturaServicioBloque | null;
  /** Rol del usuario (permisos de la burbuja y del comprobante). */
  rol?: string | null;
  vueloEstado?: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  fechaVuelo?: string | null;
  /** Grupo multi-avión (`quote.grupo_id` + aviones vivos del snapshot). */
  grupo?: { id: string; total_aviones: number } | null;
  /** URLs firmadas de los comprobantes (best-effort; SOCIO recibe 403). */
  voucherUrls?: Record<string, string>;
}) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<FlightCobro | null>(null);
  const [deleting, startDelete] = useTransition();

  const sinCobros = cobros.length === 0;
  // Misma tolerancia que el API (1 USD): los centavos de la conversión
  // MXN→USD no cuentan como deuda.
  const cubierto = !sinCobros && totalCobrado >= montoTotalUsd - TOLERANCIA_COBRO_USD;
  // ¿Hay partes de un sobre de grupo? Esas no se eliminan desde aquí.
  const haySobre = cobros.some(esParteDeSobre);
  const puedeComprobante = puedeAdjuntarComprobante(rol);

  const botonRegistrar = onRegistrar ? (
    <Button
      type="button"
      size="sm"
      variant={sinCobros ? "default" : "outline"}
      onClick={onRegistrar}
      title={registrarTitle}
      className="gap-1.5"
    >
      <BanknotesIcon className="h-4 w-4" />
      Registrar cobro
    </Button>
  ) : null;
  const conReembolso = puedeReembolsar && !sinCobros;

  return (
    <Card
      id="cobros-vuelo"
      className={`scroll-mt-24 ${sinCobros ? "border-border" : "border-emerald-500/40"}`}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BanknotesIcon
              className={`h-4 w-4 ${sinCobros ? "text-muted-foreground" : "text-emerald-500"}`}
            />
            Cobros del vuelo
          </CardTitle>
          {!sinCobros && (
            <Badge
              variant="outline"
              className={
                cubierto
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
              }
            >
              {/* El neto puede quedar en 0 tras un reembolso: no es "parcial". */}
              {cubierto ? "Cobrado" : totalCobrado > 0 ? "Parcial" : "Reembolsado"}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          {sinCobros ? (
            <>
              Total a cobrar {fmtUsd(montoTotalUsd)}. Al registrar el primer
              cobro la cotización queda bloqueada para edición (cambiaría un
              total ya cobrado).
            </>
          ) : (
            <>
              Cobrado {fmtUsd(totalCobrado)} de {fmtUsd(montoTotalUsd)}. Mientras
              exista un cobro, la cotización no puede editarse (cambiaría un
              total ya cobrado): elimínalo aquí si necesitas ajustarla.
            </>
          )}
          {haySobre && (
            <>
              {" "}
              Los cobros que son parte de un sobre de grupo se eliminan o
              re-parten desde el grupo (Cobros del grupo).
            </>
          )}
        </CardDescription>
        {(botonRegistrar || conReembolso) && (
          <div className="flex flex-wrap items-center gap-2">
            {botonRegistrar}
            {/* Reembolso: solo oficina y solo si hay algo cobrado. */}
            {conReembolso && <ReembolsoButton flightId={quoteId} flightFolio={quoteFolio} />}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {/* FACTURA del servicio: número ⇒ PDF, «pedida» o «Necesito factura». */}
        <FacturaServicioBurbuja
          vueloId={quoteId}
          vueloFolio={quoteFolio ?? 0}
          vueloEstado={vueloEstado}
          clienteId={clienteId}
          clienteNombre={clienteNombre}
          fechaVuelo={fechaVuelo}
          grupo={grupo}
          bloque={quoteFolio != null ? facturaServicio : null}
          rol={rol}
        />
        {sinCobros && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
            <p className="text-sm font-medium">Sin cobros registrados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {onRegistrar
                ? "Registra aquí el anticipo o la liquidación del cliente: link de pago (HSBC o Paywise), transferencia, efectivo, cheque, BillPocket o dólares."
                : "Los cobros los registra la oficina (administración, coordinación o facturación)."}
            </p>
          </div>
        )}
        {cobros.map((c) => {
          // Reembolso = cobro NEGATIVO (derivado del signo): en rojo, con
          // badge — RESTA del cobrado del vuelo.
          const esReembolso = Number(c.monto) < 0;
          // «Registró: Itzi» — mismo texto que el detalle del vuelo.
          const registro = textoRegistroCobro(c);
          return (
          <div
            key={c.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              esReembolso ? "border-red-500/40 bg-red-500/5" : "border-border"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-sm font-mono font-semibold ${
                  esReembolso ? "text-red-600 dark:text-red-400" : ""
                }`}
              >
                {fmtMonto(c.monto, c.moneda)}
                {esReembolso && (
                  <Badge
                    variant="outline"
                    className="ml-2 border-red-500/50 text-red-600 dark:text-red-400 font-sans font-medium"
                    title="Devolución al cliente: resta del cobrado del vuelo"
                  >
                    Reembolso
                  </Badge>
                )}
                {/* Conciliado con el banco: SOLO si el API lo dice. */}
                <CobroConciliadoBadge cobro={c} />
              </p>
              <p className="text-xs text-muted-foreground">
                {metodoPagoLabel(c.metodo_cobro)}
                {c.cuenta_destino ? ` · → ${c.cuenta_destino}` : ""} ·{" "}
                {fmtDate(c.fecha_cobro)}
                {c.comision_banco_monto != null &&
                  Number(c.comision_banco_monto) > 0 && (
                    <> · comisión banco {fmtMonto(c.comision_banco_monto, c.moneda)}</>
                  )}
              </p>
              {/* Quién capturó el cobro (22-sep-2026): solo si el API mandó
                  el nombre; fuente única del texto. */}
              {registro && (
                <p className="text-[11px] text-muted-foreground" title={TITULO_REGISTRO_COBRO}>
                  {registro}
                </p>
              )}
              {/* Parte de un SOBRE de grupo: se gestiona desde el grupo. */}
              <CobroSobreNota cobro={c} />
              {/* Cobro que salió de un ANTICIPO (24-sep-2026). */}
              {c.anticipo && (
                <p className="text-[11px]">
                  <ChipDelAnticipo
                    etiqueta={c.anticipo.etiqueta}
                    href={`/admin/ingresos?tab=anticipos&ingreso=${c.anticipo.ingreso_id}`}
                    titulo={
                      c.conciliado_via === "ANTICIPO"
                        ? "Salió de un anticipo ya conciliado con su abono del banco (conciliado vía el anticipo). Para cambiar el monto, desaplícalo."
                        : "Salió de un anticipo: para cambiar el monto, desaplícalo y vuelve a aplicarlo desde Ingresos → Anticipos."
                    }
                  />
                </p>
              )}
              {/* Comprobante del cobro (24-sep-2026): verlo o adjuntarlo
                  después de registrado. No toca dinero: el candado de la
                  cotización con cobros no lo bloquea. */}
              <ComprobanteCobro
                cobro={c}
                url={c.foto_voucher_url ? (voucherUrls[c.foto_voucher_url] ?? null) : null}
                flightId={quoteId}
                puedeAdjuntar={puedeComprobante}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Recibo para el cliente: solo cobros reales (un reembolso no
                  tiene recibo de pago). */}
              {Number(c.monto) > 0 && (
                <a
                  href={rutaReciboDeCobro(c)}
                  target="_blank"
                  rel="noopener"
                  className={`${buttonVariants({ variant: "ghost", size: "icon" })} h-8 w-8 text-muted-foreground hover:text-foreground`}
                  title={
                    esParteDeSobre(c)
                      ? "Recibo de pago (PDF) del sobre del grupo — se abre en otra pestaña"
                      : "Recibo de pago (PDF) para el cliente — se abre en otra pestaña"
                  }
                  aria-label="Abrir el recibo de pago (PDF)"
                >
                  <DocumentArrowDownIcon className="h-4 w-4" />
                </a>
              )}
              {/* Parte de un sobre de grupo: NO se elimina por vuelo (el
                  API responde 409 COBRO_DE_GRUPO); se hace desde el grupo. */}
              {/* Cobro de ANTICIPO: «Desaplicar» (ADMIN/FACTURACION, los
                  mismos roles que borrar un cobro). */}
              {c.anticipo ? (
                puedeConciliarIngresos(rol) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToDelete(c)}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                    title={`Desaplicar: el monto regresa al saldo del anticipo ${c.anticipo.etiqueta}`}
                  >
                    Desaplicar
                  </Button>
                )
              ) : (
                !esParteDeSobre(c) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToDelete(c)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="Eliminar cobro (para poder revisar la cotización)"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )
              )}
            </div>
          </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Más detalle (comisiones, conciliación) en{" "}
          <Link
            href={`/admin/flights/${quoteId}#cobros`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            el vuelo → Cobros
          </Link>
          .
        </p>
      </CardContent>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {toDelete?.anticipo ? "¿Desaplicar este cobro?" : "¿Eliminar este cobro?"}
            </DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${fmtMonto(toDelete.monto, toDelete.moneda)} · ${metodoPagoLabel(toDelete.metodo_cobro)}. `
                : ""}
              {toDelete?.anticipo
                ? `El monto regresa al saldo del anticipo ${toDelete.anticipo.etiqueta}; el vuelo vuelve a quedar pendiente de cobro. Después puedes volver a aplicarlo.`
                : "El vuelo volverá a quedar pendiente de cobro y la cotización se podrá editar. Esta acción no se puede deshacer."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!toDelete) return;
                startDelete(async () => {
                  const anticipo = toDelete.anticipo ?? null;
                  const res = anticipo
                    ? await desaplicarAnticipoAction(anticipo.ingreso_id, toDelete.id, quoteId)
                    : await deleteCobroAction(quoteId, toDelete.id);
                  if (res.ok) {
                    toast.success(
                      anticipo
                        ? `Desaplicado: el monto regresó al saldo del anticipo ${anticipo.etiqueta}.`
                        : "Cobro eliminado; la cotización ya puede editarse.",
                    );
                    setToDelete(null);
                    router.refresh();
                  } else if (res.code === "COBRO_DE_GRUPO") {
                    // Candado del API: la parte de un sobre se elimina desde
                    // el grupo. Mensaje del API + atajo al grupo.
                    const d = res.details as { grupo_id?: string } | undefined;
                    toast.error(
                      res.error ?? "Este cobro es parte de un sobre de grupo.",
                      {
                        action: d?.grupo_id
                          ? {
                              label: "Ir al grupo",
                              onClick: () =>
                                router.push(`/admin/quotes/grupo/${d.grupo_id}`),
                            }
                          : undefined,
                      },
                    );
                    setToDelete(null);
                  } else {
                    toast.error(res.error ?? "No se pudo eliminar el cobro");
                  }
                });
              }}
            >
              {deleting
                ? toDelete?.anticipo
                  ? "Desaplicando…"
                  : "Eliminando…"
                : toDelete?.anticipo
                  ? "Desaplicar"
                  : "Eliminar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
