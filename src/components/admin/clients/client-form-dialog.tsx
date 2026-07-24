"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "@heroicons/react/24/outline";
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
import { PhoneField } from "@/components/admin/phone-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createClientAction,
  updateClientAction,
  getClientTarifasAction,
  leerConstanciaIAAction,
  listAircraftTarifaOptionsAction,
  setClientTarifasAction,
  type AeronaveTarifaOption,
} from "@/app/admin/clients/actions";
import { ClientFormSchema, type ClientFormValues } from "@/app/admin/clients/schema";
import { RFC_EXTRANJERO, type Client } from "@/types/clients";
import { Field } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";

const CANALES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "LANDING", label: "Landing" },
  { value: "LLAMADA", label: "Llamada" },
  { value: "REFERIDO", label: "Referido" },
];

// Regímenes SAT más comunes entre los clientes del chárter (código = valor
// que viaja en el CFDI). La constancia trae el código exacto.
const REGIMENES_SAT = [
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 — Sueldos y Salarios" },
  { value: "606", label: "606 — Arrendamiento" },
  { value: "608", label: "608 — Demás ingresos" },
  { value: "612", label: "612 — Personas Físicas con Actividades Empresariales y Profesionales" },
  { value: "616", label: "616 — Sin obligaciones fiscales" },
  { value: "621", label: "621 — Incorporación Fiscal" },
  { value: "625", label: "625 — Plataformas Tecnológicas" },
  { value: "626", label: "626 — Régimen Simplificado de Confianza (RESICO)" },
];

const USOS_CFDI = [
  { value: "G03", label: "G03 — Gastos en general (el más común)" },
  { value: "G01", label: "G01 — Adquisición de mercancías" },
  { value: "S01", label: "S01 — Sin efectos fiscales" },
  { value: "I08", label: "I08 — Otra maquinaria y equipo" },
  { value: "D10", label: "D10 — Pagos por servicios educativos" },
];

const TIPOS_CONSTANCIA = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClient?: Client;
  /** Al crear (no editar): permite seleccionar al cliente recién creado in situ (ej. desde el cotizador). */
  onCreated?: (client: Client) => void;
}

