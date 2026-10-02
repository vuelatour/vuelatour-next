"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExclamationTriangleIcon, PaperClipIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";
import { todayCancun } from "@/lib/datetime";
import {
  BOTON_GUARDAR_CON_EXCESO,
  BOTON_REGISTRAR_CON_EXCESO,
  BOTON_REVISAR_MONTO,
  CODIGO_EXCEDE_UTILIDAD,
  TEXTO_FALLO_RED_PAGO,
  FACTURA_FOLIO_MAX,
  METODOS_PAGO_SOCIO,
  NOTAS_PAGO_MAX,
  RECIBIDO_POR_MAX,
  REFERENCIA_MAX,
  cambiosPago,
  confirmacionExceso,
  descripcionDialogoPago,
  errorPideRefrescar,
  etiquetaMontoPago,
  formAlCambiarMoneda,
  formDePago,
  formInicialAlta,
  hayErrores,
  hintMontoPago,
  opcionesEntrego,
  payloadAltaPago,
  validarFormPago,
  type ErroresFormPago,
  type FormPagoSocio,
  type UsuarioEntrega,
} from "@/lib/admin/reparto-pagos";
import { motivoComprobanteInvalido } from "@/lib/admin/facturas-emitidas";
import { crearPagoSocioAction, editarPagoSocioAction } from "@/app/admin/profit-sharing/actions";
import { adjuntarComprobantePagoSocio } from "@/lib/api/reparto-pagos-browser";
import type { FilaPagoSocio, MonedaPagoSocio, PagoSocio } from "@/types/reparto-pagos";

/** Qué abre el diálogo: el alta de un pago del mes o la edición de uno. */
export type DialogoPago =
  | { tipo: "alta"; fila: FilaPagoSocio; mes: string }
  | { tipo: "edicion"; fila: FilaPagoSocio; pago: PagoSocio };

