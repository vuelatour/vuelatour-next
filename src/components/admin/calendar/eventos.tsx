"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import { cancunInputToIso, isoToCancunInput, TZ_LABEL } from "@/lib/datetime";
import {
  createEventoFlotaAction,
  updateEventoFlotaAction,
} from "@/app/admin/calendar/actions";
import type { EventoAviso, EventoFlotaPatch } from "@/types/calendar";

/**
 * Eventos NO-vuelo del calendario de flota (citas, lavados, trámites) —
 * 3-sep-2026, incidente "Llenar Bitácora": el responsable nunca se enteró
 * porque no tenía la app con avisos y oficina no tenía forma de saberlo.
 * Aquí: alta y edición desde el panel + el resultado del aviso a la vista.
 */

export interface OpcionResponsable {
  id: string;
  nombre: string;
  rol?: string;
  /** Dispositivos push registrados (0 = no le llegará el aviso). */
  push_dispositivos?: number | null;
}

export interface OpcionAeronave {
  id: string;
  matricula: string;
  modelo?: string | null;
}

/**
 * Resumen de un evento_flota armado por la página a partir de los items
 * del calendario (una fila por día). `fecha_inicio` solo se conoce si el
 * primer día del evento cae en el mes visible; `fecha_fin_aprox` es el
 * último día visible (sin hora) cuando el evento dura más de un día.
 */
export interface EventoFlotaResumen {
  id: string;
  titulo: string;
  notas: string | null;
  aeronave_id: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  fecha_inicio: string | null;
  fecha_fin_aprox: string | null;
}

interface EventoFormValues {
  titulo: string;
  /** datetime-local en pared Cancún ("YYYY-MM-DDTHH:mm"). */
  fecha: string;
  fin: string;
  aeronave_id: string;
  responsable_id: string;
  notas: string;
}

const VACIO: EventoFormValues = {
  titulo: "",
  fecha: "",
  fin: "",
  aeronave_id: "",
  responsable_id: "",
  notas: "",
};

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  COORDINADOR: "Coordinación",
  ANALISTA: "Analista",
  FACTURACION: "Facturación",
  PILOTO: "Piloto",
  SOCIO: "Socio",
  MECANICO: "Mecánico",
  VISITANTE: "Visitante",
};

/**
 * Toast según el resultado de entrega del aviso (contrato 3-sep-2026):
 * - aviso con push → verde "avisado a X";
 * - aviso sin dispositivos → ámbar persistente: hay que hablarle;
 * - null → sin responsable o el responsable es quien agenda (no se auto-avisa);
 * - ausente → API viejo: solo confirma el guardado.
 */
export function toastAvisoEvento(
  aviso: EventoAviso | null | undefined,
  opts: { verbo: "agendado" | "actualizado"; responsableElegido: boolean },
) {
  const base = `Evento ${opts.verbo}`;
  if (aviso === undefined) {
    toast.success(base);
    return;
  }
  if (aviso === null) {
    toast.success(
      opts.responsableElegido
        ? `${base} · el responsable eres tú (sin aviso)`
        : `${base} (sin responsable: nadie recibirá aviso)`,
    );
    return;
  }
  if (aviso.push_dispositivos === 0) {
    toast.warning(`⚠ ${aviso.nombre} no tiene dispositivo registrado: avísale por otro medio`, {
      description: `${base}, pero el aviso push NO le llegará. Confírmale por teléfono o WhatsApp.`,
      duration: 20_000,
    });
    return;
  }
  if (!aviso.notificado && opts.verbo === "actualizado") {
    // El API no manda aviso cuando el PATCH no cambió nada que el responsable
    // deba saber (misma fecha/fin/avión/título/notas): no es una falla.
    toast.success(base, {
      description: `Sin cambios que avisar a ${aviso.nombre}.`,
    });
    return;
  }
  if (!aviso.notificado) {
    toast.warning(`${base}, pero no se pudo avisar a ${aviso.nombre}: avísale por otro medio`, {
      duration: 15_000,
    });
    return;
  }
  toast.success(`${base} · avisado a ${aviso.nombre}`, {
    description: `${aviso.push_dispositivos} dispositivo${aviso.push_dispositivos === 1 ? "" : "s"} con avisos activos.`,
  });
}

function opcionesAeronave(aircraft: OpcionAeronave[]) {
  return [
    { value: "", label: "Sin avión", description: "Evento general (no ligado a una aeronave)" },
    ...aircraft.map((a) => ({
      value: a.id,
      label: a.matricula,
      description: a.modelo ?? undefined,
    })),
  ];
}

