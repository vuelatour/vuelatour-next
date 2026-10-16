"use client";

import { useEffect, useState, useTransition } from "react";
import { toastMesCerradoSiAplica } from "@/components/admin/aviso-mes-cerrado";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createCajaMovimientoAction,
  updateCajaMovimientoAction,
} from "@/app/admin/caja-chica/actions";
import type { MovimientoFormValues } from "@/app/admin/caja-chica/schema";
import type { CajaFondeada, CajaMovimiento, MonedaCaja } from "@/types/caja-chica";
import { Field } from "@/components/admin/form-field";
import { reposicionRecienRegistrada } from "@/lib/admin/caja-chica-excel";
import {
  BOTON_CONFIRMAR_REPOSICION_HIJA,
  BOTON_REVISAR_REPOSICION_HIJA,
  BOTON_VOLVER,
  DESTINO_ESTA_CAJA,
  ETIQUETA_REPONER_A,
  NOTA_CONFIRMAR_REPOSICION_HIJA,
  OPCION_ESTA_CAJA,
  OPCION_OTRA_CAJA,
  PLACEHOLDER_REPONER_A,
  TITULO_CONFIRMAR_REPOSICION_HIJA,
  TITULO_OPCION_OTRA_CAJA,
  nombreCajaFondeada,
  opcionCajaFondeada,
  pasoAlRegistrar,
  pistaMontoReponerA,
  textoConfirmarReposicionHija,
  valoresReponerA,
} from "@/lib/admin/caja-chica-madre";
import { todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { avisarReposicionYDescargar } from "./excel-caja-buttons";
import { AvisoCapturaAntesDelInicio } from "@/components/admin/aviso-captura-inicio";

const TIPOS = [
  { value: "REPOSICION", label: "Reposición (entra dinero al fondo)" },
  { value: "REINTEGRO", label: "Reintegro a dirección (sale efectivo)" },
  { value: "AJUSTE", label: "Ajuste (corrección, puede ser negativo)" },
];

interface MovimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fondoId: string;
  persona: string;
  moneda: MonedaCaja;
  usuarios: { id: string; nombre: string }[];
  /** Con movimiento = modo CORRECCIÓN (caso Mari, 18-ago: el ingreso quedó
   *  con la fecha equivocada y no había forma de arreglarlo): prellena todo
   *  y el submit hace PATCH en vez de crear. */
  movimiento?: CajaMovimiento | null;
  /**
   * Caja MADRE (15-oct-2026, pedido del cliente: «que pueda seleccionar a
   * quien le va a reponer el fondo»): las cajas que este fondo fondea
   * (`cajasParaReponer`). Con al menos una, el diálogo ofrece «Reponer a una
   * caja que fondea»: la REPOSICIÓN se registra en la caja de esa persona con
   * el POST de SIEMPRE y su reintegro espejo en esta caja lo escribe el API
   * (`insertarEspejo`). Sin ellas (API previo, caja que no fondea, lectura
   * caída o corrección) el diálogo queda IDÉNTICO.
   */
  cajasFondeadas?: CajaFondeada[] | null;
}

type Modo = "esta" | "otra";

