"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancunInputToIso, TZ_LABEL } from "@/lib/datetime";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fmtUsd } from "@/lib/format";
import { createExternalFlightAction } from "@/app/admin/flights/actions";
import { QuickClientDialog } from "@/components/admin/clients/quick-client-dialog";
import { Field } from "@/components/admin/form-field";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

const ExternalFlightSchema = z
  .object({
    cliente_id: z.string().uuid("Cliente requerido"),
    operador_externo: z
      .string()
      .trim()
      .min(2, "Mínimo 2 caracteres")
      .max(100, "Máximo 100 caracteres"),
    costo_externo_usd: z.coerce.number().min(0, "Mínimo 0"),
    monto_total_usd: z.coerce.number().positive("Debe ser > 0"),
    metodo_cobro: z.enum([
      "TRANSFERENCIA",
      "HSBC_LINK",
      "BILLPOCKET",
      "CHEQUE",
      "EFECTIVO",
      "DOLARES",
    ]),
    // TC pactado (opcional): sin él, el vuelo en USD no se puede facturar.
    tc_usd_mxn: z.string().optional().or(z.literal("")),
    pasajeros: z.coerce.number().int().min(1, "Mínimo 1"),
    fecha_vuelo: z.string().optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
    notas_internas: z.string().max(2000).optional().or(z.literal("")),
  });

type FormValues = z.input<typeof ExternalFlightSchema>;

const defaultValues: FormValues = {
  cliente_id: "",
  operador_externo: "",
  costo_externo_usd: 0,
  monto_total_usd: 0,
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "",
  pasajeros: 1,
  fecha_vuelo: "",
  notas: "",
  notas_internas: "",
};

/** Tramo de la ruta externa (MULTIESCALA con "+ Tramo"). */
interface LegRow {
  origen: string;
  destino: string;
  /** Ferry: tramo vacío (posicionamiento), sin pasajeros. */
  esFerry: boolean;
}

interface ExternalFlightFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  airports: AirportOption[];
}