function opcionesResponsable(responsables: OpcionResponsable[]) {
  return [
    {
      value: "",
      label: "Sin responsable",
      description: "Nadie recibirá aviso",
    },
    ...responsables.map((r) => {
      const sinApp = r.push_dispositivos === 0;
      const rol = r.rol ? ROL_LABEL[r.rol] ?? r.rol : undefined;
      return {
        value: r.id,
        label: r.nombre,
        description: sinApp
          ? `${rol ? `${rol} · ` : ""}⚠ sin la app registrada: avísale por otro medio`
          : rol,
        descriptionClassName: sinApp
          ? "text-[11px] text-amber-600 dark:text-amber-400"
          : undefined,
      };
    }),
  ];
}

/** Formulario compartido de alta/edición (mismos campos, mismo orden). */
function EventoFormFields({
  values,
  onChange,
  aircraft,
  responsables,
  edicion,
}: {
  values: EventoFormValues;
  onChange: (patch: Partial<EventoFormValues>) => void;
  aircraft: OpcionAeronave[];
  responsables: OpcionResponsable[];
  edicion?: { inicioDesconocido: boolean; finAproximado: boolean };
}) {
  return (
    <div className="space-y-3">
      <Field label="Título" required>
        <Input
          placeholder="Ej. Llenar bitácora, Lavado XA-VGV, Trámite AFAC…"
          value={values.titulo}
          maxLength={120}
          onChange={(e) => onChange({ titulo: e.target.value })}
        />
      </Field>
      <Field
        label="Fecha y hora"
        required={!edicion}
        hint={
          edicion?.inicioDesconocido
            ? "El inicio de este evento está fuera del mes visible: si no lo cambias, se conserva el original."
            : TZ_LABEL
        }
      >
        <FechaHoraCampo value={values.fecha} onChange={(v) => onChange({ fecha: v })} />
      </Field>
      <Field
        label="Fin (opcional)"
        hint={
          edicion?.finAproximado
            ? "Fin aproximado (último día visible). Si no lo cambias, se conserva el original."
            : "Solo para eventos de varios días."
        }
      >
        <FechaHoraCampo value={values.fin} onChange={(v) => onChange({ fin: v })} />
      </Field>
      <Field label="Avión">
        <SearchableSelect
          options={opcionesAeronave(aircraft)}
          value={values.aeronave_id}
          onChange={(v) => onChange({ aeronave_id: v })}
          placeholder="Sin avión"
        />
      </Field>
      <Field
        label="Responsable"
        hint="Recibirá aviso en la app. Si no tiene la app con notificaciones, avísale por otro medio."
      >
        <SearchableSelect
          options={opcionesResponsable(responsables)}
          value={values.responsable_id}
          onChange={(v) => onChange({ responsable_id: v })}
          placeholder="Sin responsable"
        />
      </Field>
      <Field label="Notas (opcional)">
        <Textarea
          placeholder="Ej. Está en la oficina, llevar documentos…"
          value={values.notas}
          maxLength={500}
          onChange={(e) => onChange({ notas: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Botón "Nuevo evento": agenda una cita/evento NO-vuelo desde el panel. */
export function CreateEventoButton({
  aircraft,
  responsables,
}: {
  aircraft: OpcionAeronave[];
  responsables: OpcionResponsable[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<EventoFormValues>(VACIO);
  const patch = (p: Partial<EventoFormValues>) => setValues((v) => ({ ...v, ...p }));

  const submit = () => {
    const titulo = values.titulo.trim();
    if (!titulo) return toast.error("Escribe el título del evento.");
    if (!values.fecha) return toast.error("Elige la fecha y hora.");
    const fecha = cancunInputToIso(values.fecha);
    const fin = values.fin ? cancunInputToIso(values.fin) : "";
    if (!fecha) return toast.error("La fecha no es válida.");
    if (fin && fin < fecha) return toast.error("El fin no puede ser antes del inicio.");
    startTransition(async () => {
      const res = await createEventoFlotaAction({
        titulo,
        fecha,
        fecha_fin: fin || undefined,
        aeronave_id: values.aeronave_id || undefined,
        responsable_id: values.responsable_id || undefined,
        notas: values.notas.trim() || undefined,
      });
      if (res.ok) {
        toastAvisoEvento(res.data?.aviso, {
          verbo: "agendado",
          responsableElegido: Boolean(values.responsable_id),
        });
        setOpen(false);
        setValues(VACIO);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al agendar el evento");
      }
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <CalendarDaysIcon className="h-4 w-4" />
        Nuevo evento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo evento (no vuelo)</DialogTitle>
            <DialogDescription>
              Cita, lavado, trámite… Sale en el calendario de flota; el
              responsable lo verá en su app (inicio y Mis vuelos) y recibirá
              aviso.
            </DialogDescription>
          </DialogHeader>
          <EventoFormFields
            values={values}
            onChange={patch}
            aircraft={aircraft}
            responsables={responsables}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Agendando…" : "Agendar evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function valoresIniciales(ev: EventoFlotaResumen): EventoFormValues {
  return {
    titulo: ev.titulo,
    fecha: ev.fecha_inicio ? isoToCancunInput(ev.fecha_inicio) : "",
    fin: ev.fecha_fin_aprox ? `${ev.fecha_fin_aprox}T23:59` : "",
    aeronave_id: ev.aeronave_id ?? "",
    responsable_id: ev.responsable_id ?? "",
    notas: ev.notas ?? "",
  };
}

/**
 * Botón "Editar" del evento del día. Opera sobre el evento_id real (no el
 * id compuesto por día) y manda SOLO lo que cambió: lo que no se toca se
 * conserva tal cual en el API.
 */
export function EditEventoButton({
  evento,
  aircraft,
  responsables,
}: {
  evento: EventoFlotaResumen;
  aircraft: OpcionAeronave[];
  responsables: OpcionResponsable[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<EventoFormValues>(() => valoresIniciales(evento));
  const patch = (p: Partial<EventoFormValues>) => setValues((v) => ({ ...v, ...p }));

  const abrir = () => {
    setValues(valoresIniciales(evento));
    setOpen(true);
  };

  const submit = () => {
    const inicial = valoresIniciales(evento);
    const cambios: EventoFlotaPatch = {};
    const titulo = values.titulo.trim();
    if (!titulo) return toast.error("El título no puede quedar vacío.");
    if (titulo !== inicial.titulo) cambios.titulo = titulo;

    const fechaIso = values.fecha ? cancunInputToIso(values.fecha) : "";
    if (values.fecha !== inicial.fecha) {
      if (!fechaIso) return toast.error("La fecha no es válida.");
      cambios.fecha = fechaIso;
    }
    const finIso = values.fin ? cancunInputToIso(values.fin) : "";
    if (values.fin !== inicial.fin) cambios.fecha_fin = finIso || null;
    // Validación local con lo que se conoce; el API la repite con los
    // valores resultantes (inicio original + fin nuevo, etc.).
    if (fechaIso && finIso && finIso < fechaIso) {
      return toast.error("El fin no puede ser antes del inicio.");
    }
    if (values.aeronave_id !== inicial.aeronave_id) {
      cambios.aeronave_id = values.aeronave_id || null;
    }
    if (values.responsable_id !== inicial.responsable_id) {
      cambios.responsable_id = values.responsable_id || null;
    }
    const notas = values.notas.trim();
    if (notas !== (inicial.notas ?? "").trim()) cambios.notas = notas || null;

    if (Object.keys(cambios).length === 0) {
      toast.info("Sin cambios.");
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await updateEventoFlotaAction(evento.id, cambios);
      if (res.ok) {
        toastAvisoEvento(res.data?.aviso, {
          verbo: "actualizado",
          responsableElegido: Boolean(values.responsable_id),
        });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar el evento");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Editar evento"
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        Editar
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar evento</DialogTitle>
            <DialogDescription>
              Si cambias fecha, avión, título o notas se le avisa al
              responsable; si cambias de responsable, el anterior recibe
              &ldquo;ya no te toca&rdquo; y el nuevo su aviso.
            </DialogDescription>
          </DialogHeader>
          <EventoFormFields
            values={values}
            onChange={patch}
            aircraft={aircraft}
            responsables={responsables}
            edicion={{
              inicioDesconocido: !evento.fecha_inicio,
              finAproximado: Boolean(evento.fecha_fin_aprox),
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Renglón de entrega del aviso en el detalle del día: oficina ve de un
 * vistazo si al responsable le llegó (o le puede llegar) el aviso.
 */
export function AvisoResponsable({
  responsableNombre,
  pushDispositivos,
}: {
  responsableNombre: string | null;
  /** undefined = API viejo (no se sabe); null = sin responsable. */
  pushDispositivos: number | null | undefined;
}) {
  if (!responsableNombre) {
    return (
      <p className="text-xs text-muted-foreground">
        Sin responsable · nadie recibe aviso
      </p>
    );
  }
  if (pushDispositivos === undefined || pushDispositivos === null) {
    return <p className="text-xs text-muted-foreground">Responsable: {responsableNombre}</p>;
  }
  if (pushDispositivos === 0) {
    return (
      <p className="inline-flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
        <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-px" />
        <span>
          {responsableNombre} sin dispositivo registrado — avísale por otro medio
        </span>
      </p>
    );
  }
  return (
    <p className="inline-flex items-start gap-1 text-xs text-green-600 dark:text-green-400">
      <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 mt-px" />
      <span>
        Avisado a {responsableNombre} · {pushDispositivos} dispositivo
        {pushDispositivos === 1 ? "" : "s"}
      </span>
    </p>
  );
}