/** uuid v4 para la idempotencia del alta (con respaldo sin `randomUUID`). */
function nuevoIdSolicitud(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c?.getRandomValues?.(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * «Registrar pago» / «Editar pago» de un socio (1-oct-2026). El alta llega
 * prellenada (monto = pendiente del API, USD, hoy Cancún, entregó = yo); el
 * MÉTODO se elige siempre. Un 409 PAGO_EXCEDE_UTILIDAD se convierte en la
 * confirmación «¿Registrar de todas formas?», que reintenta con
 * `aceptar_exceso` y el MISMO `client_request_id`. El comprobante opcional
 * del alta sube del navegador directo al API DESPUÉS de registrar el pago.
 *
 * Mientras GUARDA no se cierra (ni con la X, ni Esc, ni clic fuera):
 * reabrirlo generaría otro `client_request_id` y un pago parcial que sí
 * entró se registraría dos veces (el candado de exceso del API solo frena
 * cuando la suma rebasa la utilidad).
 */
export function PagoSocioDialog({
  dialogo,
  onCerrar,
  usuarios,
  me,
  hoy,
}: {
  dialogo: (DialogoPago & { clave: string }) | null;
  onCerrar: () => void;
  usuarios: UsuarioEntrega[];
  me: UsuarioEntrega;
  /** Hoy en Cancún del servidor: solo RESPALDO (el formulario lo calcula al abrir). */
  hoy: string;
}) {
  // La clave del diálogo que está guardando (null = libre). Atada a la clave
  // para que un diálogo nuevo nunca herede el candado de otro.
  const [ocupadoEn, setOcupadoEn] = useState<string | null>(null);
  const ocupado = dialogo !== null && ocupadoEn === dialogo.clave;
  return (
    <Dialog open={dialogo !== null} onOpenChange={(o) => !o && !ocupado && onCerrar()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!ocupado}>
        {dialogo && (
          <FormularioPago
            key={dialogo.clave}
            dialogo={dialogo}
            onCerrar={onCerrar}
            onOcupado={(o) => setOcupadoEn(o ? dialogo.clave : null)}
            usuarios={usuarios}
            me={me}
            hoy={hoy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El formulario del diálogo (exportado para las pruebas de marcado). Solo se
 * monta con el diálogo ABIERTO, así que «hoy» se calcula aquí, en el
 * navegador, al abrir: con la pestaña abierta de un día a otro el `hoy` del
 * servidor sería AYER (prellenaría la fecha vieja y rechazaría la de hoy).
 */
export function FormularioPago({
  dialogo,
  onCerrar,
  onOcupado,
  usuarios,
  me,
  hoy,
}: {
  dialogo: DialogoPago;
  onCerrar: () => void;
  /** Avisa al diálogo cuándo está guardando (para no dejarlo cerrar). */
  onOcupado?: (ocupado: boolean) => void;
  usuarios: UsuarioEntrega[];
  me: UsuarioEntrega;
  hoy: string;
}) {
  const router = useRouter();
  const { fila } = dialogo;
  const pago = dialogo.tipo === "edicion" ? dialogo.pago : null;
  const mes = dialogo.tipo === "alta" ? dialogo.mes : dialogo.pago.periodo.slice(0, 7);
  const [hoyLocal] = useState(() => todayCancun() || hoy);
  const [inicial] = useState<FormPagoSocio>(() =>
    pago
      ? formDePago(pago)
      : formInicialAlta({ pendienteUsd: fila.pendiente_usd, hoy: hoyLocal, meId: me.id }),
  );
  // Lo que el alta prellenó (el pendiente en USD); en la edición no aplica.
  const montoPrellenado = pago ? null : inicial.monto;
  const [form, setForm] = useState<FormPagoSocio>(inicial);
  // Idempotencia: UN id por apertura del diálogo; el reintento (red o
  // «Registrar de todas formas») viaja con el MISMO id.
  const [clientRequestId] = useState(nuevoIdSolicitud);
  const [errores, setErrores] = useState<ErroresFormPago>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [exceso, setExceso] = useState<{ details: unknown } | null>(null);
  const [guardando, setGuardandoLocal] = useState<null | "pago" | "comprobante">(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const montoRef = useRef<HTMLInputElement>(null);

  const setGuardando = (g: null | "pago" | "comprobante") => {
    setGuardandoLocal(g);
    onOcupado?.(g !== null);
  };

  const opciones = useMemo(
    () =>
      opcionesEntrego(
        usuarios,
        me,
        pago ? { id: pago.entregado_por, nombre: pago.entregado_por_nombre } : null,
      ),
    [usuarios, me, pago],
  );

  const cambiar = <K extends keyof FormPagoSocio>(llave: K, valor: FormPagoSocio[K]) => {
    setForm((f) => ({ ...f, [llave]: valor }));
    setErrores((e) => {
      if (!e[llave]) return e;
      const resto = { ...e };
      delete resto[llave];
      return resto;
    });
    // La confirmación del exceso habla de ESTE monto: si algo cambia, se
    // vuelve a preguntar con lo nuevo.
    setExceso(null);
    setErrorGeneral(null);
  };

  // Moneda: en el alta, pasar a MXN sin tocar el monto lo VACÍA (el
  // prellenado es el pendiente en DÓLARES) y lleva el foco ahí.
  const cambiarMoneda = (moneda: MonedaPagoSocio) => {
    const nuevo = formAlCambiarMoneda(form, moneda, montoPrellenado);
    setForm(nuevo);
    setErrores((e) => {
      if (!e.tc && !e.monto) return e;
      const resto = { ...e };
      delete resto.tc;
      delete resto.monto;
      return resto;
    });
    setExceso(null);
    setErrorGeneral(null);
    if (nuevo.monto === "" && form.monto !== "") montoRef.current?.focus();
  };

  const guardar = async (aceptarExceso: boolean) => {
    const e = validarFormPago(form, hoyLocal);
    setErrores(e);
    if (hayErrores(e)) return;
    setErrorGeneral(null);
    setGuardando("pago");
    let res: Awaited<ReturnType<typeof crearPagoSocioAction>> | null;
    try {
      if (dialogo.tipo === "alta") {
        res = await crearPagoSocioAction(
          payloadAltaPago(form, {
            aeronave_id: fila.aeronave.id,
            socio_id: fila.socio.id,
            mes,
            client_request_id: clientRequestId,
            meId: me.id,
            aceptar_exceso: aceptarExceso,
          }),
        );
      } else {
        const patch = cambiosPago(dialogo.pago, form);
        res =
          Object.keys(patch).length === 0
            ? null
            : await editarPagoSocioAction(
                dialogo.pago.id,
                aceptarExceso ? { ...patch, aceptar_exceso: true } : patch,
              );
      }
    } catch {
      // La action nunca lanza, pero la LLAMADA sí puede (red caída, 413/502
      // de Vercel que no es respuesta RSC). Sin esto el diálogo se quedaba
      // «Guardando…» y, como no se cierra mientras guarda, sin salida.
      setGuardando(null);
      setErrorGeneral(TEXTO_FALLO_RED_PAGO);
      return;
    }
    if (res === null) {
      setGuardando(null);
      toast.info("No hay cambios que guardar.");
      onCerrar();
      return;
    }
    if (!res.ok) {
      setGuardando(null);
      if (res.code === CODIGO_EXCEDE_UTILIDAD) {
        setExceso({ details: res.details });
        return;
      }
      if (errorPideRefrescar(res.code)) {
        // Otra persona lo borró o lo cambió: se cierra y se ve lo de hoy.
        toast.info(res.error);
        onCerrar();
        router.refresh();
        return;
      }
      setErrorGeneral(res.error ?? "No se pudo guardar el pago.");
      return;
    }

    const nombreSocio = fila.socio.nombre;
    if (dialogo.tipo === "alta") {
      if (res.data?.idempotente) {
        toast.info("Ese pago ya estaba registrado; no se duplicó.");
      } else {
        toast.success(`Pago registrado a ${nombreSocio}.`);
      }
      if (archivo && res.data?.pago) {
        setGuardando("comprobante");
        const sub = await adjuntarComprobantePagoSocio(res.data.pago.id, archivo).catch(() => ({
          ok: false as const,
          error: "No se pudo subir el comprobante.",
        }));
        if (!sub.ok) {
          toast.error(`El pago SÍ se registró. ${sub.error} Adjúntalo desde el renglón del pago.`, {
            duration: 15000,
          });
        }
      }
    } else {
      toast.success(`Pago a ${nombreSocio} actualizado.`);
    }
    setGuardando(null);
    onCerrar();
    router.refresh();
  };

  const confirmar = exceso ? confirmacionExceso(exceso.details) : null;
  const titulo =
    dialogo.tipo === "alta"
      ? `Registrar pago a ${fila.socio.nombre}`
      : `Editar pago a ${fila.socio.nombre}`;
  const hintMonto = hintMontoPago({
    moneda: form.moneda,
    pendienteUsd: fila.pendiente_usd,
    alta: dialogo.tipo === "alta",
  });

  return (
    <form
      className="contents"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!guardando && !exceso) void guardar(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>{descripcionDialogoPago(fila, mes)}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={etiquetaMontoPago(form.moneda)}
          required
          error={errores.monto}
          hint={hintMonto ?? undefined}
        >
          <Input
            ref={montoRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            placeholder="0.00"
            value={form.monto}
            onChange={(e) => cambiar("monto", e.target.value)}
          />
        </Field>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Moneda</Label>
          <GrupoOpciones
            etiqueta="Moneda del pago"
            valor={form.moneda}
            opciones={[
              { value: "USD", etiqueta: "USD" },
              { value: "MXN", etiqueta: "MXN" },
            ]}
            onCambiar={(v) => cambiarMoneda(v as MonedaPagoSocio)}
          />
        </div>

        {form.moneda === "MXN" && (
          <div className="sm:col-span-2">
            <Field
              label="Tipo de cambio USD/MXN"
              required
              error={errores.tc}
              hint="El pago descuenta su equivalente en dólares (monto ÷ T.C.); el sistema lo calcula al guardar."
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.000001"
                min={0}
                placeholder="18.50"
                value={form.tc}
                onChange={(e) => cambiar("tc", e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Fecha del pago" required error={errores.fecha_pago}>
          <Input
            type="date"
            max={hoyLocal}
            value={form.fecha_pago}
            onChange={(e) => cambiar("fecha_pago", e.target.value)}
          />
        </Field>
        <Field label="Entregó" required error={errores.entregado_por_id} hint="Quién le entregó el dinero.">
          <SearchableSelect
            options={opciones}
            value={form.entregado_por_id}
            onChange={(v) => cambiar("entregado_por_id", v)}
            placeholder="Elige quién entregó"
            searchPlaceholder="Buscar persona…"
          />
        </Field>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-sm font-medium">
            ¿Cómo se pagó?<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <GrupoOpciones
            etiqueta="Método de pago"
            valor={form.metodo}
            opciones={METODOS_PAGO_SOCIO.map((m) => ({ value: m.value, etiqueta: m.etiqueta }))}
            onCambiar={(v) => cambiar("metodo", v as FormPagoSocio["metodo"])}
          />
          {errores.metodo && (
            <p role="alert" className="text-xs text-destructive">
              {errores.metodo}
            </p>
          )}
        </div>

        <Field
          label="Recibió (opcional)"
          error={errores.recibido_por}
          hint="Solo si no lo recibió el socio en persona."
        >
          <Input
            maxLength={RECIBIDO_POR_MAX}
            value={form.recibido_por}
            onChange={(e) => cambiar("recibido_por", e.target.value)}
          />
        </Field>
        <Field
          label="Folio de factura (opcional)"
          error={errores.factura_folio}
          hint="Si el socio cobra con factura (asesoría profesional)."
        >
          <Input
            maxLength={FACTURA_FOLIO_MAX}
            value={form.factura_folio}
            onChange={(e) => cambiar("factura_folio", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Referencia (opcional)" error={errores.referencia}>
            <Input
              maxLength={REFERENCIA_MAX}
              placeholder="Folio de la transferencia, número de cheque…"
              value={form.referencia}
              onChange={(e) => cambiar("referencia", e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notas (opcional)" error={errores.notas}>
            <Textarea
              rows={2}
              maxLength={NOTAS_PAGO_MAX}
              value={form.notas}
              onChange={(e) => cambiar("notas", e.target.value)}
            />
          </Field>
        </div>

        {dialogo.tipo === "alta" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">Comprobante (opcional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1"
                onClick={() => inputRef.current?.click()}
              >
                <PaperClipIcon className="h-3.5 w-3.5" aria-hidden />
                {archivo ? "Cambiar archivo" : "Elegir foto o PDF"}
              </Button>
              {archivo && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{archivo.name}</span>
                  <button
                    type="button"
                    className="cursor-pointer rounded p-0.5 hover:text-foreground"
                    aria-label="Quitar el archivo"
                    title="Quitar el archivo"
                    onClick={() => setArchivo(null)}
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Foto o PDF de la transferencia, el cheque o el recibo firmado (hasta 10 MB).
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf,.heic,.heif"
              className="hidden"
              aria-label="Elegir el comprobante del pago"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!f) return;
                const motivo = motivoComprobanteInvalido(f);
                if (motivo) {
                  toast.error(motivo);
                  return;
                }
                setArchivo(f);
              }}
            />
          </div>
        )}
      </div>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errorGeneral}
        </p>
      )}

      {confirmar && <AvisoExcesoPago titulo={confirmar.titulo} descripcion={confirmar.descripcion} />}

      <DialogFooter>
        {confirmar ? (
          <BotonesExcesoPago
            tipo={dialogo.tipo}
            guardando={guardando !== null}
            onRevisar={() => setExceso(null)}
            onConfirmar={() => void guardar(true)}
          />
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={guardando !== null}
              onClick={onCerrar}
            >
              Cancelar
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={guardando !== null}>
              {guardando === "comprobante"
                ? "Subiendo comprobante…"
                : guardando
                  ? "Guardando…"
                  : dialogo.tipo === "alta"
                    ? "Registrar pago"
                    : "Guardar cambios"}
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}

/** Recuadro ámbar del 409 PAGO_EXCEDE_UTILIDAD (exportado para las pruebas). */
export function AvisoExcesoPago({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div
      role="alert"
      data-confirmar-exceso
      className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
        {titulo}
      </p>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">{descripcion}</p>
    </div>
  );
}

/** «Revisar el monto» / «Registrar de todas formas» (exportado para las pruebas). */
export function BotonesExcesoPago({
  tipo,
  guardando,
  onRevisar,
  onConfirmar,
}: {
  tipo: DialogoPago["tipo"];
  guardando: boolean;
  onRevisar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="cursor-pointer"
        disabled={guardando}
        onClick={onRevisar}
      >
        {BOTON_REVISAR_MONTO}
      </Button>
      <Button
        type="button"
        className="cursor-pointer"
        disabled={guardando}
        data-accion="confirmar-exceso-pago-socio"
        onClick={onConfirmar}
      >
        {guardando
          ? "Guardando…"
          : tipo === "alta"
            ? BOTON_REGISTRAR_CON_EXCESO
            : BOTON_GUARDAR_CON_EXCESO}
      </Button>
    </>
  );
}

/** Botones de opción única (moneda, método): nada de `<select>` nativo. */
function GrupoOpciones({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: string;
  opciones: { value: string; etiqueta: string }[];
  onCambiar: (v: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
    >
      {opciones.map((o) => {
        const activo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambiar(o.value)}
            className={cn(
              "h-7 flex-1 cursor-pointer rounded-md px-2 text-xs font-medium transition-colors",
              activo
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
