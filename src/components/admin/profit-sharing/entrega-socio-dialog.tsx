"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
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
  BOTON_GUARDAR_ADELANTO,
  BOTON_REGISTRAR_ADELANTO,
  BOTON_REVISAR_MONTO,
  ETIQUETA_REGISTRAR_ENTREGA,
  FACTURA_FOLIO_MAX,
  METODOS_PAGO_SOCIO,
  NOTAS_PAGO_MAX,
  RECIBIDO_POR_MAX,
  REFERENCIA_MAX,
  TEXTO_FALLO_RED_PAGO,
  avisoFechaAntesDelArranque,
  cambiosPago,
  confirmacionAdelanto,
  etiquetaMontoPago,
  etiquetaRegistrarEntrega,
  formAlCambiarMoneda,
  formDePago,
  formInicialAlta,
  hayErrores,
  hintMontoPago,
  hintTcPago,
  opcionesCorrespondeAvion,
  opcionesCorrespondeMes,
  opcionesEntrego,
  pasoTrasGuardarEntrega,
  payloadAltaPago,
  piezasPago,
  textoMesEnCurso,
  textoPorEntregarHoy,
  validarFormPago,
  type ContextoEntrega,
  type ContextoRegistro,
  type ErroresFormPago,
  type FormPagoSocio,
} from "@/lib/admin/reparto-pagos";
import { motivoComprobanteInvalido } from "@/lib/admin/facturas-emitidas";
import { crearPagoSocioAction, editarPagoSocioAction } from "@/app/admin/profit-sharing/actions";
import { adjuntarComprobantePagoSocio } from "@/lib/api/reparto-pagos-browser";
import type { MonedaPagoSocio, PagoSocio, ResultadoPagoSocio } from "@/types/reparto-pagos";

/** Qué abre el diálogo: el alta de una entrega o la edición de una. */
export type DialogoEntrega =
  | { tipo: "alta"; contexto: ContextoEntrega }
  | { tipo: "edicion"; contexto: ContextoEntrega; pago: PagoSocio };

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
 * Botón «Registrar entrega» de UN socio con su diálogo (el MISMO en la lista
 * de socios, en su estado de cuenta y en el reparto de utilidades).
 */
export function BotonRegistrarEntrega({
  contexto,
  registro,
  size = "sm",
  variant = "outline",
  className,
}: {
  contexto: ContextoEntrega;
  registro: ContextoRegistro;
  size?: "sm" | "default";
  variant?: "outline" | "default";
  className?: string;
}) {
  const [dialogo, setDialogo] = useState<(DialogoEntrega & { clave: string }) | null>(null);
  const contador = useRef(0);
  const etiqueta = etiquetaRegistrarEntrega(contexto.socio.nombre);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn("cursor-pointer gap-1", className)}
        data-accion="registrar-entrega-socio"
        title={etiqueta}
        aria-label={etiqueta}
        onClick={() => {
          contador.current += 1;
          setDialogo({ tipo: "alta", contexto, clave: `alta-${contador.current}` });
        }}
      >
        <PlusIcon className="h-3.5 w-3.5" aria-hidden />
        {ETIQUETA_REGISTRAR_ENTREGA}
      </Button>
      <EntregaSocioDialog dialogo={dialogo} onCerrar={() => setDialogo(null)} registro={registro} />
    </>
  );
}

/**
 * «Registrar entrega» / «Editar entrega» a un socio. El alta llega prellenada
 * (monto = lo por entregar del API, USD, hoy Cancún, entregó = yo); el
 * MÉTODO se elige siempre. Un 409 PAGO_EXCEDE_SALDO se convierte en la
 * confirmación del ADELANTO, que reintenta con `aceptar_exceso` y el MISMO
 * `client_request_id`. Tras registrar, el diálogo ofrece adjuntar el
 * comprobante (del navegador directo al API).
 *
 * Mientras GUARDA o SUBE no se cierra (ni con la X, ni Esc, ni clic fuera):
 * reabrirlo generaría otro `client_request_id` y una entrega que sí entró se
 * registraría dos veces.
 */