export function MovimientoDialog({
  open,
  onOpenChange,
  fondoId,
  persona,
  moneda,
  usuarios,
  movimiento,
  cajasFondeadas,
}: MovimientoDialogProps) {
  const [pending, startTransition] = useTransition();
  const esCorreccion = movimiento != null;

  // Reponer a una caja hija (solo al CREAR desde una caja madre).
  const hijas = !esCorreccion && cajasFondeadas && cajasFondeadas.length > 0 ? cajasFondeadas : null;
  const [modo, setModo] = useState<Modo>("esta");
  const [destinoId, setDestinoId] = useState<string>(DESTINO_ESTA_CAJA);
  // Valores ya validados esperando el «Sí» (la confirmación del dinero).
  const [porConfirmar, setPorConfirmar] = useState<MovimientoFormValues | null>(null);
  const hija =
    hijas && modo === "otra" ? (hijas.find((c) => c.fondo_id === destinoId) ?? null) : null;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<MovimientoFormValues>({
    defaultValues: defaults(moneda, movimiento),
  });

  useEffect(() => {
    if (open) reset(defaults(moneda, movimiento));
  }, [open, moneda, movimiento, reset]);

  const tipo = watch("tipo");

  /** Cierra y suelta la elección de caja (al reabrir arranca como siempre). */
  const cerrar = (abierto: boolean) => {
    if (!abierto) {
      setModo("esta");
      setDestinoId(DESTINO_ESTA_CAJA);
      setPorConfirmar(null);
    }
    onOpenChange(abierto);
  };

  const elegirModo = (m: Modo) => {
    if (m === modo) return;
    setModo(m);
    setDestinoId(DESTINO_ESTA_CAJA);
    setPorConfirmar(null);
    // De vuelta a «esta caja»: el formulario de siempre, sin el monto prellenado.
    if (m === "esta") reset(defaults(moneda, null));
    else setValue("tipo", "REPOSICION");
  };

  /** Al elegir la caja: monto = lo POR REPONER de esa caja (editable) y fecha de hoy Cancún. */
  const elegirHija = (id: string) => {
    setDestinoId(id);
    setPorConfirmar(null);
    clearErrors("monto");
    const c = hijas?.find((x) => x.fondo_id === id);
    if (!c) return;
    const v = valoresReponerA(c, todayCancun());
    setValue("tipo", v.tipo);
    setValue("monto", v.monto);
    setValue("moneda", v.moneda);
    setValue("fecha", v.fecha);
  };

  const registrar = (values: MovimientoFormValues, confirmado: boolean) => {
    // Una reposición de 0 o negativa no se confirma (el API la rechazaría).
    if (hija && !(Number(values.monto) > 0)) {
      setError("monto", { message: "La reposición debe ser mayor a 0" });
      return;
    }
    // Regla del cliente: dinero en OTRA caja ⇒ primero se confirma.
    if (pasoAlRegistrar({ hija, confirmado }) === "confirmar") {
      setPorConfirmar(values);
      return;
    }
    startTransition(async () => {
      const result = esCorreccion
        ? await updateCajaMovimientoAction(movimiento.id, fondoId, values)
        : hija
          ? // La ruta de SIEMPRE en la caja HIJA (el espejo en esta caja lo
            // escribe el API); se recarga también esta caja madre.
            await createCajaMovimientoAction(
              hija.fondo_id,
              { ...values, tipo: "REPOSICION", moneda: hija.moneda },
              { fondoMadreId: fondoId },
            )
          : await createCajaMovimientoAction(fondoId, values);
      if (result.ok) {
        const nuevaReposicion = reposicionRecienRegistrada({
          esCorreccion,
          tipo: hija ? "REPOSICION" : values.tipo,
          creado: result.data,
        });
        if (nuevaReposicion) {
          // Pedido del cliente (24-sep-2026): al REEMBOLSAR la caja sale solo
          // el Excel de lo que se está reponiendo; el toast deja volver a
          // bajarlo. El movimiento YA quedó: si el Excel falla se dice así.
          avisarReposicionYDescargar(
            nuevaReposicion.id,
            hija ? nombreCajaFondeada(hija) : persona,
            nuevaReposicion.fecha || values.fecha || null,
          );
        } else {
          toast.success(
            esCorreccion ? "Movimiento corregido" : "Movimiento registrado",
          );
        }
        cerrar(false);
      } else if (result.fieldErrors) {
        setPorConfirmar(null);
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        setPorConfirmar(null);
        // 409 `MES_CERRADO` (API 0.0.88): el toast lleva «Ir a Reportes».
        if (!toastMesCerradoSiAplica(result)) toast.error(result.error ?? "Error desconocido");
      }
    });
  };

  const onSubmit = handleSubmit((values) => registrar(values, false));
  const confirmacion = hija && porConfirmar ? porConfirmar : null;

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esCorreccion ? "Corregir movimiento" : "Movimiento de caja chica"}
          </DialogTitle>
          <DialogDescription>
            {hija ? `${persona} → caja de ${nombreCajaFondeada(hija)}` : persona}
          </DialogDescription>
        </DialogHeader>

        {confirmacion && hija ? (
          // Confirmación ANTES de registrar (regla del cliente con el dinero).
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <p className="font-medium">{TITULO_CONFIRMAR_REPOSICION_HIJA}</p>
              <p className="mt-1">
                {textoConfirmarReposicionHija({
                  monto: confirmacion.monto,
                  hija,
                  madre: persona,
                  fecha: confirmacion.fecha,
                })}
              </p>
              <p className="mt-1 text-xs opacity-80">{NOTA_CONFIRMAR_REPOSICION_HIJA}</p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setPorConfirmar(null)}
                disabled={pending}
              >
                {BOTON_VOLVER}
              </Button>
              <Button
                type="button"
                className="cursor-pointer"
                onClick={() => registrar(confirmacion, true)}
                disabled={pending}
              >
                {pending ? "Guardando…" : BOTON_CONFIRMAR_REPOSICION_HIJA}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {hijas && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div role="group" aria-label="Qué vas a registrar" className="flex flex-wrap gap-1">
                  {(
                    [
                      { valor: "esta", etiqueta: OPCION_ESTA_CAJA, titulo: `Reposición, reintegro o ajuste en la caja de ${persona}` },
                      { valor: "otra", etiqueta: `${OPCION_OTRA_CAJA} (${hijas.length})`, titulo: TITULO_OPCION_OTRA_CAJA },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      aria-pressed={modo === o.valor}
                      title={o.titulo}
                      data-modo={o.valor}
                      onClick={() => elegirModo(o.valor)}
                      className={cn(
                        "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        modo === o.valor
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.etiqueta}
                    </button>
                  ))}
                </div>
                {modo === "otra" && (
                  <Field label={ETIQUETA_REPONER_A} required>
                    <SearchableSelect
                      options={hijas.map(opcionCajaFondeada)}
                      value={destinoId}
                      onChange={elegirHija}
                      placeholder={PLACEHOLDER_REPONER_A}
                    />
                  </Field>
                )}
              </div>
            )}

            {modo === "otra" && hijas ? (
              <p className="text-sm text-muted-foreground">
                Tipo: <span className="font-medium text-foreground">Reposición</span>
                {hija ? ` en la caja de ${nombreCajaFondeada(hija)}` : ""}
              </p>
            ) : (
              <Field label="Tipo" required>
                <SearchableSelect
                  options={TIPOS}
                  value={tipo}
                  onChange={(v) => setValue("tipo", v as MovimientoFormValues["tipo"])}
                  placeholder="Tipo de movimiento"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={`Monto (${hija ? hija.moneda : moneda})`}
                required
                error={errors.monto?.message}
                hint={hija ? pistaMontoReponerA(hija) : undefined}
              >
                <Input
                  type="number"
                  step="any"
                  {...register("monto", { required: "Requerido" })}
                />
              </Field>
              <Field label="Fecha">
                <Input type="date" {...register("fecha")} />
                <AvisoCapturaAntesDelInicio fecha={watch("fecha")} />
              </Field>
            </div>

            {tipo === "REPOSICION" && (
              <Field label="Autorizado por">
                <SearchableSelect
                  options={usuarios.map((u) => ({ value: u.id, label: u.nombre }))}
                  value={watch("autorizado_por")}
                  onChange={(v) => setValue("autorizado_por", v)}
                  placeholder="Quién autoriza (ej. Ale)"
                />
              </Field>
            )}

            <Field label="Referencia" hint="No. de depósito / comprobante">
              <Input {...register("referencia")} />
            </Field>

            <Field label="Notas">
              <Textarea rows={2} {...register("notas")} />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending || (modo === "otra" && hijas !== null && !hija)}
              >
                {pending
                  ? "Guardando…"
                  : esCorreccion
                    ? "Guardar cambios"
                    : hija
                      ? BOTON_REVISAR_REPOSICION_HIJA
                      : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}


function defaults(
  moneda: MonedaCaja,
  m?: CajaMovimiento | null,
): MovimientoFormValues {
  if (m) {
    // Corrección: prellenar TODO lo registrado (incluida la fecha — el
    // motivo original del diálogo en modo edición).
    return {
      tipo: m.tipo,
      monto: String(m.monto),
      moneda,
      fecha: m.fecha ?? "",
      autorizado_por: m.autorizado_por ?? "",
      referencia: m.referencia ?? "",
      notas: m.notas ?? "",
    };
  }
  return {
    tipo: "REPOSICION",
    monto: "",
    moneda,
    fecha: "",
    autorizado_por: "",
    referencia: "",
    notas: "",
  };
}