export function ExternalFlightFormSheet({
  open,
  onOpenChange,
  clients,
  airports,
}: ExternalFlightFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [legs, setLegs] = useState<LegRow[]>([{ origen: "CUN", destino: "", esFerry: false }]);
  const [rutaError, setRutaError] = useState<string | null>(null);
  // Alta rápida de cliente sin salir del flujo (solo nombre).
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [extraClients, setExtraClients] = useState<ClientOption[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(ExternalFlightSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setLegs([{ origen: "CUN", destino: "", esFerry: false }]);
      setRutaError(null);
    }
  }, [open, reset]);

  const clienteId = watch("cliente_id");
  const monto = Number(watch("monto_total_usd")) || 0;
  const costo = Number(watch("costo_externo_usd")) || 0;
  const margen = monto - costo;

  const onSubmit = handleSubmit((values) => {
    setRutaError(null);
    if (legs.some((l) => !l.origen || !l.destino)) {
      setRutaError("Cada tramo necesita origen y destino.");
      return;
    }
    if (legs.some((l) => l.origen === l.destino)) {
      setRutaError("Un tramo no puede tener el mismo origen y destino.");
      return;
    }
    if (legs.every((l) => l.esFerry)) {
      setRutaError("Al menos un tramo debe llevar pasajeros (no todo puede ser ferry).");
      return;
    }
    startTransition(async () => {
      const res = await createExternalFlightAction({
        cliente_id: values.cliente_id,
        operador_externo: values.operador_externo.trim(),
        costo_externo_usd: Number(values.costo_externo_usd),
        monto_total_usd: Number(values.monto_total_usd),
        metodo_cobro: values.metodo_cobro,
        tc_usd_mxn:
          Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : undefined,
        origen_iata: legs[0].origen,
        destino_iata: legs[legs.length - 1].destino,
        escalas: legs.map((l) => ({
          origen_iata: l.origen,
          destino_iata: l.destino,
          es_ferry: l.esFerry,
        })),
        pasajeros: Number(values.pasajeros),
        fecha_vuelo: values.fecha_vuelo
          ? cancunInputToIso(values.fecha_vuelo)
          : undefined,
        notas: values.notas?.trim() || undefined,
        notas_internas: values.notas_internas?.trim() || undefined,
      });
      if (res.ok && res.data) {
        toast.success(`Vuelo externo #${res.data.folio} creado`);
        onOpenChange(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al crear vuelo externo");
      }
    });
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl sm:w-[560px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Nuevo vuelo externo</SheetTitle>
          <SheetDescription>
            Vuelo subcontratado a operador externo. Skip del motor de cotización
            — el costo y el monto al cliente se ingresan directos. Queda en
            estado CONFIRMADO inmediatamente.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Field label="Cliente" required error={errors.cliente_id?.message}>
            <SearchableSelect
              options={[...extraClients, ...clients.filter((c) => !extraClients.some((e) => e.id === c.id))].map(
                (c) => ({
                  value: c.id,
                  label: c.nombre,
                  description: c.rfc ?? undefined,
                }),
              )}
              value={clienteId}
              onChange={(v) => setValue("cliente_id", v)}
              placeholder="Selecciona cliente"
              emptyText="Sin clientes activos"
            />
            <button
              type="button"
              onClick={() => setQuickClientOpen(true)}
              className="mt-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
            >
              + Nuevo cliente
            </button>
          </Field>

          <Field
            label="Operador externo"
            hint="Matrícula o nombre del operador subcontratado (ej. XA-TIB)"
            required
            error={errors.operador_externo?.message}
          >
            <Input placeholder="XA-TIB" {...register("operador_externo")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Costo USD (operador)"
              hint="Lo que cobra el operador externo"
              required
              error={errors.costo_externo_usd?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                {...register("costo_externo_usd")}
              />
            </Field>
            <Field
              label="Monto USD (cliente)"
              hint="Lo que se cobra al cliente"
              required
              error={errors.monto_total_usd?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                {...register("monto_total_usd")}
              />
            </Field>
          </div>

          {monto > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Margen estimado: </span>
              <span
                className={`font-mono font-semibold ${
                  margen > 0
                    ? "text-green-600 dark:text-green-400"
                    : margen < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {fmtUsd(margen)}
              </span>
              {monto > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({((margen / monto) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}

          <Field
            label="Tipo de cambio (MXN por USD)"
            hint="Opcional aquí, pero sin TC el vuelo no se puede facturar (el CFDI se emite en MXN); también se puede capturar al emitir"
          >
            <Input
              type="number"
              step="0.0001"
              min={0}
              placeholder="Ej. 18.50"
              {...register("tc_usd_mxn")}
            />
          </Field>

          <Field
            label="Método de cobro"
            hint="Facturable (transferencia/link/terminal/cheque) = el vuelo aparece en Facturas antes de cobrarse"
            required
            error={errors.metodo_cobro?.message}
          >
            <SearchableSelect
              options={[
                { value: "TRANSFERENCIA", label: "Transferencia", description: "Facturable antes de cobrar" },
                { value: "HSBC_LINK", label: "HSBC link", description: "Facturable antes de cobrar" },
                { value: "BILLPOCKET", label: "BillPocket (terminal)", description: "Facturable antes de cobrar" },
                { value: "CHEQUE", label: "Cheque", description: "Facturable antes de cobrar" },
                { value: "EFECTIVO", label: "Efectivo", description: "Entra a Facturas al cobrarse" },
                { value: "DOLARES", label: "Dólares directo", description: "Entra a Facturas al cobrarse" },
              ]}
              value={watch("metodo_cobro") ?? "TRANSFERENCIA"}
              onChange={(v) => setValue("metodo_cobro", v as FormValues["metodo_cobro"])}
              placeholder="Método de cobro"
            />
          </Field>

          {/* Ruta: uno o VARIOS tramos (multiescala para rutas externas). */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Ruta <span className="text-destructive">*</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() =>
                  setLegs((prev) => [
                    ...prev,
                    { origen: prev[prev.length - 1]?.destino ?? "", destino: "", esFerry: false },
                  ])
                }
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Tramo
              </Button>
            </div>
            {legs.map((leg, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <SearchableSelect
                  options={airports.map((a) => ({
                    value: a.iata,
                    label: a.iata,
                    description: a.nombre,
                  }))}
                  value={leg.origen}
                  onChange={(v) =>
                    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, origen: v } : l)))
                  }
                  placeholder="IATA"
                />
                <span className="text-muted-foreground">→</span>
                <SearchableSelect
                  options={airports.map((a) => ({
                    value: a.iata,
                    label: a.iata,
                    description: a.nombre,
                  }))}
                  value={leg.destino}
                  onChange={(v) =>
                    setLegs((prev) =>
                      prev.map((l, idx) => {
                        if (idx === i) return { ...l, destino: v };
                        // El siguiente tramo encadena su origen automáticamente.
                        if (idx === i + 1 && !l.origen) return { ...l, origen: v };
                        return l;
                      }),
                    )
                  }
                  placeholder="IATA"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setLegs((prev) =>
                        prev.map((l, idx) => (idx === i ? { ...l, esFerry: !l.esFerry } : l)),
                      )
                    }
                    title="Ferry: tramo vacío (posicionamiento), sin pasajeros"
                    className={
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                      (leg.esFerry
                        ? "border-slate-500/60 bg-slate-500/15 font-medium text-slate-600 dark:text-slate-300"
                        : "border-dashed border-border text-muted-foreground hover:border-foreground/40")
                    }
                  >
                    Ferry
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    disabled={legs.length === 1}
                    onClick={() => setLegs((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Quitar tramo"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {rutaError && <p className="text-xs text-destructive">{rutaError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pasajeros" required error={errors.pasajeros?.message}>
              <Input type="number" min={1} {...register("pasajeros")} />
            </Field>
            <Field label="Fecha y hora" hint={TZ_LABEL} error={errors.fecha_vuelo?.message}>
              <Input type="datetime-local" {...register("fecha_vuelo")} />
            </Field>
          </div>

          <Field label="Notas (visibles)" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional · información que ve el cliente"
              {...register("notas")}
            />
          </Field>

          <Field label="Notas internas" error={errors.notas_internas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional · solo equipo"
              {...register("notas_internas")}
            />
          </Field>
        </form>

        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Creando…" : "Crear vuelo externo"}
          </Button>
        </SheetFooter>
      </SheetContent>

      <QuickClientDialog
        open={quickClientOpen}
        onOpenChange={setQuickClientOpen}
        onCreated={(client) => {
          const opt: ClientOption = { id: client.id, nombre: client.nombre, rfc: client.rfc };
          setExtraClients((prev) => [...prev.filter((c) => c.id !== opt.id), opt]);
          setValue("cliente_id", opt.id);
          router.refresh();
        }}
      />
    </Sheet>
  );
}

