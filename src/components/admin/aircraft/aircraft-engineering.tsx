"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { daysUntilCancun, fmtDateOnly } from "@/lib/datetime";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
  DocumentCheckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { ErrorState } from "@/components/admin/error-state";
import {
  createExpiration,
  createMaintenance,
  listDocumentTypes,
  listExpirations,
  listMaintenance,
  updateMaintenance,
} from "@/lib/api/engineering";
import { createDocumentTypeAction } from "@/app/admin/document-types/actions";
import {
  deleteExpirationAction,
  updateExpirationAction,
} from "@/app/admin/expirations/actions";
import type {
  DocumentType,
  EstadoMantenimiento,
  Mantenimiento,
  Vencimiento,
} from "@/types/engineering";

const ESTADO_MANT: Record<EstadoMantenimiento, { label: string; cls: string }> = {
  PROGRAMADO: {
    label: "Programado",
    cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  },
  EN_TALLER: {
    label: "En taller",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  COMPLETADO: {
    label: "Completado",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
};

const fmtDate = fmtDateOnly;

export function AircraftEngineering({ aircraftId }: { aircraftId: string }) {
  const [mant, setMant] = useState<Mantenimiento[]>([]);
  const [venc, setVenc] = useState<Vencimiento[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [mantOpen, setMantOpen] = useState(false);
  const [editingMant, setEditingMant] = useState<Mantenimiento | undefined>(undefined);
  const [vencOpen, setVencOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [m, v, d] = await Promise.all([
        listMaintenance(aircraftId),
        listExpirations(aircraftId),
        listDocumentTypes(),
      ]);
      setMant(m);
      setVenc(v);
      setDocTypes(d);
      setError(false);
    } catch {
      // NUNCA disfrazar la caída de "sin registros": se pinta el aviso rojo.
      setError(true);
    }
  }, [aircraftId]);

  useEffect(() => {
    let active = true;
    Promise.all([listMaintenance(aircraftId), listExpirations(aircraftId), listDocumentTypes()])
      .then(([m, v, d]) => {
        if (!active) return;
        setMant(m);
        setVenc(v);
        setDocTypes(d);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [aircraftId]);

  const retry = async () => {
    setRetrying(true);
    await reload();
    setRetrying(false);
  };

  // Servicios próximos: vencimientos por fecha (≤120 d) + mantenimientos programados futuros.
  // Días contados en hora Cancún: 0 = vence hoy, negativo = ya venció.
  const proximos = [
    ...venc
      // Incluye los "por horas" con límite calendario (TBO 12 años, etc.).
      .filter((v) => v.fecha_vencimiento)
      .map((v) => ({
        id: `v-${v.id}`,
        label: v.tipo_documento?.nombre ?? "Vencimiento",
        fecha: v.fecha_vencimiento as string,
      })),
    ...mant
      .filter((m) => m.estado !== "COMPLETADO" && m.fecha_programada)
      .map((m) => ({ id: `m-${m.id}`, label: m.descripcion, fecha: m.fecha_programada as string })),
  ]
    .map((x) => ({ ...x, dias: daysUntilCancun(x.fecha) ?? Number.POSITIVE_INFINITY }))
    .filter((x) => x.dias <= 120)
    .sort((a, b) => a.dias - b.dias);

  if (error) {
    return (
      <div className="lg:col-span-2">
        <ErrorState
          title="No se pudo cargar ingeniería"
          description={
            <span className="flex flex-col items-center gap-3">
              <span>
                Falló la consulta de mantenimientos y permisos: NO están vacíos, solo no se
                pudieron leer.
              </span>
              <Button size="sm" variant="outline" onClick={() => void retry()} disabled={retrying}>
                {retrying ? "Reintentando…" : "Reintentar"}
              </Button>
            </span>
          }
        />
      </div>
    );
  }

  return (
    <>
      {/* Mantenimientos */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-4 w-4 text-muted-foreground" />
              Mantenimientos
            </CardTitle>
            <CardDescription>{mant.length} registrados (programados y realizados).</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => {
              setEditingMant(undefined);
              setMantOpen(true);
            }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent>
          {mant.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mantenimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {mant.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.descripcion}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.estado === "COMPLETADO"
                        ? `Completado ${fmtDate(m.fecha_realizada)}`
                        : `Programado ${fmtDate(m.fecha_programada)}`}
                      {m.pais ? ` · ${m.pais}` : ""}
                      {m.horas_aeronave
                        ? ` · entró a ${m.horas_aeronave} h${m.horas_programadas ? ` (debía ${m.horas_programadas} h)` : ""}`
                        : ""}
                      {m.proveedor ? ` · ${m.proveedor}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className={ESTADO_MANT[m.estado].cls}>
                      {ESTADO_MANT[m.estado].label}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingMant(m);
                        setMantOpen(true);
                      }}
                      title="Editar / cambiar estado"
                      aria-label="Editar mantenimiento"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permisos y licencias (vencimientos) */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <DocumentCheckIcon className="h-4 w-4 text-muted-foreground" />
              Permisos y licencias
            </CardTitle>
            <CardDescription>
              {venc.length} documentos. Los marcados{" "}
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Crítico
              </span>{" "}
              ponen el avión EN ROJO al vencerse y avisan a administración a
              diario. Se puede seguir asignando (la autoridad a veces autoriza
              vuelos limitados), pero la alerta no se apaga hasta renovarlos.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setVencOpen(true)}>
            <PlusIcon className="h-3.5 w-3.5" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent>
          {venc.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin documentos registrados.</p>
          ) : (
            <div className="space-y-2">
              {venc.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{v.tipo_documento?.nombre ?? "Documento"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.vence_por === "FECHA"
                        ? `Vence ${fmtDate(v.fecha_vencimiento)}`
                        : v.vence_por === "HORAS"
                          ? `Límite ${v.horas_limite ?? "—"} hrs${v.fecha_vencimiento ? ` · vence ${fmtDate(v.fecha_vencimiento)}` : ""}`
                          : "Permanente"}
                      {v.referencia ? ` · ${v.referencia}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                  <VencimientoRowActions vencimiento={v} onSaved={reload} />
                  {v.tipo_documento?.es_critico &&
                    (v.vence_por === "PERMANENTE" ? (
                      // Un permanente NUNCA se vence, así que NUNCA puede
                      // bloquear: pintarlo en ámbar como los demás críticos
                      // era una alarma falsa.
                      <Badge
                        variant="outline"
                        className="shrink-0 text-muted-foreground"
                        title="Es un documento crítico, pero está registrado como PERMANENTE: no vence, así que nunca deja al avión no apto. Si en realidad sí tiene fecha de vigencia, edítalo en Vencimientos y ponle «Vence por fecha» para que el sistema lo vigile."
                      >
                        Crítico · no vence
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shrink-0"
                        title="Documento crítico: si se vence, el avión queda NO APTO y el sistema bloquea asignarlo a un vuelo hasta renovarlo. Vigente no estorba."
                      >
                        Crítico
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Servicios próximos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
            Servicios próximos
          </CardTitle>
          <CardDescription>Vencimientos y mantenimientos en los próximos 120 días.</CardDescription>
        </CardHeader>
        <CardContent>
          {proximos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada próximo en 120 días.</p>
          ) : (
            <div className="space-y-2">
              {proximos.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{p.label}</span>
                  <Badge
                    variant="outline"
                    className={
                      p.dias <= 0
                        ? "bg-destructive/15 text-destructive border-destructive/30"
                        : p.dias <= 15
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : ""
                    }
                  >
                    {p.dias < 0 ? "Vencido" : p.dias === 0 ? "Vence hoy" : `${p.dias} d`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {mantOpen && (
        <MantenimientoDialog
          key={editingMant?.id ?? "new"}
          open
          onOpenChange={setMantOpen}
          onSaved={reload}
          aircraftId={aircraftId}
          initial={editingMant}
        />
      )}
      {vencOpen && (
        <VencimientoDialog
          open
          onOpenChange={setVencOpen}
          onSaved={reload}
          aircraftId={aircraftId}
          docTypes={docTypes}
        />
      )}
    </>
  );
}

/** Number opcional: "" o undefined → se omite; en otro caso coacciona a número ≥ 0. */
const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0, "No puede ser negativo").optional(),
);

const MantenimientoFormSchema = z.object({
  estado: z.enum(["PROGRAMADO", "EN_TALLER", "COMPLETADO"]),
  pais: z.enum(["MX", "USA"]).optional().or(z.literal("")),
  descripcion: z.string().min(1, "Requerido").max(2000),
  fecha_programada: z.string().optional().or(z.literal("")),
  fecha_realizada: z.string().optional().or(z.literal("")),
  horas_aeronave: numeroOpcional,
  horas_programadas: numeroOpcional,
  costo_usd: numeroOpcional,
  proveedor: z.string().max(200).optional().or(z.literal("")),
});
type MantenimientoFormValues = z.input<typeof MantenimientoFormSchema>;

function mantDefaults(m?: Mantenimiento): MantenimientoFormValues {
  return {
    estado: m?.estado ?? "PROGRAMADO",
    pais: m?.pais ?? "",
    descripcion: m?.descripcion ?? "",
    fecha_programada: m?.fecha_programada ?? "",
    fecha_realizada: m?.fecha_realizada ?? "",
    horas_aeronave: m?.horas_aeronave ?? "",
    horas_programadas: m?.horas_programadas ?? "",
    costo_usd: m?.costo_usd ?? "",
    proveedor: m?.proveedor ?? "",
  };
}

function MantenimientoDialog({
  open,
  onOpenChange,
  onSaved,
  aircraftId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
  aircraftId: string;
  initial?: Mantenimiento;
}) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);

  // El padre remonta este diálogo con `key`, así que basta inicializar desde
  // props (sin useEffect, que dispararía set-state-in-effect en Next 16).
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MantenimientoFormValues>({
    resolver: zodResolver(MantenimientoFormSchema),
    defaultValues: mantDefaults(initial),
  });

  const estado = watch("estado");
  const horas = watch("horas_aeronave");
  const horasProg = watch("horas_programadas");
  const showDiff =
    horas !== "" &&
    horas != null &&
    horasProg !== "" &&
    horasProg != null &&
    Number.isFinite(Number(horas)) &&
    Number.isFinite(Number(horasProg));

  const onSubmit = handleSubmit(async (raw) => {
    setSaving(true);
    try {
      const values = MantenimientoFormSchema.parse(raw);
      // Mismo contrato que siempre ha recibido el API (no cambia).
      const body = {
        estado: values.estado,
        descripcion: values.descripcion.trim(),
        pais: values.pais || undefined,
        fecha_programada: values.fecha_programada || undefined,
        fecha_realizada:
          values.estado === "COMPLETADO" && values.fecha_realizada
            ? values.fecha_realizada
            : undefined,
        horas_aeronave: values.horas_aeronave,
        horas_programadas: values.horas_programadas,
        costo_usd: values.costo_usd,
        proveedor: values.proveedor?.trim() || undefined,
      };
      if (isEdit) {
        await updateMaintenance(initial!.id, body);
        toast.success("Servicio actualizado");
      } else {
        await createMaintenance(aircraftId, body);
        toast.success("Servicio registrado");
      }
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Mantenimiento de la aeronave: programado, en taller o completado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado" required error={errors.estado?.message}>
              <SearchableSelect
                options={[
                  { value: "PROGRAMADO", label: "Programado" },
                  { value: "EN_TALLER", label: "En taller" },
                  { value: "COMPLETADO", label: "Completado" },
                ]}
                value={(watch("estado") as string | undefined) ?? "PROGRAMADO"}
                onChange={(v) => setValue("estado", v as never)}
                placeholder="Estado"
              />
            </Field>
            <Field label="País" error={errors.pais?.message}>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin especificar" },
                  { value: "MX", label: "México (MX)" },
                  { value: "USA", label: "Estados Unidos (USA)" },
                ]}
                value={(watch("pais") as string | undefined) ?? ""}
                onChange={(v) => setValue("pais", v as never)}
                placeholder="Sin especificar"
              />
            </Field>
          </div>
          <Field label="Descripción" required error={errors.descripcion?.message}>
            <Input placeholder="Ej. Servicio de 100 h" {...register("descripcion")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha programada" error={errors.fecha_programada?.message}>
              <Input type="date" {...register("fecha_programada")} />
            </Field>
            {estado === "COMPLETADO" && (
              <Field label="Fecha realizada" error={errors.fecha_realizada?.message}>
                <Input type="date" {...register("fecha_realizada")} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horas de entrada (real)" error={errors.horas_aeronave?.message}>
              <Input type="number" step="0.1" min={0} placeholder="A las que entró" {...register("horas_aeronave")} />
            </Field>
            <Field label="Horas programadas (debía)" error={errors.horas_programadas?.message}>
              <Input type="number" step="0.1" min={0} placeholder="A las que tocaba" {...register("horas_programadas")} />
            </Field>
          </div>
          {showDiff && (
            <p className="text-xs text-muted-foreground">
              {(() => {
                const d = Number(horas) - Number(horasProg);
                if (Math.abs(d) < 0.05) return "Entró justo a las horas programadas.";
                return d > 0
                  ? `Entró ${d.toFixed(1)} h DESPUÉS de lo programado.`
                  : `Entró ${Math.abs(d).toFixed(1)} h ANTES de lo programado.`;
              })()}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo (USD)" error={errors.costo_usd?.message}>
              <Input type="number" step="0.01" min={0} placeholder="0.00" {...register("costo_usd")} />
            </Field>
            <Field label="Taller / proveedor" error={errors.proveedor?.message}>
              <Input placeholder="Opcional" {...register("proveedor")} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const VencimientoFormSchema = z.object({
  tipo_documento_id: z.string().min(1, "Selecciona el tipo de documento"),
  vence_por: z.enum(["FECHA", "HORAS", "PERMANENTE"]),
  fecha_vencimiento: z.string().optional().or(z.literal("")),
  horas_limite: numeroOpcional,
  referencia: z.string().max(200).optional().or(z.literal("")),
});
type VencimientoFormValues = z.input<typeof VencimientoFormSchema>;

function VencimientoDialog({
  open,
  onOpenChange,
  onSaved,
  aircraftId,
  docTypes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
  aircraftId: string;
  docTypes: DocumentType[];
}) {
  const [saving, setSaving] = useState(false);
  // Tipos creados aquí mismo (aún no están en el catálogo que cargó el padre).
  const [tiposNuevos, setTiposNuevos] = useState<DocumentType[]>([]);
  const [tipoOpen, setTipoOpen] = useState(false);

  // Solo documentos DE AERONAVE: este diálogo siempre registra el permiso de
  // este avión, y ver licencias de piloto aquí (Licencia MX, certificado
  // médico…) invita a capturarlas en el objeto equivocado.
  const tiposAeronave = [...docTypes, ...tiposNuevos].filter(
    (d) => (d.ambito ?? "").toUpperCase() === "AERONAVE",
  );

  // El padre monta este diálogo solo mientras está abierto, así que basta
  // inicializar los defaults una vez (se descartan al cerrar).
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VencimientoFormValues>({
    resolver: zodResolver(VencimientoFormSchema),
    defaultValues: {
      tipo_documento_id: "",
      vence_por: "FECHA",
      fecha_vencimiento: "",
      horas_limite: "",
      referencia: "",
    },
  });

  const vencePor = watch("vence_por");

  const onSubmit = handleSubmit(async (raw) => {
    setSaving(true);
    try {
      const values = VencimientoFormSchema.parse(raw);
      // Mismo contrato que siempre ha recibido el API (no cambia).
      await createExpiration(aircraftId, {
        tipo_documento_id: values.tipo_documento_id,
        vence_por: values.vence_por,
        // HORAS también admite fecha calendario opcional (TBO por tiempo):
        // manda lo que ocurra primero.
        fecha_vencimiento:
          values.vence_por !== "PERMANENTE" && values.fecha_vencimiento
            ? values.fecha_vencimiento
            : undefined,
        horas_limite:
          values.vence_por === "HORAS" && values.horas_limite != null
            ? values.horas_limite
            : undefined,
        referencia: values.referencia?.trim() || undefined,
      });
      toast.success("Vencimiento registrado");
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo permiso / licencia</DialogTitle>
          <DialogDescription>
            Documento de la aeronave con vencimiento por fecha, por horas o permanente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Tipo de documento"
            required
            error={errors.tipo_documento_id?.message}
            hint="¿No está en la lista? Créalo aquí mismo con «Nuevo tipo»."
          >
            <div className="space-y-2">
              <SearchableSelect
                options={tiposAeronave.map((d) => ({
                  value: d.id,
                  label: d.nombre,
                  description: d.es_critico ? "Crítico · alerta al vencer" : undefined,
                }))}
                value={(watch("tipo_documento_id") as string | undefined) ?? ""}
                onChange={(v) => setValue("tipo_documento_id", v, { shouldValidate: true })}
                placeholder="Selecciona el tipo"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setTipoOpen(true)}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Nuevo tipo
              </Button>
            </div>
          </Field>
          <Field label="Vence por" required error={errors.vence_por?.message}>
            <SearchableSelect
              options={[
                { value: "FECHA", label: "Vence por fecha" },
                { value: "HORAS", label: "Vence por horas" },
                { value: "PERMANENTE", label: "Permanente" },
              ]}
              value={(watch("vence_por") as string | undefined) ?? "FECHA"}
              onChange={(v) => setValue("vence_por", v as never)}
              placeholder="Vence por"
            />
          </Field>
          {vencePor === "FECHA" && (
            <Field label="Fecha de vencimiento" error={errors.fecha_vencimiento?.message}>
              <Input type="date" {...register("fecha_vencimiento")} />
            </Field>
          )}
          {vencePor === "HORAS" && (
            <Field label="Horas límite" error={errors.horas_limite?.message}>
              <Input type="number" step="0.1" min={0} placeholder="Ej. 1200" {...register("horas_limite")} />
            </Field>
          )}
          {vencePor === "HORAS" && (
            <Field
              label="Vence también por fecha"
              hint="Opcional: límite calendario (ej. TBO 12 años). Manda lo que ocurra primero."
              error={errors.fecha_vencimiento?.message}
            >
              <Input type="date" {...register("fecha_vencimiento")} />
            </Field>
          )}
          <Field label="Referencia" hint="opcional" error={errors.referencia?.message}>
            <Input placeholder="Folio, número de permiso…" {...register("referencia")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>

        <NuevoTipoDocumentoDialog
          key={tipoOpen ? "abierto" : "cerrado"}
          open={tipoOpen}
          onOpenChange={setTipoOpen}
          formaDefault={vencePor === "HORAS" || vencePor === "PERMANENTE" ? vencePor : "FECHA"}
          onCreated={(tipo) => {
            setTiposNuevos((prev) => [...prev, tipo]);
            setValue("tipo_documento_id", tipo.id, { shouldValidate: true });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}


/**
 * Editar / eliminar un vencimiento DESDE la ficha del avión: es donde la
 * oficina los ve, y hasta ahora solo se podían tocar en la pantalla general
 * de Vencimientos (que nadie encontraba — "no pueden editar los vencimientos
 * que ya se subieron"). Reusa las server actions del módulo de vencimientos.
 */
function VencimientoRowActions({
  vencimiento,
  onSaved,
}: {
  vencimiento: Vencimiento;
  onSaved: () => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vencePor, setVencePor] = useState(vencimiento.vence_por);
  const [fecha, setFecha] = useState(vencimiento.fecha_vencimiento ?? "");
  const [horas, setHoras] = useState(vencimiento.horas_limite ?? "");
  const [referencia, setReferencia] = useState(vencimiento.referencia ?? "");

  const abrirEdicion = () => {
    setVencePor(vencimiento.vence_por);
    setFecha(vencimiento.fecha_vencimiento ?? "");
    setHoras(vencimiento.horas_limite ?? "");
    setReferencia(vencimiento.referencia ?? "");
    setEditOpen(true);
  };

  const guardar = async () => {
    if (vencePor === "FECHA" && !fecha) {
      toast.error("Captura la fecha de vencimiento");
      return;
    }
    if (vencePor === "HORAS" && !(Number(horas) > 0)) {
      toast.error("Captura las horas límite");
      return;
    }
    setSaving(true);
    try {
      const res = await updateExpirationAction(vencimiento.id, {
        vence_por: vencePor,
        // HORAS conserva su fecha calendario opcional; vaciarla manda null
        // explícito (el "" se descarta y el PATCH conservaría la anterior).
        fecha_vencimiento:
          vencePor === "PERMANENTE" ? null : fecha ? fecha : null,
        horas_limite: vencePor === "HORAS" ? Number(horas) : "",
        referencia,
      });
      if (res.ok) {
        toast.success("Vencimiento actualizado");
        setEditOpen(false);
        await onSaved();
      } else {
        toast.error(res.error ?? "No se pudo actualizar");
      }
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    setSaving(true);
    try {
      const res = await deleteExpirationAction(vencimiento.id);
      if (res.ok) {
        toast.success("Vencimiento eliminado");
        setDeleteOpen(false);
        await onSaved();
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    } finally {
      setSaving(false);
    }
  };

  const nombre = vencimiento.tipo_documento?.nombre ?? "Documento";

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        title="Editar vencimiento"
        aria-label="Editar vencimiento"
        onClick={abrirEdicion}
      >
        <PencilSquareIcon className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        title="Eliminar vencimiento"
        aria-label="Eliminar vencimiento"
        onClick={() => setDeleteOpen(true)}
      >
        <TrashIcon className="h-4 w-4" />
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar · {nombre}</DialogTitle>
            <DialogDescription>
              Renovaste el documento o corregiste el dato: el semáforo y las
              alertas se recalculan solos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Vence por" required>
              <SearchableSelect
                options={[
                  { value: "FECHA", label: "Vence por fecha" },
                  { value: "HORAS", label: "Vence por horas" },
                  { value: "PERMANENTE", label: "Permanente (no vence)" },
                ]}
                value={vencePor}
                onChange={(v) => setVencePor(v as typeof vencePor)}
                placeholder="Vence por"
              />
            </Field>
            {vencePor === "FECHA" && (
              <Field label="Fecha de vencimiento" required>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
            )}
            {vencePor === "HORAS" && (
              <Field label="Horas límite" required>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                />
              </Field>
            )}
            {vencePor === "HORAS" && (
              <Field
                label="Vence también por fecha"
                hint="Opcional: límite calendario (ej. TBO 12 años). Manda lo que ocurra primero."
              >
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
            )}
            <Field label="Referencia" hint="folio / número de permiso (opcional)">
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar · {nombre}</DialogTitle>
            <DialogDescription>
              Se elimina este vencimiento del avión: el sistema dejará de
              vigilarlo y de avisar cuando caduque. Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void eliminar()} disabled={saving}>
              {saving ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Alta rápida de un tipo de documento SIN salir del alta del permiso (mismo
 * patrón que el cliente rápido del cotizador): la oficina captura el permiso
 * que trae en la mano, no va a otra pantalla a dar de alta el catálogo.
 * Queda con ámbito AERONAVE y se puede afinar después en
 * Configuración → Tipos de documento.
 */
function NuevoTipoDocumentoDialog({
  open,
  onOpenChange,
  formaDefault,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formaDefault: "FECHA" | "HORAS" | "PERMANENTE";
  onCreated: (tipo: DocumentType) => void;
}) {
  // El padre remonta este diálogo con `key` al abrirlo, así que los campos
  // arrancan limpios sin necesidad de un efecto que resetee.
  const [nombre, setNombre] = useState("");
  const [critico, setCritico] = useState(false);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    const limpio = nombre.trim();
    if (!limpio) {
      toast.error("Escribe el nombre del documento");
      return;
    }
    setSaving(true);
    try {
      const res = await createDocumentTypeAction({
        nombre: limpio,
        ambito: "AERONAVE",
        forma_default: formaDefault,
        umbral_alerta_dias: 30,
        es_critico: critico,
      });
      if (res.ok && res.data) {
        toast.success(`Tipo «${res.data.nombre}» creado`);
        onCreated({
          id: res.data.id,
          nombre: res.data.nombre,
          ambito: res.data.ambito,
          umbral_alerta_dias: res.data.umbral_alerta_dias,
          es_critico: res.data.es_critico,
        });
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo crear el tipo");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo tipo de documento</DialogTitle>
          <DialogDescription>
            Se agrega al catálogo de documentos de AERONAVE y queda disponible
            para todos los aviones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nombre del documento" required>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Certificado de matrícula"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void guardar();
                }
              }}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={critico}
              onChange={(e) => setCritico(e.target.checked)}
            />
            <span>
              Es crítico
              <span className="block text-xs text-muted-foreground">
                Vencido, deja el avión como NO APTO (igual que el seguro o la
                tarjeta de aeronavegabilidad).
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={saving}>
            {saving ? "Creando…" : "Crear tipo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
