"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import { QuickClientDialog } from "@/components/admin/clients/quick-client-dialog";
import {
  armarGrupoAction,
  createGrupoAction,
  reviseGrupoAction,
} from "@/app/admin/quotes/grupo/actions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toastAvisos } from "@/lib/admin/avisos";
import { estadoGrupoBadge, mensajeErrorGrupo } from "@/lib/admin/grupos-ui";
import { puntosRuta } from "@/lib/admin/ruta-comercial";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Airport } from "@/types/airports";
import type { Client } from "@/types/clients";
import type { MetodoPago, TipoTarifa } from "@/types/quote";
import type {
  ArmadoGrupo,
  ArmarGrupoInput,
  CreateGrupoInput,
  GrupoApiError,
  GrupoDetalle,
  OpcionDobleRotacion,
  ReviseGrupoInput,
  RevisionAMediasDetails,
  SquawkAltaDetails,
} from "@/types/grupos";
import { AvionesEditor } from "./aviones-editor";
import { CapacidadCard } from "./capacidad-card";
import { ConsolidadoCard } from "./consolidado-card";
import { ExtrasGrupoEditor } from "./extras-grupo-editor";
import { PlantillaEditor } from "./plantilla-editor";
import { SeccionGrupo, type SeccionGrupoId } from "./seccion-grupo";
import { SquawkGrupoDialog } from "./squawk-grupo-dialog";
import { TotalBarGrupo } from "./total-bar-grupo";
import { armarPayloadDe, createPayloadDe, revisePayloadDe } from "./payload";
import {
  METODOS_PAGO_GRUPO,
  MOTIVO_BLOQUEO_LABEL,
  avionDeArmado,
  defaultsDesdeGrupo,
  defaultsNuevoGrupo,
  sumaPax,
  type AeronaveOption,
  type AeropuertoOption,
  type ClienteOption,
  type GrupoFormValues,
  type PilotoOption,
  type RutaOption,
} from "./types";

/** Debounce del preview (POST /armar): pedido del diseño, 600 ms. */
const ARMAR_DEBOUNCE_MS = 600;
/** Plegado del operador (solo alta nueva), patrón del cotizador. */
const SECCIONES_LS_KEY = "vt-grupo-plegado-v1";

type GrupoFormProps = {
  aircraft: AeronaveOption[];
  airports: AeropuertoOption[];
  routes: RutaOption[];
  pilots: PilotoOption[];
  /** TC oficial del día (open.er-api) para sugerirlo; null = sin dato. */
  tcSugerido: number | null;
} & (
  | {
      mode: "create";
      clients: ClienteOption[];
      frequentClientIds?: string[];
      grupo?: undefined;
    }
  | {
      mode: "revise";
      clients?: undefined;
      frequentClientIds?: undefined;
      grupo: GrupoDetalle;
    }
);

function seccionesDefault(revise: boolean): Record<SeccionGrupoId, boolean> {
  return revise
    ? { revision: true, grupo: false, ruta: false, cargos: true, aviones: true, consolidado: true, notas: false }
    : { revision: false, grupo: true, ruta: true, cargos: true, aviones: true, consolidado: true, notas: false };
}

function esSquawkDetails(d: unknown): d is SquawkAltaDetails {
  return !!d && typeof d === "object" && typeof (d as SquawkAltaDetails).matricula === "string";
}

function esAMediasDetails(d: unknown): d is RevisionAMediasDetails {
  return !!d && typeof d === "object" && Array.isArray((d as RevisionAMediasDetails).aplicados);
}

/**
 * Wizard de UNA pantalla de la cotización de GRUPO (alta y revisión):
 * secciones plegables como el cotizador, preview vivo con `POST /armar`
 * (debounce 600 ms + candado anti-carrera) y guardado con los 409
 * estructurados del API (squawk ALTA por avión, revisión a medias, hijos
 * congelados). El panel SOLO PINTA lo que devuelve el armador: totales,
 * consolidado, por persona y salidas escalonadas nunca se calculan aquí.
 */
