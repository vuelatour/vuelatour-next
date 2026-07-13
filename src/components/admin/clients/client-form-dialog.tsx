"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  listAircraftTarifaOptionsAction,
  setClientTarifasAction,
  type AeronaveTarifaOption,
} from "@/app/admin/clients/actions";
import { ClientFormSchema, type ClientFormValues } from "@/app/admin/clients/schema";
import type { Client } from "@/types/clients";
import { Field } from "@/components/admin/form-field";

const CANALES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "LANDING", label: "Landing" },
  { value: "LLAMADA", label: "Llamada" },
  { value: "REFERIDO", label: "Referido" },
];

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

  useEffect(() => {
    if (!open) return;
    reset(defaults(initialClient));
    setTarifas({});
    setTarifasMeta({});
    setTarifasReady(!initialClient);
    setTarifasError(false);
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
      const existingId = isEdit ? initialClient!.id : createdIdRef.current;
      const result = existingId
        ? await updateClientAction(existingId, values)
        : await createClientAction(values);

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

          <Field
            label="Razón social default"
            hint="Para 'factúrame como la última vez'"
            error={errors.razon_social_default?.message}
          >
            <Input {...register("razon_social_default")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="RFC" error={errors.rfc?.message}>
              <Input placeholder="XAXX010101000" maxLength={13} {...register("rfc")} className="font-mono uppercase" />
            </Field>
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
    canal_origen: client.canal_origen ?? "",
    es_broker: client.es_broker,
    notas: client.notas ?? "",
  };
}
