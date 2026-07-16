"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  CheckCircleIcon,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createGastoAction,
  buscarVuelosCercanosAction,
  leerFacturaIAAction,
  type GastoTicketIA,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import { Field } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";

const TIPOS_FACTURA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

const CATEGORIAS = [
  { value: "GAS", label: "GAS" },
  { value: "OPERACIONES", label: "OPERACIONES" },
  { value: "TUAS", label: "TUAS" },
  { value: "FBO", label: "FBO" },
  { value: "COMIDA", label: "COMIDA" },
  { value: "HOTEL", label: "HOTEL" },
  { value: "TAXI", label: "TAXI" },
  { value: "REFACCION", label: "REFACCION" },
  { value: "PERMISO", label: "PERMISO" },
  // Honorario del freelance que voló el avión (doc 3.7): resta en el reparto
  // como gasto directo del vuelo.
  { value: "PILOTO_EXTERNO", label: "Piloto externo (honorario)" },
  { value: "FIJO", label: "FIJO" },
  // Gasto de la operación que NO pertenece a un vuelo (servicios,
  // mantenimientos, honorarios — hoja "gastos indirectos" del equipo).
  { value: "INDIRECTO", label: "Gasto indirecto (sin vuelo)" },
  { value: "OTRO", label: "OTRO" },
];

const MEDIOS = [
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
];

const ESTATUS = [
  { value: "SIN_COMPROBANTE", label: "Sin comprobante (factura por llegar)" },
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
];