export function GrupoForm(props: GrupoFormProps) {
  const { aircraft, routes, pilots, tcSugerido } = props;
  const isRevise = props.mode === "revise";
  const grupo = props.grupo ?? null;
  const router = useRouter();

  const formDefaults = useMemo(
    () => (grupo ? defaultsDesdeGrupo(grupo) : defaultsNuevoGrupo()),
    [grupo],
  );
  const { register, watch, setValue, getValues } = useForm<GrupoFormValues>({
    mode: "onChange",
    defaultValues: formDefaults,
  });
  const values = watch();

  // ===== Catálogos con altas inline (cliente / aeropuerto) =====
  const [extraClients, setExtraClients] = useState<ClienteOption[]>([]);
  const allClients = useMemo<ClienteOption[]>(() => {
    if (isRevise && grupo?.cliente) {
      return [
        {
          id: grupo.cliente.id,
          nombre: grupo.cliente.nombre,
          es_broker: false,
          es_interno: grupo.cliente.es_interno,
          rfc: null,
        },
      ];
    }
    return [...(props.clients ?? []), ...extraClients];
  }, [isRevise, grupo, props.clients, extraClients]);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [extraAirports, setExtraAirports] = useState<AeropuertoOption[]>([]);
  const airports = useMemo(
    () => [...props.airports, ...extraAirports],
    [props.airports, extraAirports],
  );
  const onAeropuertoCreado = (a: Airport) =>
    setExtraAirports((prev) =>
      prev.some((x) => x.iata === a.iata)
        ? prev
        : [...prev, { iata: a.iata, nombre: a.nombre, latitud: a.latitud, longitud: a.longitud }],
    );

  const clienteSel = allClients.find((c) => c.id === values.cliente_id) ?? null;
  const pasajerosTotal = Number(values.pasajeros_total) || 0;
  const paxCapturados = sumaPax(values.aviones);
  const paxOk = pasajerosTotal > 0 && paxCapturados === pasajerosTotal;
  const hayExtrasMxn = values.extras_grupo.some((e) => e.moneda === "MXN" && Number(e.unitario) > 0);
  const tcCapturado = Number(values.tc_usd_mxn) > 0;
  const congelados = values.aviones.filter((a) => a.congelado != null);

  // ===== Preview (POST /armar) con debounce + candado anti-carrera =====
  const armarRes = useMemo(() => armarPayloadDe(values), [values]);
  const payloadJson = armarRes.payload ? JSON.stringify(armarRes.payload) : null;
  const debouncedJson = useDebouncedValue(payloadJson, ARMAR_DEBOUNCE_MS);
  const [armado, setArmado] = useState<ArmadoGrupo | null>(null);
  const [armadoJson, setArmadoJson] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);
  const [armadoError, setArmadoError] = useState<GrupoApiError | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!debouncedJson) {
      seqRef.current += 1;
      setArmado(null);
      setArmadoJson(null);
      setArmadoError(null);
      setArmando(false);
      return;
    }
    const seq = ++seqRef.current;
    setArmando(true);
    const payload = JSON.parse(debouncedJson) as ArmarGrupoInput;
    armarGrupoAction(payload).then((res) => {
      // Respuesta vieja (ya hubo otra captura): se descarta.
      if (seq !== seqRef.current) return;
      setArmando(false);
      if (res.ok) {
        setArmado(res.data);
        setArmadoJson(debouncedJson);
        setArmadoError(null);
        // Sin aviones capturados el server PROPONE flota: se adopta como
        // filas editables (solo si el operador no agregó ninguna mientras).
        if ((payload.aviones?.length ?? 0) === 0 && res.data.aviones.length > 0 && getValues("aviones").length === 0) {
          setValue("aviones", res.data.aviones.map(avionDeArmado));
        }
      } else {
        // Se conserva el último armado bueno (atenuado) y se muestra el error.
        setArmadoError(res.error);
      }
    });
  }, [debouncedJson, getValues, setValue]);

  const stale = !!armado && armadoJson !== payloadJson;
  const armadoAviones =
    armado && armado.aviones.length === values.aviones.length ? armado.aviones : null;
  const armadoErrorTexto = armadoError ? mensajeErrorGrupo(armadoError) : null;

  // ===== Secciones (solo presentación) =====
  const [abiertas, setAbiertas] = useState<Record<SeccionGrupoId, boolean>>(() =>
    seccionesDefault(isRevise),
  );
  useEffect(() => {
    if (isRevise) return;
    try {
      const raw = localStorage.getItem(SECCIONES_LS_KEY);
      if (!raw) return;
      const guardado = JSON.parse(raw) as Record<string, unknown>;
      if (!guardado || typeof guardado !== "object") return;
      setAbiertas((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as SeccionGrupoId[]) {
          if (typeof guardado[k] === "boolean") next[k] = guardado[k] as boolean;
        }
        return next;
      });
    } catch {
      // Sin storage: quedan los defaults.
    }
  }, [isRevise]);
  const toggleSeccion = (id: SeccionGrupoId) => {
    const next = { ...abiertas, [id]: !abiertas[id] };
    setAbiertas(next);
    if (!isRevise) {
      try {
        localStorage.setItem(SECCIONES_LS_KEY, JSON.stringify(next));
      } catch {
        // Sin storage, el plegado vive solo en la sesión.
      }
    }
  };
  const abrirSeccion = useCallback(
    (id: SeccionGrupoId) => setAbiertas((prev) => (prev[id] ? prev : { ...prev, [id]: true })),
    [],
  );
  const focusTc = () => {
    abrirSeccion("grupo");
    setTimeout(() => {
      const el = document.getElementById("grupo-tc-field");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector("input")?.focus();
    }, 60);
  };
  const focusMotivo = () => {
    abrirSeccion("revision");
    setTimeout(() => {
      const el = document.getElementById("grupo-motivo-field");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector("textarea")?.focus();
    }, 60);
  };

  // ===== Aviones: acciones =====
  const [confirmQuitar, setConfirmQuitar] = useState<number | null>(null);
  const [confirmProponer, setConfirmProponer] = useState(false);

  const quitarAvion = (idx: number) => {
    const a = values.aviones[idx];
    if (!a) return;
    if (a.vuelo_id) {
      setConfirmQuitar(idx);
      return;
    }
    setValue("aviones", values.aviones.filter((_, i) => i !== idx));
  };
  const proponerFlota = () => {
    if (values.aviones.length > 0) {
      setConfirmProponer(true);
      return;
    }
    setValue("aviones", []);
  };
  const aplicarDobleRotacion = (op: OpcionDobleRotacion) => {
    const idx = values.aviones.findIndex(
      (a, i) => a.aeronave_id === op.aeronave_id && i + 1 === op.posicion,
    );
    const i = idx >= 0 ? idx : values.aviones.findIndex((a) => a.aeronave_id === op.aeronave_id);
    if (i < 0) return;
    setValue(
      "aviones",
      values.aviones.map((a, k) => (k === i ? { ...a, rotaciones: 2, pax: op.pax } : a)),
    );
    toast.success(`${op.matricula} hará doble vuelta con ${op.pax} pasajeros`);
  };

  // ===== Guardar =====
  const [saving, startSaving] = useTransition();
  const [squawk, setSquawk] = useState<{
    detalle: SquawkAltaDetails;
    payload: CreateGrupoInput | ReviseGrupoInput;
  } | null>(null);
  const [aMedias, setAMedias] = useState<{ texto: string; details: RevisionAMediasDetails } | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const nombreOk = values.nombre.trim().length >= 2;
  const motivoOk = values.motivo.trim().length >= 3;
  // Una fila sin aeronave no viaja al API (avionesPayload la omite): sin
  // este candado la Σ pax local cuadraría y el API respondería PAX_NO_CUADRAN
  // o 400 (aviones vacío) sin que el operador vea cuál fila es.
  const filaSinAvion = values.aviones.findIndex((a) => !a.aeronave_id);
  const avionesOk = values.aviones.length > 0 && filaSinAvion < 0;
  const canSave =
    !!armarRes.payload &&
    !!armado &&
    !stale &&
    !armando &&
    !armadoError &&
    avionesOk &&
    paxOk &&
    nombreOk &&
    (!isRevise || motivoOk);
  const faltaSoloMotivo = isRevise && !motivoOk && canSave === false && !!armarRes.payload && !!armado && !stale && !armando && !armadoError && avionesOk && paxOk && nombreOk;

  /** Aplica `creados[]` del 409 a medias: esos aviones ya existen (vuelo_id). */
  const aplicarCreados = (d: RevisionAMediasDetails) => {
    if (d.creados.length === 0) return;
    const aviones = getValues("aviones").map((a) => ({ ...a }));
    for (const c of d.creados) {
      const k = Number(/^nuevo-(\d+)$/.exec(c.key)?.[1]);
      let idx = Number.isFinite(k) ? k - 1 : -1;
      if (!(idx >= 0 && aviones[idx] && !aviones[idx].vuelo_id && (!c.aeronave_id || aviones[idx].aeronave_id === c.aeronave_id))) {
        idx = aviones.findIndex((a) => !a.vuelo_id && a.aeronave_id === c.aeronave_id);
      }
      if (idx >= 0) {
        aviones[idx].vuelo_id = c.vuelo_id;
        aviones[idx].uid = c.vuelo_id;
      }
    }
    setValue("aviones", aviones);
  };

  const manejarErrorGuardar = (err: GrupoApiError, payload: CreateGrupoInput | ReviseGrupoInput) => {
    if (err.error === "SQUAWK_ALTA_SIN_RESOLVER" && esSquawkDetails(err.details)) {
      setSquawk({ detalle: err.details, payload });
      return;
    }
    const texto = mensajeErrorGrupo(err);
    if (err.error === "REVISION_A_MEDIAS" && esAMediasDetails(err.details)) {
      aplicarCreados(err.details);
      setAMedias({ texto, details: err.details });
      setErrorGuardar(null);
      toast.error("La revisión quedó a medias: revisa el aviso y vuelve a guardar");
      return;
    }
    if (err.error === "HIJOS_CONGELADOS") abrirSeccion("revision");
    if (err.error === "CAPACIDAD_EXCEDIDA" || err.error === "PAX_NO_CUADRAN" || err.error === "PILOTO_DUPLICADO") {
      abrirSeccion("aviones");
    }
    setErrorGuardar(texto);
    toast.error(texto);
  };

  const ejecutar = (payload: CreateGrupoInput | ReviseGrupoInput) => {
    setErrorGuardar(null);
    startSaving(async () => {
      if (isRevise && grupo) {
        const res = await reviseGrupoAction(grupo.id, payload as ReviseGrupoInput);
        if (res.ok) {
          setSquawk(null);
          setAMedias(null);
          toast.success(`Grupo ${res.data.folio_texto} revisado (v${res.data.version})`);
          toastAvisos(res.data.avisos);
          router.push(`/admin/quotes/grupo/${res.data.id}`);
          router.refresh();
          return;
        }
        setSquawk(null);
        manejarErrorGuardar(res.error, payload);
        return;
      }
      const res = await createGrupoAction(payload as CreateGrupoInput);
      if (res.ok) {
        setSquawk(null);
        toast.success(
          `Grupo ${res.data.folio_texto} creado · ${res.data.aviones_vivos} ${res.data.aviones_vivos === 1 ? "avión" : "aviones"}`,
        );
        toastAvisos(res.data.avisos);
        router.push(`/admin/quotes/grupo/${res.data.id}`);
        return;
      }
      setSquawk(null);
      manejarErrorGuardar(res.error, payload);
    });
  };

  const handleSave = () => {
    if (faltaSoloMotivo) {
      toast.error("Escribe el motivo de la revisión");
      focusMotivo();
      return;
    }
    if (!armarRes.payload) {
      toast.error(armarRes.falta ?? "Faltan datos para guardar");
      return;
    }
    if (!nombreOk) {
      toast.error("Ponle un nombre al grupo (mínimo 2 caracteres)");
      abrirSeccion("grupo");
      return;
    }
    if (values.aviones.length === 0) {
      toast.error("Agrega al menos un avión al grupo");
      abrirSeccion("aviones");
      return;
    }
    if (filaSinAvion >= 0) {
      toast.error(`Elige la aeronave del avión ${filaSinAvion + 1} (o quita esa fila)`);
      abrirSeccion("aviones");
      return;
    }
    if (!paxOk) {
      const d = pasajerosTotal - paxCapturados;
      toast.error(
        d > 0
          ? `Faltan ${d} pasajeros por acomodar (${paxCapturados} de ${pasajerosTotal})`
          : `Sobran ${-d} pasajeros: los aviones suman ${paxCapturados} y el grupo es de ${pasajerosTotal}`,
      );
      abrirSeccion("aviones");
      return;
    }
    if (!canSave) {
      toast.error(armadoErrorTexto ?? "Espera a que termine el cálculo");
      return;
    }
    const payload = isRevise
      ? revisePayloadDe(values, armarRes.payload)
      : createPayloadDe(values, armarRes.payload);
    ejecutar(payload);
  };

  const confirmarSquawk = () => {
    if (!squawk) return;
    const { detalle, payload } = squawk;
    const aviones = getValues("aviones");
    let idx = aviones.findIndex((a) => a.aeronave_id === detalle.aeronave_id);
    if (idx < 0) idx = detalle.posicion - 1;
    if (idx < 0 || !aviones[idx]) {
      setSquawk(null);
      toast.error(mensajeErrorGrupo({ message: "", error: "SQUAWK_ALTA_SIN_RESOLVER", details: detalle, status: 409 }));
      return;
    }
    setValue(
      "aviones",
      aviones.map((a, i) => (i === idx ? { ...a, aceptar_discrepancia_alta: true } : a)),
    );
    const next = {
      ...payload,
      aviones: (payload.aviones ?? []).map((a) =>
        a.aeronave_id === detalle.aeronave_id ? { ...a, aceptar_discrepancia_alta: true } : a,
      ),
    } as CreateGrupoInput | ReviseGrupoInput;
    setSquawk(null);
    ejecutar(next);
  };

  // ===== Resúmenes de secciones plegadas =====
  const rutaTexto = puntosRuta(
    values.escalas_plantilla.map((t) => ({ origen: t.origen_iata, destino: t.destino_iata })),
  ).join(" → ");
  const resumenGrupo = [
    clienteSel?.nombre ?? "Sin cliente",
    values.nombre.trim() || null,
    pasajerosTotal ? `${pasajerosTotal} pax` : null,
    values.fecha_vuelo ? values.fecha_vuelo.replace("T", " ") : null,
    METODOS_PAGO_GRUPO.find((m) => m.value === values.metodo_pago)?.label ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  const resumenCargos =
    values.extras_grupo.length > 0
      ? `${values.extras_grupo.length} ${values.extras_grupo.length === 1 ? "cargo" : "cargos"}${
          Number(values.ajuste_grupo_usd) ? ` · ajuste ${fmtUsd(Number(values.ajuste_grupo_usd))}` : ""
        }`
      : Number(values.ajuste_grupo_usd)
        ? `Ajuste ${fmtUsd(Number(values.ajuste_grupo_usd))}`
        : "Sin cargos extra";
  const resumenAviones = `${values.aviones.length} ${values.aviones.length === 1 ? "avión" : "aviones"} · ${paxCapturados} de ${pasajerosTotal || "—"} pax`;
  const avisoAviones =
    pasajerosTotal > 0 && !paxOk
      ? paxCapturados < pasajerosTotal
        ? `Faltan ${pasajerosTotal - paxCapturados} pax`
        : `Sobran ${paxCapturados - pasajerosTotal} pax`
      : filaSinAvion >= 0
        ? `Avión ${filaSinAvion + 1} sin aeronave`
        : armadoError
          ? "Revisar"
          : null;
  const avisoCargos = hayExtrasMxn && !tcCapturado ? "Falta TC" : null;
  const estado = grupo ? estadoGrupoBadge(grupo.estado) : null;

  return (
    <div className="space-y-4 pb-4">
      {/* Aviso de revisión a medias: qué quedó aplicado y cómo completar. */}
      {aMedias && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-medium text-amber-700 dark:text-amber-400">{aMedias.texto}</p>
            {aMedias.details.aplicados.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Aplicado: {aMedias.details.aplicados.join(", ")}.
              </p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reintentar la revisión
            </Button>
          </div>
        </div>
      )}
      {errorGuardar && !aMedias && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
          <p>{errorGuardar}</p>
        </div>
      )}

      {/* 0 · Revisión (solo editar) */}
      {isRevise && grupo && (
        <SeccionGrupo
          id="revision"
          titulo="Revisión del grupo"
          resumen={values.motivo.trim() ? `Motivo: ${values.motivo.trim()}` : "Falta el motivo"}
          aviso={!motivoOk ? "Motivo obligatorio" : null}
          abierta={abiertas.revision}
          onToggle={() => toggleSeccion("revision")}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold">{grupo.folio_texto}</span>
            <span className="font-mono text-xs text-muted-foreground">v{grupo.version}</span>
            {estado && (
              <Badge variant={estado.variant} className={estado.className} title={estado.title}>
                {estado.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              · guardar genera la v{grupo.version + 1} y recotiza cada avión editable
            </span>
          </div>
          <div id="grupo-motivo-field">
            <Field label="Motivo de la revisión" required hint="Queda en el historial de cada avión del grupo">
              <Textarea rows={2} placeholder="Ej. El cliente subió a 46 pasajeros" {...register("motivo")} />
            </Field>
          </div>
          {congelados.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Aplicar solo a los aviones editables</Label>
                  <p className="text-xs text-muted-foreground">
                    Hay aviones que ya no se pueden recotizar:{" "}
                    {congelados
                      .map((a) => `avión ${values.aviones.indexOf(a) + 1}${a.folio ? ` #${a.folio}` : ""} (${MOTIVO_BLOQUEO_LABEL[a.congelado!]})`)
                      .join(", ")}
                    . Con esto prendido, su precio y cargos se conservan y el cambio aplica al resto (el total
                    del grupo cambia). Apagado, el sistema no guarda nada.
                  </p>
                </div>
                <Switch
                  checked={values.solo_editables}
                  onCheckedChange={(c) => setValue("solo_editables", c)}
                />
              </div>
            </div>
          )}
        </SeccionGrupo>
      )}

      {/* 1 · Cliente y grupo */}
      <SeccionGrupo
        id="grupo"
        titulo="Cliente y grupo"
        resumen={resumenGrupo}
        aviso={!values.cliente_id ? "Falta cliente" : !nombreOk ? "Falta nombre" : null}
        abierta={abiertas.grupo}
        onToggle={() => toggleSeccion("grupo")}
      >
        {isRevise && grupo ? (
          <div className="rounded-lg border border-border bg-navy-800/50 px-3 py-2 space-y-0.5">
            <p className="text-[11px] uppercase tracking-wider text-foreground/70">Cliente</p>
            <p className="text-sm font-medium">{grupo.cliente?.nombre ?? grupo.cliente_id}</p>
            {grupo.cliente?.es_interno && (
              <p className="text-xs text-sky-700 dark:text-sky-400">Cliente interno — el grupo puede ir en $0.</p>
            )}
          </div>
        ) : (
          <Field label="Cliente" required>
            <div className="space-y-2">
              {clienteSel && (
                <div className="rounded-lg border border-brand-500/30 bg-brand-500/15 px-3 py-2">
                  <p className="text-lg font-bold leading-tight">{clienteSel.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      clienteSel.es_interno ? "Interno · operación propia" : null,
                      clienteSel.es_broker ? "Broker · tarifa broker" : null,
                      clienteSel.rfc,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Cliente directo"}
                  </p>
                </div>
              )}
              <SearchableSelect
                options={allClients.map((c) => ({
                  value: c.id,
                  label: c.nombre,
                  description: [c.rfc, c.es_broker ? "Broker" : null, c.es_interno ? "Interno" : null]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                value={values.cliente_id}
                onChange={(v) => {
                  setValue("cliente_id", v);
                  const cli = allClients.find((c) => c.id === v);
                  if (cli?.es_broker) setValue("tarifa_tipo", "BROKER");
                }}
                placeholder="Selecciona cliente"
                emptyText="Sin clientes activos"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {(props.frequentClientIds ?? [])
                  .map((id) => allClients.find((c) => c.id === id))
                  .filter((c): c is ClienteOption => !!c)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setValue("cliente_id", c.id);
                        if (c.es_broker) setValue("tarifa_tipo", "BROKER");
                      }}
                      className={cn(
                        "max-w-[12rem] truncate rounded-full border px-2.5 py-1 text-xs transition-colors",
                        values.cliente_id === c.id
                          ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
                          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {c.nombre}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setClientDialogOpen(true)}
                  className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
                >
                  + Nuevo cliente
                </button>
              </div>
            </div>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nombre del grupo" required hint="Cómo lo identifica la oficina (ej. Tour Chichén 12 oct)">
            <Input placeholder="Ej. Familia Pérez · Chichén Itzá" maxLength={120} {...register("nombre")} />
          </Field>
          <Field label="Pasajeros del grupo" required hint="Total de personas; se reparten entre los aviones">
            <Input
              type="number"
              min={1}
              max={500}
              step={1}
              value={values.pasajeros_total}
              onChange={(e) =>
                setValue(
                  "pasajeros_total",
                  e.target.value === "" ? "" : Math.max(1, Math.floor(Number(e.target.value) || 1)),
                )
              }
              placeholder="Ej. 44"
            />
          </Field>
        </div>

        <Field label="Fecha y hora de salida" required hint="Hora de Cancún · cada avión sale escalonado 10 min después del anterior">
          <FechaHoraCampo value={values.fecha_vuelo} onChange={(v) => setValue("fecha_vuelo", v)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de tarifa</Label>
            <div className="inline-flex w-full rounded-lg border border-border bg-navy-800/50 p-1">
              {(["PUBLICO", "BROKER"] as TipoTarifa[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue("tarifa_tipo", t)}
                  className={cn(
                    "flex-1 h-8 px-3 text-xs font-medium rounded-md transition-colors",
                    values.tarifa_tipo === t ? "bg-navy-700 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "PUBLICO" ? "Público" : "Broker"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada avión cobra su tarifa (o la preferencial del cliente); se puede pactar por avión en la sección Aviones.
            </p>
          </div>
          <Field label="Método de pago" required>
            <SearchableSelect
              options={METODOS_PAGO_GRUPO.map((m) => ({ value: m.value, label: m.label, description: m.hint }))}
              value={values.metodo_pago}
              onChange={(v) => setValue("metodo_pago", v as MetodoPago)}
              placeholder="Selecciona método"
            />
          </Field>
        </div>
        {values.metodo_pago === "OTRO" && (
          <Field label="¿Cuál método?" required hint="Escríbelo tal como quieren verlo (ej. PayPal)">
            <Input value={values.metodo_pago_detalle} onChange={(e) => setValue("metodo_pago_detalle", e.target.value)} placeholder="Nombre del método" maxLength={80} />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div id="grupo-tc-field" className="scroll-mt-24">
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint={hayExtrasMxn ? "Requerido: hay cargos capturados en pesos" : "Opcional · si el pago entrará en pesos"}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  placeholder="Ej. 18.50"
                  className="w-32"
                  value={values.tc_usd_mxn}
                  onChange={(e) => setValue("tc_usd_mxn", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                />
                {tcSugerido != null && Number(values.tc_usd_mxn) !== tcSugerido && (
                  <button
                    type="button"
                    onClick={() => setValue("tc_usd_mxn", tcSugerido)}
                    className="text-xs text-sky-700 dark:text-sky-400 underline underline-offset-2"
                  >
                    Usar TC del día: {tcSugerido}
                  </button>
                )}
              </div>
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium">Pase de abordar</Label>
            <div className="flex items-center h-9">
              <Switch checked={values.pase_abordar} onCheckedChange={(c) => setValue("pase_abordar", c)} />
              <span className="text-xs text-muted-foreground ml-3">Exenta TUAS (excepto CZM)</span>
            </div>
          </div>
        </div>
      </SeccionGrupo>

      {/* 2 · Ruta plantilla */}
      <SeccionGrupo
        id="ruta"
        titulo="Ruta del grupo"
        resumen={rutaTexto || "Sin ruta"}
        aviso={armarRes.falta?.includes("millas") ? "Faltan millas" : null}
        abierta={abiertas.ruta}
        onToggle={() => toggleSeccion("ruta")}
      >
        <PlantillaEditor
          value={values.escalas_plantilla}
          onChange={(t) => setValue("escalas_plantilla", t)}
          routes={routes}
          airports={airports}
          onAeropuertoCreado={onAeropuertoCreado}
        />
      </SeccionGrupo>

      {/* 3 · Cargos del grupo + 4 · Ajuste */}
      <SeccionGrupo
        id="cargos"
        titulo="Cargos y ajuste del grupo"
        resumen={resumenCargos}
        aviso={avisoCargos}
        abierta={abiertas.cargos}
        onToggle={() => toggleSeccion("cargos")}
      >
        <ExtrasGrupoEditor
          value={values.extras_grupo}
          onChange={(e) => setValue("extras_grupo", e)}
          pasajerosTotal={pasajerosTotal}
          tcCapturado={tcCapturado}
          armado={stale ? null : armado}
          onFocusTc={focusTc}
        />
        <Field
          label="Ajuste del grupo (USD, antes de IVA)"
          hint="Negativo = descuento («ciérramelo en 21,000»). Se reparte a los aviones por su base gravable; los centavos van al ancla."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              className="w-36"
              value={values.ajuste_grupo_usd}
              onChange={(e) => setValue("ajuste_grupo_usd", e.target.value === "" ? "" : Number(e.target.value))}
            />
            {armado && !stale && armado.consolidado.ajuste_usd !== 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                {armado.consolidado.ajuste_usd < 0 ? "Descuento" : "Ajuste"} en el consolidado: {fmtUsd(armado.consolidado.ajuste_usd)}
              </span>
            )}
          </div>
        </Field>
      </SeccionGrupo>

      {/* 5 · Aviones + 6 · Capacidad */}
      <SeccionGrupo
        id="aviones"
        titulo="Aviones del grupo"
        resumen={resumenAviones}
        aviso={avisoAviones}
        abierta={abiertas.aviones}
        onToggle={() => toggleSeccion("aviones")}
      >
        <CapacidadCard
          pasajerosTotal={pasajerosTotal}
          paxCapturados={paxCapturados}
          capacidad={armado?.capacidad ?? null}
          stale={stale || armando}
          onDobleRotacion={aplicarDobleRotacion}
          disabled={saving}
        />
        {armadoErrorTexto && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{armadoErrorTexto}</p>
          </div>
        )}
        {armado && !stale && armado.avisos_grupo.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {armado.avisos_grupo.map((t) => (
              <li key={t} className="flex items-start gap-1.5">
                <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
        {armado && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <InformationCircleIcon className="h-3.5 w-3.5 shrink-0" />
            Pilotos ese día: {armado.pilotos.activos} activos · {armado.pilotos.libres} libres ·{" "}
            {armado.pilotos.sin_asignar} {armado.pilotos.sin_asignar === 1 ? "avión" : "aviones"} sin piloto
            {armado.pilotos.faltan > 0 ? ` · faltan ${armado.pilotos.faltan}` : ""}
          </p>
        )}
        <AvionesEditor
          value={values.aviones}
          onChange={(a) => setValue("aviones", a)}
          armadoAviones={armadoAviones}
          stale={stale || armando}
          aircraft={aircraft}
          pilots={pilots}
          pasajerosTotal={pasajerosTotal}
          revise={isRevise}
          onQuitar={quitarAvion}
          onProponer={isRevise ? undefined : proponerFlota}
          disabled={saving}
        />
      </SeccionGrupo>

      {/* 7 · Consolidado */}
      <SeccionGrupo
        id="consolidado"
        titulo="Consolidado del grupo"
        resumen={armado ? `${fmtUsd(armado.consolidado.total_usd)} · ${armado.consolidado.aviones} aviones` : "Sin cálculo aún"}
        aviso={armado && !armado.consolidado.verificacion.cuadra ? "No cuadra" : null}
        abierta={abiertas.consolidado}
        onToggle={() => toggleSeccion("consolidado")}
      >
        {armado ? (
          <>
            {isRevise && congelados.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <InformationCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Este cálculo recotiza TODOS los aviones; al guardar, los congelados conservan su
                precio actual y el total del grupo puede diferir.
              </p>
            )}
            <ConsolidadoCard consolidado={armado.consolidado} pasajerosTotal={armado.pasajeros_total} stale={stale || armando} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {armarRes.falta ?? "Calculando el consolidado…"}
          </p>
        )}
      </SeccionGrupo>

      {/* Notas y PDF */}
      <SeccionGrupo
        id="notas"
        titulo="Notas y PDF"
        resumen={[
          values.notas.trim() ? "Con notas" : "Sin notas",
          values.pdf_mostrar_anexo_aviones ? "anexo de flota" : null,
          values.pdf_mostrar_precio_por_persona ? "precio por persona" : null,
          values.pdf_mostrar_subtotal_por_avion ? "subtotal por avión" : null,
          values.pdf_mostrar_tarifa ? "tarifa" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        abierta={abiertas.notas}
        onToggle={() => toggleSeccion("notas")}
      >
        <Field label="Notas (visibles en el PDF)" hint="Opcional">
          <Textarea rows={2} placeholder="Ej. Sujeto a slot CUN…" maxLength={2000} {...register("notas")} />
        </Field>
        <Field label="Notas internas" hint="Opcional · no aparecen en el PDF">
          <Textarea rows={2} placeholder="Solo para el equipo" maxLength={2000} {...register("notas_internas")} />
        </Field>
        <div className="space-y-2 rounded-lg border border-border bg-navy-800/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">PDF del grupo</p>
          {(
            [
              ["pdf_mostrar_anexo_aviones", "Anexo «Flota asignada»", "Hoja con los aviones del grupo (modelo, asientos, pasajeros, salidas)."],
              ["pdf_mostrar_precio_por_persona", "Precio por persona", "Total del grupo entre los pasajeros, junto al total."],
              ["pdf_mostrar_subtotal_por_avion", "Subtotal por avión", "En el anexo, lo que cuesta cada avión (apagado: solo el total del grupo)."],
              ["pdf_mostrar_tarifa", "Tarifa por hora", "En el anexo, USD/hr de cada avión (apagado: solo montos)."],
            ] as const
          ).map(([campo, titulo, hint]) => (
            <div key={campo} className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{titulo}</Label>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              <Switch checked={values[campo]} onCheckedChange={(c) => setValue(campo, c)} />
            </div>
          ))}
        </div>
      </SeccionGrupo>

      <TotalBarGrupo
        armado={armado}
        armando={armando}
        stale={stale}
        error={armadoErrorTexto}
        falta={armarRes.falta}
        pasajerosTotal={pasajerosTotal}
        paxCapturados={paxCapturados}
        titulo={clienteSel?.nombre ?? grupo?.cliente?.nombre ?? null}
        subtitulo={isRevise && grupo ? `${grupo.folio_texto} · v${grupo.version} → v${grupo.version + 1}` : "Nuevo grupo"}
        saveLabel={isRevise ? "Guardar revisión" : "Crear grupo"}
        saveDisabled={!canSave && !faltaSoloMotivo}
        saving={saving}
        onSave={handleSave}
        apartar={isRevise ? undefined : values.apartar}
        onApartarChange={isRevise ? undefined : (v) => setValue("apartar", v)}
      />

      {/* Diálogos */}
      <SquawkGrupoDialog
        detalle={squawk?.detalle ?? null}
        pending={saving}
        onCancel={() => setSquawk(null)}
        onConfirm={confirmarSquawk}
      />
      <AlertDialog open={confirmQuitar !== null} onOpenChange={(o) => !o && setConfirmQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar este avión del grupo</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmQuitar !== null && values.aviones[confirmQuitar]
                ? `Al guardar la revisión, el vuelo #${values.aviones[confirmQuitar].folio ?? "?"} se CANCELA y su tripulación recibe el aviso. Los cargos repartidos se recalculan entre los aviones que quedan.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                const idx = confirmQuitar;
                setConfirmQuitar(null);
                if (idx === null) return;
                setValue("aviones", getValues("aviones").filter((_, i) => i !== idx));
              }}
            >
              Quitar del grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmProponer} onOpenChange={setConfirmProponer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Proponer flota de nuevo</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplaza la lista de aviones (y lo capturado en cada fila: pasajeros, vueltas, pilotos, horas)
              por la propuesta del sistema para {pasajerosTotal || "los"} pasajeros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmProponer(false);
                setValue("aviones", []);
              }}
            >
              Proponer flota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!isRevise && (
        <QuickClientDialog
          open={clientDialogOpen}
          onOpenChange={setClientDialogOpen}
          onCreated={(c: Client) => {
            setExtraClients((prev) => [
              ...prev,
              { id: c.id, nombre: c.nombre, es_broker: c.es_broker, es_interno: c.es_interno, rfc: c.rfc },
            ]);
            setValue("cliente_id", c.id);
          }}
        />
      )}
    </div>
  );
}