export function EntregaSocioDialog({
  dialogo,
  onCerrar,
  registro,
}: {
  dialogo: (DialogoEntrega & { clave: string }) | null;
  onCerrar: () => void;
  registro: ContextoRegistro;
}) {
  // La clave del diálogo que está ocupado (null = libre). Atada a la clave
  // para que un diálogo nuevo nunca herede el candado de otro.
  const [ocupadoEn, setOcupadoEn] = useState<string | null>(null);
  const ocupado = dialogo !== null && ocupadoEn === dialogo.clave;
  return (
    <Dialog open={dialogo !== null} onOpenChange={(o) => !o && !ocupado && onCerrar()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!ocupado}>
        {dialogo && (
          <FormularioEntrega
            key={dialogo.clave}
            dialogo={dialogo}
            onCerrar={onCerrar}
            onOcupado={(o) => setOcupadoEn(o ? dialogo.clave : null)}
            registro={registro}
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
 * servidor sería AYER.
 */
export function FormularioEntrega({
  dialogo,
  onCerrar,
  onOcupado,
  registro,
  registradaInicial = null,
}: {
  dialogo: DialogoEntrega;
  onCerrar: () => void;
  /** Avisa al diálogo cuándo está ocupado (para no dejarlo cerrar). */
  onOcupado?: (ocupado: boolean) => void;
  registro: ContextoRegistro;
  /** Solo pruebas: arranca en el paso «Entrega registrada». */
  registradaInicial?: ResultadoPagoSocio | null;
}) {
  const router = useRouter();
  const { contexto } = dialogo;
  const pago = dialogo.tipo === "edicion" ? dialogo.pago : null;
  const alta = dialogo.tipo === "alta";
  const [hoyLocal] = useState(() => todayCancun() || registro.hoy);
  const [inicial] = useState<FormPagoSocio>(() =>
    pago
      ? formDePago(pago)
      : formInicialAlta({
          porEntregarUsd: contexto.porEntregarUsd,
          hoy: hoyLocal,
          meId: registro.me.id,
          mesSugerido: contexto.mesSugerido,
        }),
  );
  // Lo que el alta prellenó (lo por entregar en USD); en la edición no aplica.
  const montoPrellenado = pago ? null : inicial.monto;
  const [form, setForm] = useState<FormPagoSocio>(inicial);
  // Idempotencia: UN id por apertura; el reintento (red o «Registrar como
  // adelanto») viaja con el MISMO id.
  const [clientRequestId] = useState(nuevoIdSolicitud);
  const [errores, setErrores] = useState<ErroresFormPago>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [exceso, setExceso] = useState<{ details: unknown } | null>(null);
  const [guardando, setGuardandoLocal] = useState(false);
  const [registrada, setRegistrada] = useState<ResultadoPagoSocio | null>(registradaInicial);
  const montoRef = useRef<HTMLInputElement>(null);

  const setGuardando = (g: boolean) => {
    setGuardandoLocal(g);
    onOcupado?.(g);
  };

  const opcionesEntrega = useMemo(
    () =>
      opcionesEntrego(
        registro.usuarios,
        registro.me,
        pago ? { id: pago.entregado_por, nombre: pago.entregado_por_nombre } : null,
      ),
    [registro.usuarios, registro.me, pago],
  );
  const opcionesMes = useMemo(
    () => opcionesCorrespondeMes(contexto.cuentaDesdeMes, hoyLocal, inicial.mes),
    [contexto.cuentaDesdeMes, hoyLocal, inicial.mes],
  );
  const opcionesAvion = useMemo(
    () => opcionesCorrespondeAvion(contexto.aviones, pago?.aeronave ?? null),
    [contexto.aviones, pago],
  );

  if (registrada) {
    return (
      <PasoComprobante
        resultado={registrada}
        socioNombre={contexto.socio.nombre}
        onCerrar={onCerrar}
        onOcupado={onOcupado}
      />
    );
  }

  const cambiar = <K extends keyof FormPagoSocio>(llave: K, valor: FormPagoSocio[K]) => {
    setForm((f) => ({ ...f, [llave]: valor }));
    setErrores((e) => {
      if (!e[llave]) return e;
      const resto = { ...e };
      delete resto[llave];
      return resto;
    });
    // La confirmación del adelanto habla de ESTE monto: si algo cambia, se
    // vuelve a preguntar con lo nuevo.
    setExceso(null);
    setErrorGeneral(null);
  };

  // Moneda: en el alta, pasar a MXN sin tocar el monto lo VACÍA (el
  // prellenado está en DÓLARES), prellena el T.C. oficial y lleva el foco.
  const cambiarMoneda = (moneda: MonedaPagoSocio) => {
    const nuevo = formAlCambiarMoneda(form, moneda, montoPrellenado, registro.tcOficial);
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
    setGuardando(true);
    let res: Awaited<ReturnType<typeof crearPagoSocioAction>> | null;
    try {
      if (dialogo.tipo === "alta") {
        res = await crearPagoSocioAction(
          payloadAltaPago(form, {
            socio_id: contexto.socio.id,
            client_request_id: clientRequestId,
            meId: registro.me.id,
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
      // de Vercel). Sin esto el diálogo se quedaba «Guardando…» sin salida.
      setGuardando(false);
      setErrorGeneral(TEXTO_FALLO_RED_PAGO);
      return;
    }
    setGuardando(false);
    const paso = pasoTrasGuardarEntrega(res, dialogo.tipo);
    switch (paso.paso) {
      case "sin-cambios":
        toast.info("No hay cambios que guardar.");
        onCerrar();
        return;
      case "adelanto":
        // Mismo diálogo, misma llave: «Registrar como adelanto» reintenta
        // con `aceptar_exceso`.
        setExceso({ details: paso.details });
        return;
      case "refrescar":
        // Otra persona la borró o la cambió: se cierra y se ve lo de hoy.
        toast.info(paso.mensaje);
        onCerrar();
        router.refresh();
        return;
      case "error":
        setErrorGeneral(paso.mensaje);
        return;
      case "comprobante":
        router.refresh();
        if (paso.resultado.idempotente) {
          toast.info("Esa entrega ya estaba registrada; no se duplicó.");
        } else {
          toast.success(`Entrega registrada a ${contexto.socio.nombre}.`);
        }
        // Paso 2: ofrecer el comprobante escaneado.
        setRegistrada(paso.resultado);
        return;
      case "cerrar":
        router.refresh();
        toast.success(
          dialogo.tipo === "alta"
            ? `Entrega registrada a ${contexto.socio.nombre}.`
            : `Entrega a ${contexto.socio.nombre} actualizada.`,
        );
        onCerrar();
        return;
    }
  };

  const confirmar = exceso ? confirmacionAdelanto(exceso.details, dialogo.tipo) : null;
  const titulo = alta
    ? `Registrar entrega a ${contexto.socio.nombre}`
    : `Editar entrega a ${contexto.socio.nombre}`;
  const hintMonto = hintMontoPago({
    moneda: form.moneda,
    porEntregarUsd: contexto.porEntregarUsd,
    alta,
  });
  // La parte del mes EN CURSO de lo por entregar todavía cambia: se dice
  // junto al número (números del API; aquí no se resta nada).
  const enCurso = alta ? textoMesEnCurso(contexto.mesEnCursoUsd, contexto.mesEnCurso) : null;
  // Una fecha antes del arranque (un dedazo de año) sí descuenta del saldo
  // pero no sale en los movimientos desde el arranque: se dice ANTES.
  const avisoFecha = avisoFechaAntesDelArranque(form.fecha_pago, contexto.cuentaDesdeMes);

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
        <DialogDescription>
          {alta ? (
            <>
              <span className="font-medium text-foreground" data-por-entregar-hoy>
                {textoPorEntregarHoy(contexto.porEntregarUsd)}
              </span>
              {enCurso && (
                <span className="mt-0.5 block text-xs" data-mes-en-curso>
                  {enCurso}
                </span>
              )}
            </>
          ) : (
            "Corrige los datos de la entrega. El saldo del socio se recalcula al guardar."
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={etiquetaMontoPago(form.moneda)} required error={errores.monto} hint={hintMonto ?? undefined}>
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
            etiqueta="Moneda de la entrega"
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
              hint={hintTcPago({ tc: form.tc, tcOficial: registro.tcOficial, hoy: hoyLocal })}
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

        <Field
          label="Fecha de la entrega"
          required
          error={errores.fecha_pago}
          hint={
            avisoFecha ? (
              <span className="text-amber-700 dark:text-amber-400" data-aviso-fecha-arranque>
                {avisoFecha}
              </span>
            ) : undefined
          }
        >
          <Input
            type="date"
            max={hoyLocal}
            value={form.fecha_pago}
            onChange={(e) => cambiar("fecha_pago", e.target.value)}
          />
        </Field>
        <Field label="Entregó" required error={errores.entregado_por_id} hint="Quién le entregó el dinero.">
          <SearchableSelect
            options={opcionesEntrega}
            value={form.entregado_por_id}
            onChange={(v) => cambiar("entregado_por_id", v)}
            placeholder="Elige quién entregó"
            searchPlaceholder="Buscar persona…"
          />
        </Field>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-sm font-medium">
            ¿Cómo se entregó?<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <GrupoOpciones
            etiqueta="Método de la entrega"
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

        <Field label="Recibió (opcional)" error={errores.recibido_por} hint="Solo si no lo recibió el socio en persona.">
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

        <Field
          label="Corresponde al mes (opcional)"
          error={errores.mes}
          hint="Solo informativo: la entrega descuenta del saldo total del socio."
        >
          <SearchableSelect
            options={opcionesMes}
            value={form.mes}
            onChange={(v) => cambiar("mes", v)}
            placeholder="Sin mes"
            searchPlaceholder="Buscar mes…"
          />
        </Field>
        <Field label="Corresponde al avión (opcional)" error={errores.aeronave_id}>
          <SearchableSelect
            options={opcionesAvion}
            value={form.aeronave_id}
            onChange={(v) => cambiar("aeronave_id", v)}
            placeholder="Sin avión"
            searchPlaceholder="Buscar matrícula…"
          />
        </Field>

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
      </div>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errorGeneral}
        </p>
      )}

      {confirmar && <AvisoAdelanto titulo={confirmar.titulo} descripcion={confirmar.descripcion} />}

      <DialogFooter>
        {confirmar ? (
          <BotonesAdelanto
            tipo={dialogo.tipo}
            guardando={guardando}
            onRevisar={() => setExceso(null)}
            onConfirmar={() => void guardar(true)}
          />
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={guardando}
              onClick={onCerrar}
            >
              Cancelar
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={guardando}>
              {guardando ? "Guardando…" : alta ? ETIQUETA_REGISTRAR_ENTREGA : "Guardar cambios"}
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}

/**
 * Paso 2 del alta: la entrega YA quedó; se ofrece adjuntar el comprobante
 * escaneado (foto o PDF) — del navegador directo al API. Si la subida falla,
 * la entrega sigue registrada y se puede reintentar aquí o desde su renglón.
 */
export function PasoComprobante({
  resultado,
  socioNombre,
  onCerrar,
  onOcupado,
}: {
  resultado: ResultadoPagoSocio;
  socioNombre: string;
  onCerrar: () => void;
  onOcupado?: (ocupado: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjunto, setAdjunto] = useState(Boolean(resultado.pago.comprobante_path));
  const p = piezasPago(resultado.pago);
  const saldo = resultado.cuenta?.por_entregar_usd;

  const subir = async (file: File) => {
    const motivo = motivoComprobanteInvalido(file);
    if (motivo) {
      setError(motivo);
      return;
    }
    setError(null);
    setSubiendo(true);
    onOcupado?.(true);
    const res = await adjuntarComprobantePagoSocio(resultado.pago.id, file).catch(() => ({
      ok: false as const,
      error: "No se pudo subir el comprobante. El comprobante NO se guardó.",
    }));
    setSubiendo(false);
    onOcupado?.(false);
    if (!res.ok) {
      setError(`${res.error} La entrega SÍ quedó registrada: vuelve a intentarlo o adjúntalo después desde su renglón.`);
      return;
    }
    setAdjunto(true);
    toast.success("Comprobante adjuntado.");
    router.refresh();
    onCerrar();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" aria-hidden />
          Entrega registrada
        </DialogTitle>
        <DialogDescription>
          {`${p.monto} a ${socioNombre} · ${p.fecha} · ${p.metodo}.`}
          {saldo != null && (
            <span className="mt-1 block font-medium text-foreground" data-saldo-despues>
              {textoPorEntregarHoy(saldo)}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-paso-comprobante>
        <p className="text-sm font-medium">¿Tienes el comprobante?</p>
        <p className="text-xs text-muted-foreground">
          Foto o PDF de la transferencia, el cheque o el recibo firmado (hasta 10 MB). Puedes
          adjuntarlo ahora o después desde el estado de cuenta del socio.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer gap-1"
          disabled={subiendo || adjunto}
          data-accion="adjuntar-comprobante-entrega"
          onClick={() => inputRef.current?.click()}
        >
          <PaperClipIcon className="h-3.5 w-3.5" aria-hidden />
          {subiendo ? "Subiendo comprobante…" : adjunto ? "Comprobante adjuntado" : "Adjuntar comprobante"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.heic,.heif"
          className="hidden"
          aria-label="Elegir el comprobante de la entrega"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void subir(f);
          }}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" className="cursor-pointer" disabled={subiendo} onClick={onCerrar}>
          {adjunto ? "Listo" : "Listo, sin comprobante por ahora"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Recuadro ámbar del 409 PAGO_EXCEDE_SALDO (exportado para las pruebas). */
export function AvisoAdelanto({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div
      role="alert"
      data-confirmar-adelanto
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

/** «Revisar el monto» / «Registrar como adelanto» (exportado para las pruebas). */
export function BotonesAdelanto({
  tipo,
  guardando,
  onRevisar,
  onConfirmar,
}: {
  tipo: DialogoEntrega["tipo"];
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
        data-accion="confirmar-adelanto-socio"
        onClick={onConfirmar}
      >
        {guardando ? "Guardando…" : tipo === "alta" ? BOTON_REGISTRAR_ADELANTO : BOTON_GUARDAR_ADELANTO}
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