/** Hoy en hora Cancún (UTC−5 fija) para el default del formulario. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function emptyValues(defaults?: {
  vueloId?: string;
  aeronaveId?: string;
  categoria?: string;
}): GastoCreateValues {
  return {
    categoria: defaults?.categoria ?? "OPERACIONES",
    monto: "",
    moneda: "MXN",
    fecha_gasto: hoyCancun(),
    medio_pago: "TRANSFERENCIA",
    estatus_comprobante: "SIN_COMPROBANTE",
    aeronave_id: defaults?.aeronaveId ?? "",
    vuelo_id: defaults?.vueloId ?? "",
    proveedor_id: "",
    tc_gasto: "",
    notas: "",
  };
}

/** Alta manual de gasto operativo desde el panel (lo sube administración). */
export function ExpenseCreateDialog({
  aircraft,
  providers,
  defaultVueloId,
  defaultVueloFolio,
  defaultAeronaveId,
  defaultCategoria,
  defaultPilotoNombre,
}: {
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Con vuelo: el gasto queda LIGADO (reporte por vuelo, reparto, pre-cierre). */
  defaultVueloId?: string;
  defaultVueloFolio?: number;
  defaultAeronaveId?: string;
  defaultCategoria?: string;
  /** Piloto del vuelo prefijado (para "simular como piloto"). null = sin piloto. */
  defaultPilotoNombre?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Backfill de oficina: guardar el gasto COMO SI lo subiera el piloto del
  // vuelo (mismo switch que la app). Solo con un vuelo LIGADO.
  const [comoPiloto, setComoPiloto] = useState(false);
  // Factura/recibo adjunto (foto o PDF): se sube al bucket privado al guardar.
  const [factura, setFactura] = useState<File | null>(null);
  const facturaRef = useRef<HTMLInputElement>(null);
  // Lectura IA del adjunto: autollenado best-effort (siempre revisable a mano).
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [aiRaw, setAiRaw] = useState<GastoTicketIA | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Vuelos alrededor de la fecha del gasto (±15 días), para dejarlo LIGADO al
  // vuelo desde el alta — pedido del cliente: los gastos viven en su vuelo.
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);
  const formDefaults = {
    vueloId: defaultVueloId,
    aeronaveId: defaultAeronaveId,
    categoria: defaultCategoria,
  };
  // Vuelo prefijado (alta desde el detalle) SIN piloto: no se puede atribuir.
  const vueloSinPiloto = !!defaultVueloId && !defaultPilotoNombre;
  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoCreateValues>({
    defaultValues: emptyValues(formDefaults),
  });

  const fechaGasto = watch("fecha_gasto");
  useEffect(() => {
    // Con vuelo prefijado (alta desde el detalle del vuelo) no hace falta lista.
    if (!open || defaultVueloId) return;
    let cancel = false;
    buscarVuelosCercanosAction(fechaGasto).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, defaultVueloId, fechaGasto]);

  const aplicarIA = (ai: GastoTicketIA) => {
    const llenado: string[] = [];
    if (ai.monto != null && ai.monto > 0) {
      setValue("monto", String(ai.monto));
      llenado.push(`$${ai.monto}`);
    }
    if (ai.moneda === "MXN" || ai.moneda === "USD") setValue("moneda", ai.moneda);
    if (ai.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ai.fecha)) {
      setValue("fecha_gasto", ai.fecha);
      llenado.push(ai.fecha);
    }
    if (ai.categoria_sugerida && CATEGORIAS.some((c) => c.value === ai.categoria_sugerida)) {
      setValue("categoria", ai.categoria_sugerida);
      llenado.push(ai.categoria_sugerida);
    }
    if (ai.medio_pago && MEDIOS.some((m) => m.value === ai.medio_pago)) {
      setValue("medio_pago", ai.medio_pago);
    }
    // Proveedor: match laxo contra el catálogo por nombre.
    if (ai.proveedor) {
      const needle = ai.proveedor.toLowerCase();
      const match = providers.find(
        (p) =>
          p.nombre.toLowerCase().includes(needle) || needle.includes(p.nombre.toLowerCase()),
      );
      if (match) {
        setValue("proveedor_id", match.id);
        llenado.push(match.nombre);
      }
    }
    // Matrícula leída → avión (solo si el vuelo no lo fijó ya).
    if (ai.matricula && !watch("aeronave_id")) {
      const av = aircraft.find(
        (a) => a.matricula.replace(/-/g, "") === ai.matricula!.replace(/-/g, ""),
      );
      if (av) setValue("aeronave_id", av.id);
    }
    const notas: string[] = [];
    if (ai.concepto) notas.push(ai.concepto);
    if (ai.proveedor && !providers.some((p) => p.nombre.toLowerCase() === ai.proveedor!.toLowerCase()))
      notas.push(`Proveedor: ${ai.proveedor}`);
    if (ai.matricula) notas.push(`Matrícula: ${ai.matricula}`);
    if (notas.length > 0 && !watch("notas")) setValue("notas", notas.join(" · "));
    toast.success(
      llenado.length > 0
        ? `IA leyó la factura: ${llenado.join(" · ")}. Revisa antes de guardar.`
        : "IA leyó la factura; revisa los campos.",
    );
  };

  const leerConIA = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.info("Archivo muy grande para la lectura IA (máx 8 MB); captura manual.");
      return;
    }
    setLeyendoIA(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });
      const esExcel =
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "text/csv";
      const res = await leerFacturaIAAction(
        file.type === "application/pdf"
          ? { pdfBase64: b64 }
          : esExcel
            ? { excelBase64: b64, excelFilename: file.name }
            : { imageBase64: b64, mediaType: file.type },
      );
      if (!res.ok || !res.data) {
        toast.info(`La IA no pudo leer la factura${res.error ? `: ${res.error}` : ""}; captura manual.`);
        return;
      }
      if (!res.data.disponible || !res.data.legible) {
        toast.info(
          res.data.motivo
            ? `IA no disponible: ${res.data.motivo}`
            : "La factura no se distingue bien; captura manual.",
        );
        return;
      }
      setAiRaw(res.data);
      aplicarIA(res.data);
    } finally {
      setLeyendoIA(false);
    }
  };

  const seleccionarFactura = (file: File | null) => {
    if (file && !TIPOS_FACTURA.includes(file.type)) {
      toast.error(
        `Formato no soportado (${file.type || "desconocido"}). Usa foto (JPG/PNG/WebP), PDF, Excel (.xlsx) o CSV.`,
      );
      return;
    }
    setFactura(file);
    setAiRaw(null);
    if (file && watch("estatus_comprobante") === "SIN_COMPROBANTE") {
      setValue("estatus_comprobante", "FACTURA");
    }
    if (!file && watch("estatus_comprobante") === "FACTURA") {
      setValue("estatus_comprobante", "SIN_COMPROBANTE");
    }
    if (file) void leerConIA(file);
  };

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // Primero el archivo: si la subida falla, no se crea el gasto a medias.
      let fotoPath = "";
      if (factura) {
        try {
          fotoPath = await uploadGastoComprobante(factura);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo subir la factura");
          return;
        }
      }
      // "Como piloto" solo aplica con un vuelo ligado y con piloto.
      const aplicarComoPiloto = comoPiloto && !!values.vuelo_id && !vueloSinPiloto;
      const result = await createGastoAction({
        ...values,
        foto_url: fotoPath,
        valor_ia_extraido: aiRaw ? ({ ...aiRaw } as Record<string, unknown>) : undefined,
        capturar_como_piloto: aplicarComoPiloto,
      });
      if (result.ok) {
        toast.success(
          aplicarComoPiloto
            ? "Gasto registrado como del piloto del vuelo"
            : factura
              ? "Gasto registrado con su factura"
              : "Gasto registrado",
        );
        setFactura(null);
        setAiRaw(null);
        setComoPiloto(false);
        if (facturaRef.current) facturaRef.current.value = "";
        reset(emptyValues(formDefaults));
        setOpen(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        {defaultVueloId ? "Registrar gasto" : "Nuevo gasto"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setComoPiloto(false);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo gasto (oficina)</DialogTitle>
            <DialogDescription>
              {defaultVueloId ? (
                <>
                  Se liga al vuelo{defaultVueloFolio != null ? ` #${defaultVueloFolio}` : ""}:
                  entra a su reporte y resta en el reparto (ej. honorario del piloto externo).
                </>
              ) : (
                <>
                  Captura manual de un gasto operativo. Queda marcado como subido por
                  administración; si la factura llega después, se amarra en Facturas recibidas.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Zona IA: lo primero que se ve — arrastra la factura y la IA
                llena el gasto. El input oculto cubre el click. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!leyendoIA && !factura) facturaRef.current?.click();
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !leyendoIA && !factura) {
                  e.preventDefault();
                  facturaRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!leyendoIA) setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                if (leyendoIA) return;
                const file = e.dataTransfer.files?.[0] ?? null;
                if (file) seleccionarFactura(file);
              }}
              className={cn(
                "rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
                arrastrando
                  ? "border-brand-500 bg-brand-500/15"
                  : leyendoIA
                    ? "border-brand-500/70 bg-brand-500/10 animate-pulse"
                    : factura
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "cursor-pointer border-brand-500/50 bg-brand-500/5 hover:border-brand-500 hover:bg-brand-500/10",
              )}
            >
              {leyendoIA ? (
                <div className="flex flex-col items-center gap-1.5">
                  <SparklesIcon className="h-8 w-8 animate-bounce text-brand-500" />
                  <p className="text-sm font-medium">Leyendo la factura con IA…</p>
                  <p className="text-xs text-muted-foreground truncate max-w-full">
                    {factura?.name}
                  </p>
                </div>
              ) : factura ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-500" />
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium">{factura.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {aiRaw
                        ? "La IA llenó los campos — revísalos antes de guardar."
                        : "Adjunta como comprobante (captura los datos a mano)."}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Quitar el archivo"
                    onClick={(e) => {
                      e.stopPropagation();
                      seleccionarFactura(null);
                    }}
                    className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <SparklesIcon className="h-8 w-8 text-brand-500" />
                  <p className="text-sm font-semibold">
                    Arrastra aquí la factura y la IA llena el gasto
                  </p>
                  <p className="text-xs text-muted-foreground">
                    o haz clic para elegirla · foto, PDF o Excel — monto, fecha,
                    categoría y proveedor se llenan solos
                  </p>
                </div>
              )}
            </div>
            <input
              ref={facturaRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,text/csv"
              className="hidden"
              onChange={(e) => {
                seleccionarFactura(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />

            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  {...register("monto")}
                />
              </Field>
              <Field label="Moneda">
                <SearchableSelect
                  options={[
                    { value: "MXN", label: "MXN" },
                    { value: "USD", label: "USD" },
                  ]}
                  value={watch("moneda")}
                  onChange={(v) => setValue("moneda", v)}
                  placeholder="Moneda"
                />
              </Field>
              <Field label="Fecha del gasto">
                <Input type="date" {...register("fecha_gasto")} />
              </Field>
            </div>

            {watch("moneda") === "MXN" && (
              <Field
                label="Tipo de cambio (MXN por USD)"
                hint="Sin TC, el gasto queda fuera del balance USD del reparto y bloquea el pre-cierre."
              >
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ej. 18.50"
                  {...register("tc_gasto")}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <SearchableSelect
                  // Un gasto DEL VUELO no puede ser indirecto (contradicción):
                  // la opción solo existe en el alta global.
                  options={
                    defaultVueloId
                      ? CATEGORIAS.filter((c) => c.value !== "INDIRECTO")
                      : CATEGORIAS
                  }
                  value={watch("categoria")}
                  onChange={(v) => {
                    setValue("categoria", v);
                    // INDIRECTO = sin vuelo: se limpia el enlace si lo había.
                    if (v === "INDIRECTO" && watch("vuelo_id")) {
                      setValue("vuelo_id", "");
                      setComoPiloto(false);
                    }
                  }}
                  placeholder="Categoría"
                />
              </Field>
              <Field label="Comprobante">
                <SearchableSelect
                  options={ESTATUS}
                  value={watch("estatus_comprobante")}
                  onChange={(v) => setValue("estatus_comprobante", v)}
                  placeholder="Estatus"
                />
              </Field>
            </div>

            {!defaultVueloId && watch("categoria") === "INDIRECTO" && (
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Gasto <span className="font-medium">indirecto</span>: no se liga a
                ningún vuelo (avión opcional). Por ahora queda fuera del reparto;
                su tratamiento se definirá con el equipo.
              </p>
            )}
            {!defaultVueloId && watch("categoria") !== "INDIRECTO" && (
              <Field
                label="Vuelo"
                hint="Ligado al vuelo entra a su reporte y resta en el reparto; elige por folio, matrícula o ruta (±15 días de la fecha)."
              >
                <SearchableSelect
                  options={[
                    { value: "", label: "Sin vuelo" },
                    ...vuelos.map((v) => ({
                      value: v.id,
                      label:
                        `#${v.folio ?? "?"} · ${v.matricula ?? "sin avión"} · ${v.ruta ?? ""}` +
                        (v.fecha ? ` · ${fmtDateOnly(v.fecha)}` : ""),
                    })),
                  ]}
                  value={watch("vuelo_id")}
                  onChange={(v) => {
                    setValue("vuelo_id", v);
                    // El avión del vuelo elegido se refleja de inmediato.
                    const opt = vuelos.find((x) => x.id === v);
                    if (opt?.aeronave_id) setValue("aeronave_id", opt.aeronave_id);
                    // Sin vuelo, "como piloto" no aplica.
                    if (!v) setComoPiloto(false);
                  }}
                  placeholder="Busca por folio, matrícula o ruta"
                />
              </Field>
            )}

            {/* Simular captura del piloto (backfill de oficina): solo con un
                vuelo LIGADO. Igual que el switch de la app. */}
            {(() => {
              const hayVuelo = !!watch("vuelo_id");
              if (!hayVuelo) return null;
              const sinPiloto = vueloSinPiloto;
              return (
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium">
                      Simular operación como piloto
                    </Label>
                    <Switch
                      checked={comoPiloto && !sinPiloto}
                      disabled={sinPiloto}
                      onCheckedChange={setComoPiloto}
                    />
                  </div>
                  {sinPiloto ? (
                    <p className="text-xs text-amber-600">
                      Este vuelo no tiene piloto asignado; asígnalo para poder
                      registrarlo a su nombre.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Queda registrado como si lo hubiera subido el piloto del
                      vuelo, dentro de su operación
                      {comoPiloto && defaultPilotoNombre
                        ? ` (${defaultPilotoNombre})`
                        : ""}
                      . La auditoría conserva quién lo cargó en realidad.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Medio de pago">
                <SearchableSelect
                  options={MEDIOS}
                  value={watch("medio_pago")}
                  onChange={(v) => setValue("medio_pago", v)}
                  placeholder="Medio"
                />
              </Field>
              <Field label="Avión">
                <SearchableSelect
                  options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
                  value={watch("aeronave_id")}
                  onChange={(v) => setValue("aeronave_id", v)}
                  placeholder="Sin asignar"
                />
              </Field>
            </div>

            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>

            <Field label="Notas">
              <Textarea
                rows={2}
                placeholder="Ej. TUAS del vuelo a PTU del 28 de mayo"
                {...register("notas")}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || leyendoIA}>
                {pending ? "Guardando…" : leyendoIA ? "Leyendo factura…" : "Guardar gasto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
