"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateOnly } from "@/lib/datetime";
import {
  PlusIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
  DocumentCheckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  createExpiration,
  createMaintenance,
  listDocumentTypes,
  listExpirations,
  listMaintenance,
  updateMaintenance,
} from "@/lib/api/engineering";
import type {
  DocumentType,
  EstadoMantenimiento,
  Mantenimiento,
  Vencimiento,
} from "@/types/engineering";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const fmtDate = fmtDateOnly;

export function AircraftEngineering({ aircraftId }: { aircraftId: string }) {
  const [mant, setMant] = useState<Mantenimiento[]>([]);
  const [venc, setVenc] = useState<Vencimiento[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
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
    } catch {
      // silencioso
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
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [aircraftId]);

  // Servicios próximos: vencimientos por fecha (≤120 d) + mantenimientos programados futuros.
  const proximos = [
    ...venc
      .filter((v) => v.vence_por === "FECHA" && v.fecha_vencimiento)
      .map((v) => ({
        id: `v-${v.id}`,
        label: v.tipo_documento?.nombre ?? "Vencimiento",
        fecha: v.fecha_vencimiento as string,
      })),
    ...mant
      .filter((m) => m.estado !== "COMPLETADO" && m.fecha_programada)
      .map((m) => ({ id: `m-${m.id}`, label: m.descripcion, fecha: m.fecha_programada as string })),
  ]
    .map((x) => ({ ...x, dias: daysUntil(x.fecha) }))
    .filter((x) => x.dias <= 120)
    .sort((a, b) => a.dias - b.dias);

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
                      {m.horas_aeronave ? ` · ${m.horas_aeronave} hrs` : ""}
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
            <CardDescription>{venc.length} documentos.</CardDescription>
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
                          ? `Límite ${v.horas_limite ?? "—"} hrs`
                          : "Permanente"}
                      {v.referencia ? ` · ${v.referencia}` : ""}
                    </p>
                  </div>
                  {v.tipo_documento?.es_critico && (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                      Crítico
                    </Badge>
                  )}
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
                    {p.dias <= 0 ? "Vencido" : `${p.dias} d`}
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
      <VencimientoDialog
        open={vencOpen}
        onOpenChange={setVencOpen}
        onSaved={reload}
        aircraftId={aircraftId}
        docTypes={docTypes}
      />
    </>
  );
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
  // El padre remonta este diálogo con `key`, así que basta inicializar desde
  // props (sin useEffect, que dispararía set-state-in-effect en Next 16).
  const [estado, setEstado] = useState<EstadoMantenimiento>(initial?.estado ?? "PROGRAMADO");
  const [pais, setPais] = useState<"" | "MX" | "USA">((initial?.pais as "" | "MX" | "USA") ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [fechaProg, setFechaProg] = useState(initial?.fecha_programada ?? "");
  const [fechaReal, setFechaReal] = useState(initial?.fecha_realizada ?? "");
  const [horas, setHoras] = useState(initial?.horas_aeronave ?? "");
  const [costo, setCosto] = useState(initial?.costo_usd ?? "");
  const [proveedor, setProveedor] = useState(initial?.proveedor ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!descripcion.trim()) {
      toast.error("Descripción requerida");
      return;
    }
    setSaving(true);
    try {
      const body = {
        estado,
        descripcion: descripcion.trim(),
        pais: pais || undefined,
        fecha_programada: fechaProg || undefined,
        fecha_realizada: estado === "COMPLETADO" && fechaReal ? fechaReal : undefined,
        horas_aeronave: horas ? Number(horas) : undefined,
        costo_usd: costo ? Number(costo) : undefined,
        proveedor: proveedor.trim() || undefined,
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
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{isEdit ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">
              Estado
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoMantenimiento)}
                className={`${inputCls} mt-1`}
              >
                <option value="PROGRAMADO">Programado</option>
                <option value="EN_TALLER">En taller</option>
                <option value="COMPLETADO">Completado</option>
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              País
              <select
                value={pais}
                onChange={(e) => setPais(e.target.value as "" | "MX" | "USA")}
                className={`${inputCls} mt-1`}
              >
                <option value="">Sin especificar</option>
                <option value="MX">México (MX)</option>
                <option value="USA">Estados Unidos (USA)</option>
              </select>
            </label>
          </div>
          <input className={inputCls} placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">
              Fecha programada
              <input type="date" className={`${inputCls} mt-1`} value={fechaProg} onChange={(e) => setFechaProg(e.target.value)} />
            </label>
            {estado === "COMPLETADO" && (
              <label className="block text-xs text-muted-foreground">
                Fecha realizada
                <input type="date" className={`${inputCls} mt-1`} value={fechaReal} onChange={(e) => setFechaReal(e.target.value)} />
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} type="number" placeholder="Horas aeronave" value={horas} onChange={(e) => setHoras(e.target.value)} />
            <input className={inputCls} type="number" placeholder="Costo USD" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="Taller / proveedor (opcional)" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const [tipoDoc, setTipoDoc] = useState("");
  const [vencePor, setVencePor] = useState<"FECHA" | "HORAS" | "PERMANENTE">("FECHA");
  const [fecha, setFecha] = useState("");
  const [horas, setHoras] = useState("");
  const [referencia, setReferencia] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!tipoDoc) {
      toast.error("Selecciona el tipo de documento");
      return;
    }
    setSaving(true);
    try {
      await createExpiration(aircraftId, {
        tipo_documento_id: tipoDoc,
        vence_por: vencePor,
        fecha_vencimiento: vencePor === "FECHA" && fecha ? fecha : undefined,
        horas_limite: vencePor === "HORAS" && horas ? Number(horas) : undefined,
        referencia: referencia.trim() || undefined,
      });
      toast.success("Vencimiento registrado");
      onOpenChange(false);
      setTipoDoc("");
      setFecha("");
      setHoras("");
      setReferencia("");
      await onSaved();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Nuevo permiso / licencia</DialogTitle>
        <div className="space-y-3">
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} className={inputCls}>
            <option value="">Tipo de documento…</option>
            {docTypes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
          <select value={vencePor} onChange={(e) => setVencePor(e.target.value as "FECHA" | "HORAS" | "PERMANENTE")} className={inputCls}>
            <option value="FECHA">Vence por fecha</option>
            <option value="HORAS">Vence por horas</option>
            <option value="PERMANENTE">Permanente</option>
          </select>
          {vencePor === "FECHA" && (
            <label className="block text-xs text-muted-foreground">
              Fecha de vencimiento
              <input type="date" className={`${inputCls} mt-1`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
          )}
          {vencePor === "HORAS" && (
            <input className={inputCls} type="number" placeholder="Horas límite" value={horas} onChange={(e) => setHoras(e.target.value)} />
          )}
          <input className={inputCls} placeholder="Referencia (opcional)" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