export function ClientFormDialog({ open, onOpenChange, initialClient, onCreated }: ClientFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialClient;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: defaults(initialClient),
  });

  // Tarifa preferencial por avión (USD/hr): vacío = usa la default del avión.
  const [aircraft, setAircraft] = useState<AeronaveTarifaOption[]>([]);
  const [tarifas, setTarifas] = useState<Record<string, string>>({});
  // Matrícula por aeronave según el GET de tarifas: pinta también las pactadas
  // sobre aviones hoy INACTIVOS (si no, quedarían invisibles pero vigentes).
  const [tarifasMeta, setTarifasMeta] = useState<Record<string, string>>({});
  // Candado: al EDITAR no se manda el PUT de tarifas hasta tener cargado el
  // set actual — si no, guardar rápido las borraría (el PUT reemplaza todo).
  const [tarifasReady, setTarifasReady] = useState(false);
  const [tarifasError, setTarifasError] = useState(false);
  // Si el PUT de tarifas falla DESPUÉS de crear el cliente, el reintento debe
  // actualizar al ya creado, no crear un duplicado.
  const createdIdRef = useRef<string | null>(null);

  // Cliente extranjero: se factura con el RFC genérico del SAT; el API aplica
  // régimen 616, uso S01 y CP de la emisora en automático.
  const [esExtranjero, setEsExtranjero] = useState(false);
  // Cliente INTERNO (operación propia): sus cotizaciones pueden ir en $0.
  // Solo viaja en create/update si el operador tocó el switch.
  const [esInterno, setEsInterno] = useState(false);
  const esInternoTouched = useRef(false);
  // Constancia de situación fiscal → IA llena los datos fiscales.
  const [leyendoConstancia, setLeyendoConstancia] = useState(false);
  const constanciaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    reset(defaults(initialClient));
    setTarifas({});
    setTarifasMeta({});
    setTarifasReady(!initialClient);
    setTarifasError(false);
    setEsExtranjero(initialClient?.rfc === RFC_EXTRANJERO);
    setEsInterno(initialClient?.es_interno ?? false);
    esInternoTouched.current = false;
    createdIdRef.current = null;
    let cancelled = false;
    listAircraftTarifaOptionsAction().then((r) => {
      if (!cancelled && r.ok && r.data) setAircraft(r.data);
    });
    if (initialClient) {
      getClientTarifasAction(initialClient.id).then((r) => {
        if (cancelled) return;
        if (!r.ok || !r.data) {
          setTarifasError(true);
          return;
        }
        setTarifas(
          Object.fromEntries(
            r.data.map((t) => [t.aeronave_id, String(t.tarifa_hora_usd)]),
          ),
        );
        setTarifasMeta(
          Object.fromEntries(
            r.data.map((t) => [t.aeronave_id, t.aeronave?.matricula ?? "Avión"]),
          ),
        );
        setTarifasReady(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, initialClient, reset]);

  const esBroker = watch("es_broker");
  // Tarifas pactadas sobre aviones que ya no están activos: se muestran aparte
  // para poder verlas y quitarlas (si el avión se reactiva, volverían a aplicar).
  const tarifasInactivas = Object.keys(tarifas).filter(
    (id) => tarifas[id]?.trim() && !aircraft.some((a) => a.id === id),
  );

  const toggleExtranjero = (activo: boolean) => {
    setEsExtranjero(activo);
    if (activo) {
      setValue("rfc", RFC_EXTRANJERO, { shouldValidate: true, shouldDirty: true });
    } else {
      // Solo se limpia si sigue siendo el genérico (no pisar un RFC real tecleado).
      if (watch("rfc") === RFC_EXTRANJERO) {
        setValue("rfc", "", { shouldValidate: true, shouldDirty: true });
      }
      setValue("pais_residencia", "", { shouldDirty: true });
    }
  };

  // Lee la constancia con IA y autollena los datos fiscales (siempre revisables).
  const leerConstancia = async (file: File) => {
    if (!TIPOS_CONSTANCIA.includes(file.type)) {
      toast.error(
        `Formato no soportado (${file.type || "desconocido"}). Usa PDF o foto (JPG/PNG/WebP).`,
      );
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.info("Archivo muy grande para la lectura IA (máx 8 MB); captura manual.");
      return;
    }
    setLeyendoConstancia(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });
      const res = await leerConstanciaIAAction(
        file.type === "application/pdf"
          ? { pdfBase64: b64 }
          : { imageBase64: b64, mediaType: file.type },
      );
      if (!res.ok || !res.data) {
        toast.info(
          `La IA no pudo leer la constancia${res.error ? `: ${res.error}` : ""}; captura manual.`,
        );
        return;
      }
      if (!res.data.disponible || !res.data.legible) {
        toast.info(
          res.data.motivo
            ? `No se pudo leer la constancia: ${res.data.motivo}. Captura manual.`
            : "La constancia no se distingue bien; captura manual.",
        );
        return;
      }
      const ai = res.data;
      const llenado: string[] = [];
      if (ai.razon_social) {
        setValue("razon_social_default", ai.razon_social, { shouldDirty: true });
        llenado.push(ai.razon_social);
      }
      if (ai.rfc) {
        setValue("rfc", ai.rfc.toUpperCase().trim(), { shouldValidate: true, shouldDirty: true });
        llenado.push(ai.rfc.toUpperCase().trim());
      }
      // Solo códigos del catálogo: un código desconocido rompería el CFDI.
      if (ai.regimen_fiscal && REGIMENES_SAT.some((r) => r.value === ai.regimen_fiscal)) {
        setValue("regimen_fiscal_receptor", ai.regimen_fiscal, { shouldDirty: true });
        llenado.push(`régimen ${ai.regimen_fiscal}`);
      }
      if (ai.cp && /^\d{5}$/.test(ai.cp.trim())) {
        setValue("codigo_postal", ai.cp.trim(), { shouldValidate: true, shouldDirty: true });
        llenado.push(`CP ${ai.cp.trim()}`);
      }
      if (ai.domicilio) {
        setValue("domicilio_fiscal", ai.domicilio, { shouldDirty: true });
      }
      toast.success(
        llenado.length > 0
          ? `IA leyó la constancia: ${llenado.join(" · ")}. Revisa antes de guardar.`
          : "IA leyó la constancia pero no encontró datos claros; revisa los campos.",
      );
    } finally {
      setLeyendoConstancia(false);
    }
  };

  const onSubmit = handleSubmit((values) => {
    // Solo cuentan las filas con monto; se valida ANTES de guardar el cliente.
    const tarifasPayload: Array<{ aeronave_id: string; tarifa_hora_usd: number }> = [];
    for (const [aeronaveId, raw] of Object.entries(tarifas)) {
      if (!raw.trim()) continue;
      const monto = Number(raw);
      if (!Number.isFinite(monto) || monto <= 0) {
        const av = aircraft.find((a) => a.id === aeronaveId);
        toast.error(
          `Tarifa preferencial inválida para ${av?.matricula ?? tarifasMeta[aeronaveId] ?? "avión"}`,
        );
        return;
      }
      tarifasPayload.push({ aeronave_id: aeronaveId, tarifa_hora_usd: monto });
    }
    // Nunca descartar en silencio lo tecleado: si el set actual no cargó, no
    // se puede reemplazar sin riesgo de perder tarifas ya pactadas.
    if (isEdit && !tarifasReady && tarifasPayload.length > 0) {
      toast.error(
        tarifasError
          ? "No se pudieron cargar las tarifas actuales del cliente; reabre el formulario para guardar tarifas."
          : "Las tarifas actuales siguen cargando; espera un momento y vuelve a guardar.",
      );
      return;
    }

    startTransition(async () => {
      // es_interno viaja SOLO si se tocó el switch (patrón de los demás
      // booleanos: nada de mandar valores que el operador no decidió).
      const payload: ClientFormValues = esInternoTouched.current
        ? { ...values, es_interno: esInterno }
        : values;
      const existingId = isEdit ? initialClient!.id : createdIdRef.current;
      const result = existingId
        ? await updateClientAction(existingId, payload)
        : await createClientAction(payload);

      if (result.ok) {
        const clienteId = existingId ?? result.data?.id ?? null;
        if (!existingId && result.data) createdIdRef.current = result.data.id;
        // Las tarifas se guardan aparte (reemplazan el set completo).
        if (clienteId && tarifasReady && (tarifasPayload.length > 0 || isEdit)) {
          const tarifasRes = await setClientTarifasAction(clienteId, tarifasPayload);
          if (!tarifasRes.ok) {
            toast.error(
              `Cliente guardado, pero las tarifas preferenciales no: ${tarifasRes.error ?? "error desconocido"}. Vuelve a intentar guardar.`,
            );
            return;
          }
        }
        toast.success(isEdit ? "Cliente actualizado" : "Cliente creado");
        if (!isEdit && result.data) onCreated?.(result.data);
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            Persona o empresa que solicita vuelos. Si es broker, se aplica la tarifa broker en
            cotizaciones por default.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Persona o empresa" {...register("nombre")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" hint="WhatsApp preferente" error={errors.telefono?.message}>
              <PhoneField
                value={watch("telefono")}
                onChange={(v) => setValue("telefono", v, { shouldValidate: true, shouldDirty: true })}
              />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="cliente@ejemplo.com" {...register("email")} />
            </Field>
          </div>

          <Field label="Canal de origen" error={errors.canal_origen?.message}>
            <SearchableSelect
              options={[
                { value: "", label: "Sin especificar" },
                ...CANALES.map((c) => ({ value: c.value, label: c.label })),
              ]}
              value={(watch("canal_origen") as string | undefined) ?? ""}
              onChange={(v) => setValue("canal_origen", v as never)}
              placeholder="Sin especificar"
            />
          </Field>

          {/* ===== Datos fiscales para el CFDI del cliente ===== */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Datos fiscales (facturación)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se usan al timbrar el CFDI. Puedes llenarlos después, cuando el
                cliente pida factura.
              </p>
            </div>

            {/* Constancia de situación fiscal → la IA llena los campos.
                Oculta para extranjeros: no tienen constancia del SAT. */}
            {!esExtranjero && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!leyendoConstancia) constanciaRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !leyendoConstancia) {
                      e.preventDefault();
                      constanciaRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (leyendoConstancia) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file) void leerConstancia(file);
                  }}
                  className={cn(
                    "rounded-lg border border-dashed px-3 py-2.5 transition-colors",
                    leyendoConstancia
                      ? "border-brand-500/70 bg-brand-500/10 animate-pulse"
                      : "cursor-pointer border-brand-500/50 bg-brand-500/5 hover:border-brand-500 hover:bg-brand-500/10",
                  )}
                >
                  <div className="flex items-center justify-center gap-2 text-xs font-medium">
                    <SparklesIcon className="h-4 w-4 shrink-0 text-brand-500" />
                    {leyendoConstancia
                      ? "Leyendo la constancia con IA…"
                      : "Subir constancia (PDF o foto) — la IA llena los campos"}
                  </div>
                </div>
                <input
                  ref={constanciaRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void leerConstancia(file);
                    e.target.value = "";
                  }}
                />
              </>
            )}

            <Field
              label="Razón social"
              hint="EXACTA como la constancia, sin régimen societario (S.A. de C.V.)"
              error={errors.razon_social_default?.message}
            >
              <Input {...register("razon_social_default")} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="RFC" error={errors.rfc?.message}>
                <Input
                  placeholder="XAXX010101000"
                  maxLength={13}
                  className="font-mono uppercase"
                  value={watch("rfc") ?? ""}
                  readOnly={esExtranjero}
                  onChange={(e) =>
                    setValue("rfc", e.target.value.toUpperCase(), {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                />
              </Field>
              <Field label="Código postal" error={errors.codigo_postal?.message}>
                <Input
                  placeholder="77500"
                  maxLength={5}
                  inputMode="numeric"
                  className="font-mono"
                  disabled={esExtranjero}
                  {...register("codigo_postal")}
                />
              </Field>
            </div>

            <Field label="Régimen fiscal" error={errors.regimen_fiscal_receptor?.message}>
              <SearchableSelect
                options={[{ value: "", label: "Sin especificar" }, ...REGIMENES_SAT]}
                value={watch("regimen_fiscal_receptor") ?? ""}
                onChange={(v) =>
                  setValue("regimen_fiscal_receptor", v, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                placeholder="Sin especificar"
                disabled={esExtranjero}
              />
            </Field>

            <Field label="Uso CFDI" error={errors.uso_cfdi?.message}>
              <SearchableSelect
                options={[{ value: "", label: "Sin especificar" }, ...USOS_CFDI]}
                value={watch("uso_cfdi") ?? ""}
                onChange={(v) => setValue("uso_cfdi", v, { shouldDirty: true })}
                placeholder="Sin especificar"
                disabled={esExtranjero}
              />
            </Field>

            <Field
              label="Domicilio fiscal"
              hint="El CFDI solo usa el CP; el domicilio queda de referencia."
              error={errors.domicilio_fiscal?.message}
            >
              <Textarea rows={2} placeholder="Opcional" disabled={esExtranjero} {...register("domicilio_fiscal")} />
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Cliente extranjero</Label>
                <p className="text-xs text-muted-foreground">
                  {esExtranjero
                    ? "Se factura con el RFC genérico de extranjeros: régimen 616, uso S01 y CP de la emisora se aplican en automático."
                    : "Reside fuera de México y no tiene RFC del SAT."}
                </p>
              </div>
              <Switch checked={esExtranjero} onCheckedChange={toggleExtranjero} />
            </div>

            {esExtranjero && (
              <Field label="País de residencia" error={errors.pais_residencia?.message}>
                <Input placeholder="Estados Unidos" {...register("pais_residencia")} />
              </Field>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">¿Es broker?</Label>
              <p className="text-xs text-muted-foreground">
                Aplicar tarifa broker (más barata) por default en cotizaciones.
              </p>
            </div>
            <Switch
              checked={esBroker}
              onCheckedChange={(c) => setValue("es_broker", c)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                Cliente interno (operación propia)
              </Label>
              <p className="text-xs text-muted-foreground">
                Para vuelos de la empresa (reposicionamiento, demostración,
                servicio): sus cotizaciones pueden ir en $0 — sin hora mínima ni
                cobro esperado. La operación (tacómetros, gastos) se registra
                normal y el costo cae al avión.
              </p>
            </div>
            <Switch
              checked={esInterno}
              onCheckedChange={(c) => {
                esInternoTouched.current = true;
                setEsInterno(c);
              }}
            />
          </div>

          {aircraft.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm font-medium">
                  Tarifa preferencial por avión (USD/hr)
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pactada con este cliente: al cotizar manda sobre la tarifa default
                  del avión y puede ser mayor o menor. Vacío = usa la default.
                </p>
              </div>
              {isEdit && !tarifasReady && (
                <p className={`text-xs ${tarifasError ? "text-destructive" : "text-muted-foreground"}`}>
                  {tarifasError
                    ? "No se pudieron cargar las tarifas actuales; reabre el formulario para editarlas."
                    : "Cargando tarifas actuales…"}
                </p>
              )}
              <div className="space-y-1.5">
                {aircraft.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0">
                      <p className="text-sm font-medium">{a.matricula}</p>
                      {a.modelo && (
                        <p className="text-[11px] text-muted-foreground truncate">{a.modelo}</p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      inputMode="decimal"
                      disabled={isEdit && !tarifasReady}
                      placeholder={
                        esBroker
                          ? a.tarifa_hora_broker_usd
                            ? `Default broker: $${a.tarifa_hora_broker_usd}`
                            : "Sin tarifa broker"
                          : a.tarifa_hora_pub_usd
                            ? `Default: $${a.tarifa_hora_pub_usd}`
                            : "Sin tarifa configurada"
                      }
                      value={tarifas[a.id] ?? ""}
                      onChange={(e) =>
                        setTarifas((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                {/* Pactadas sobre aviones hoy inactivos: visibles para poder
                    quitarlas (si el avión se reactiva, volverían a aplicar). */}
                {tarifasInactivas.map((id) => (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0">
                      <p className="text-sm font-medium">{tarifasMeta[id] ?? "Avión"}</p>
                      <p className="text-[11px] text-amber-600">Avión inactivo</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0.01}
                        step={0.01}
                        inputMode="decimal"
                        value={tarifas[id] ?? ""}
                        onChange={(e) =>
                          setTarifas((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTarifas((prev) => ({ ...prev, [id]: "" }))
                        }
                      >
                        Quitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(client?: Client): ClientFormValues {
  if (!client) {
    return {
      nombre: "",
      telefono: "",
      email: "",
      razon_social_default: "",
      rfc: "",
      regimen_fiscal_receptor: "",
      uso_cfdi: "",
      codigo_postal: "",
      domicilio_fiscal: "",
      pais_residencia: "",
      canal_origen: "",
      es_broker: false,
      notas: "",
    };
  }
  return {
    nombre: client.nombre,
    telefono: client.telefono ?? "",
    email: client.email ?? "",
    razon_social_default: client.razon_social_default ?? "",
    rfc: client.rfc ?? "",
    regimen_fiscal_receptor: client.regimen_fiscal_receptor ?? "",
    uso_cfdi: client.uso_cfdi ?? "",
    codigo_postal: client.codigo_postal ?? "",
    domicilio_fiscal: client.domicilio_fiscal ?? "",
    pais_residencia: client.pais_residencia ?? "",
    canal_origen: client.canal_origen ?? "",
    es_broker: client.es_broker,
    notas: client.notas ?? "",
  };
}
