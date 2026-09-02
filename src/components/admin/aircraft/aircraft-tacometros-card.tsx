"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
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
import { fmtDateTime } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";
import {
  aircraftTacometrosAction,
  updatePlaneadorBaseAction,
  updateServicioEtapasAction,
} from "@/app/admin/aircraft/actions";
import type { ServicioEtapa, TacometroHistorial } from "@/types/aircraft";
import { DataTable } from "@/components/admin/data-table";
import { ImagePreview } from "@/components/admin/image-preview";
import { BitacoraPdfButton } from "./bitacora-pdf-button";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelCls = "text-[11px] uppercase tracking-wide text-muted-foreground";

/** Fila del editor de etapas (texto crudo; se valida al guardar, con error visible). */
interface EtapaDraft {
  key: string;
  intervalo: string;
  nombre: string;
  /** Tareas de la etapa, una por línea. */
  tareas: string;
  error?: string;
}

let draftSeq = 0;
function nuevaFila(e?: ServicioEtapa | { intervalo_hr: number }): EtapaDraft {
  draftSeq += 1;
  return {
    key: `etapa-${draftSeq}`,
    intervalo: e ? String(e.intervalo_hr) : "",
    nombre: e && "nombre" in e ? (e.nombre ?? "") : "",
    tareas: e && "tareas" in e ? e.tareas.join("\n") : "",
  };
}

export function AircraftTacometrosCard({
  aircraftId,
  matricula,
}: {
  aircraftId: string;
  matricula: string;
}) {
  const [data, setData] = useState<TacometroHistorial | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor del programa de servicio (etapas)
  const [editorOpen, setEditorOpen] = useState(false);
  const [etapas, setEtapas] = useState<EtapaDraft[]>([]);
  const [base, setBase] = useState("0");
  const [baseError, setBaseError] = useState<string | null>(null);
  const [confirmVaciar, setConfirmVaciar] = useState(false);
  const [saving, startSaving] = useTransition();

  // Base histórica del planeador
  const [planOpen, setPlanOpen] = useState(false);
  const [planBase, setPlanBase] = useState("0");
  const [planRef, setPlanRef] = useState("0");
  const [planError, setPlanError] = useState<string | null>(null);
  const [savingPlan, startSavingPlan] = useTransition();

  const aplicarDatos = useCallback((d: TacometroHistorial) => {
    setData(d);
    // Prellenar el editor con las etapas del API; si el avión aún tiene solo
    // el arreglo legado de intervalos, se convierten en etapas sin nombre.
    const desdeEtapas = (d.servicio_etapas ?? []).map((e) => nuevaFila(e));
    const filas =
      desdeEtapas.length > 0
        ? desdeEtapas
        : (d.servicio_intervalos ?? []).map((i) => nuevaFila({ intervalo_hr: i }));
    setEtapas(filas);
    setBase(String(d.servicio_horas_base ?? 0));
    setPlanBase(String(d.planeador_horas_base ?? 0));
    setPlanRef(String(d.planeador_taco_ref ?? 0));
  }, []);

  const reload = useCallback(async () => {
    // No se hace setLoading(true) síncrono aquí: el estado inicial ya es `true`
    // y así la carga dentro del efecto no dispara render en cascada (lint).
    const res = await aircraftTacometrosAction(aircraftId);
    if (res.ok && res.data) aplicarDatos(res.data);
    setLoading(false);
  }, [aircraftId, aplicarDatos]);

  useEffect(() => {
    let active = true;
    aircraftTacometrosAction(aircraftId).then((res) => {
      if (!active) return;
      if (res.ok && res.data) aplicarDatos(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [aircraftId, aplicarDatos]);

  /**
   * Valida el editor SIN descartar nada en silencio: cada fila inválida
   * muestra su error y el guardado se detiene (el bug del input de intervalos
   * que tiraba texto a la basura no vuelve).
   */
  const validar = (): { etapas: Array<{ intervalo_hr: number; nombre?: string; tareas?: string[] }>; base: number } | null => {
    let valido = true;
    const revisadas = etapas.map((e) => {
      const limpio = e.intervalo.trim();
      const n = Number(limpio);
      let error: string | undefined;
      if (limpio === "") error = "Captura el intervalo en horas";
      else if (!Number.isFinite(n) || n <= 0) error = "Debe ser un número mayor a 0";
      else if (e.nombre.trim().length > 80) error = "Nombre: máximo 80 caracteres";
      else {
        const tareas = e.tareas.split("\n").map((t) => t.trim()).filter(Boolean);
        if (tareas.length > 40) error = "Máximo 40 tareas por etapa";
        else if (tareas.some((t) => t.length > 120)) error = "Cada tarea: máximo 120 caracteres";
      }
      if (error) valido = false;
      return { ...e, error };
    });
    setEtapas(revisadas);

    const baseNum = Number(base.trim() === "" ? "x" : base);
    if (!Number.isFinite(baseNum) || baseNum < 0) {
      setBaseError("Captura un número mayor o igual a 0");
      valido = false;
    } else {
      setBaseError(null);
    }
    if (!valido) return null;
    return {
      etapas: revisadas.map((e) => ({
        intervalo_hr: Number(e.intervalo.trim()),
        nombre: e.nombre.trim() || undefined,
        tareas: e.tareas.split("\n").map((t) => t.trim()).filter(Boolean),
      })),
      base: baseNum,
    };
  };

  const guardar = (confirmado = false) => {
    const v = validar();
    if (!v) return;
    // Guardar con 0 etapas cuando el avión SÍ tenía programa = borrarlo:
    // confirmación explícita (regla permanente: toda acción destructiva avisa).
    const teniaPrograma =
      (data?.servicio_etapas?.length ?? 0) > 0 ||
      (data?.servicio_intervalos?.length ?? 0) > 0;
    if (v.etapas.length === 0 && teniaPrograma && !confirmado) {
      setConfirmVaciar(true);
      return;
    }
    startSaving(async () => {
      const res = await updateServicioEtapasAction(aircraftId, {
        servicio_etapas: v.etapas,
        servicio_horas_base: v.base,
      });
      if (res.ok) {
        toast.success(
          v.etapas.length === 0
            ? "Programa de servicio eliminado"
            : "Programa de servicio guardado",
        );
        setConfirmVaciar(false);
        setEditorOpen(false);
        void reload();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  const guardarPlaneador = () => {
    const b = Number(planBase.trim() === "" ? "x" : planBase);
    const r = Number(planRef.trim() === "" ? "x" : planRef);
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(r) || r < 0) {
      setPlanError("Captura números mayores o iguales a 0 en ambos campos");
      return;
    }
    setPlanError(null);
    startSavingPlan(async () => {
      const res = await updatePlaneadorBaseAction(aircraftId, {
        planeador_horas_base: b,
        planeador_taco_ref: r,
      });
      if (res.ok) {
        toast.success("Base del planeador guardada");
        setPlanOpen(false);
        void reload();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  const prox = data?.proximo_servicio;
  const vencido = prox != null && prox.faltan <= 0;
  const etapasLectura = data?.servicio_etapas ?? [];
  const tienePrograma =
    etapasLectura.length > 0 || (data?.servicio_intervalos?.length ?? 0) > 0;
  const mostrarPlaneador = (data?.planeador_horas_base ?? 0) > 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClockIcon className="h-4 w-4 text-muted-foreground" /> Tacómetros y servicio por horas
          </CardTitle>
          <CardDescription>
            Conteo de horas del avión (último Hobbs) y cada cuándo le toca servicio.
          </CardDescription>
        </div>
        {/* Bitácoras imprimibles (planeador, motor, hélice) para los libros físicos. */}
        <BitacoraPdfButton aircraftId={aircraftId} matricula={matricula} />
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Estatus */}
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
            mostrarPlaneador ? "lg:grid-cols-4" : ""
          }`}
        >
          <Metric label="Horas actuales" value={data ? `${data.horas_actuales} h` : "—"} />
          {mostrarPlaneador && (
            <Metric
              label="Tiempo total del planeador"
              value={
                data?.tiempo_total_planeador != null
                  ? `${fmtDecimal(data.tiempo_total_planeador, 1)} h`
                  : "—"
              }
              hint="Base histórica + lo volado"
            />
          )}
          <Metric
            label="Próximo servicio"
            value={prox ? `a las ${prox.a_las} h` : "Sin programa"}
            hint={prox?.nombre ?? undefined}
          />
          <Metric
            label="Faltan"
            value={prox ? `${prox.faltan} h` : "—"}
            tone={prox ? (vencido ? "danger" : prox.faltan <= 10 ? "warn" : "ok") : undefined}
            hint={
              prox
                ? `Servicio de ${prox.intervalo} h${prox.nombre ? ` — ${prox.nombre}` : ""}`
                : undefined
            }
          />
        </div>
        {prox && (prox.tareas?.length ?? 0) > 0 && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Incluye: {prox.tareas!.join(", ")}
          </p>
        )}

        {/* Programa de servicio por ETAPAS (editor colapsado tras "Editar programa") */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <WrenchScrewdriverIcon className="h-4 w-4" /> Programa de servicio
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setEditorOpen((v) => !v)}
              aria-expanded={editorOpen}
            >
              Editar programa
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform ${editorOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </div>

          {!editorOpen ? (
            // Modo lectura: secuencia con nombre y tareas por etapa.
            loading ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : !tienePrograma ? (
              <p className="text-xs text-muted-foreground">
                Sin programa de servicio: el avión NO se vigila por horas.
                Captúralo con «Editar programa».
              </p>
            ) : (
              <div className="space-y-1.5">
                {etapasLectura.length > 0 ? (
                  etapasLectura.map((e) =>
                    e.tareas.length > 0 ? (
                      <details key={e.id} className="group text-xs">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-foreground">
                          <ChevronDownIcon className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                          <span className="font-mono font-medium">{e.intervalo_hr} h</span>
                          {e.nombre && <span>· {e.nombre}</span>}
                          <span className="text-muted-foreground">
                            · {e.tareas.length} {e.tareas.length === 1 ? "tarea" : "tareas"}
                          </span>
                        </summary>
                        <ul className="mt-1 ml-6 list-disc space-y-0.5 text-muted-foreground">
                          {e.tareas.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p key={e.id} className="flex items-center gap-1.5 pl-[18px] text-xs">
                        <span className="font-mono font-medium">{e.intervalo_hr} h</span>
                        {e.nombre && <span>· {e.nombre}</span>}
                        <span className="text-muted-foreground">· sin tareas capturadas</span>
                      </p>
                    ),
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Intervalos:{" "}
                    <span className="font-mono">
                      {(data?.servicio_intervalos ?? []).join(", ")}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Base <span className="font-mono">{data?.servicio_horas_base ?? 0} h</span>
                </p>
              </div>
            )
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Cada etapa cuenta por su cuenta desde la base y manda el hito más
                próximo (la chica nunca se salta; en hitos coincidentes las tareas
                se juntan). Ej. Cessna: etapas de{" "}
                <span className="font-mono">50, 100 y 200 h</span> con base 1700 →
                servicios a 1750, 1800, 1850… Seneca/Kodiak: una etapa de{" "}
                <span className="font-mono">100 h</span>.
              </p>

              <div className="space-y-2">
                {etapas.map((e, i) => (
                  <div key={e.key} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-28 shrink-0 space-y-1">
                        <label className={labelCls} htmlFor={`${e.key}-int`}>
                          Intervalo (hrs) <span className="text-destructive">*</span>
                        </label>
                        <input
                          id={`${e.key}-int`}
                          className={`${inputCls} ${e.error ? "border-destructive" : ""}`}
                          type="number"
                          min={0.1}
                          step="0.1"
                          placeholder="100"
                          value={e.intervalo}
                          onChange={(ev) =>
                            setEtapas((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, intervalo: ev.target.value, error: undefined } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className={labelCls} htmlFor={`${e.key}-nom`}>
                          Nombre (opcional)
                        </label>
                        <input
                          id={`${e.key}-nom`}
                          className={inputCls}
                          placeholder="Ej. Servicio mayor"
                          maxLength={80}
                          value={e.nombre}
                          onChange={(ev) =>
                            setEtapas((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)),
                            )
                          }
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="mt-5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        title="Quitar etapa"
                        aria-label="Quitar etapa"
                        onClick={() =>
                          setEtapas((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    {e.error && (
                      <p role="alert" className="text-xs text-destructive">
                        {e.error}
                      </p>
                    )}
                    <div className="space-y-1">
                      <label className={labelCls} htmlFor={`${e.key}-tar`}>
                        Tareas (una por línea)
                      </label>
                      <textarea
                        id={`${e.key}-tar`}
                        className={textareaCls}
                        rows={3}
                        placeholder={"Cambio de aceite y filtro\nRevisión de bujías\nLavado de inyectores"}
                        value={e.tareas}
                        onChange={(ev) =>
                          setEtapas((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, tareas: ev.target.value } : x)),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setEtapas((prev) => [...prev, nuevaFila()])}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Agregar etapa
                </Button>
                <div className="w-40 space-y-1">
                  <label className={labelCls} htmlFor="servicio-base">
                    Horas base (Hobbs)
                  </label>
                  <input
                    id="servicio-base"
                    className={`${inputCls} ${baseError ? "border-destructive" : ""}`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={base}
                    onChange={(e) => {
                      setBase(e.target.value);
                      setBaseError(null);
                    }}
                  />
                  {baseError && (
                    <p role="alert" className="text-xs text-destructive">
                      {baseError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => guardar()} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar programa"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Confirmación: guardar con 0 etapas borra el programa completo. */}
        <Dialog open={confirmVaciar} onOpenChange={setConfirmVaciar}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Eliminar programa de servicio</DialogTitle>
              <DialogDescription>
                Se eliminará el programa de servicio y sus tareas. El avión
                dejará de vigilarse por horas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmVaciar(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => guardar(true)}
                disabled={saving}
              >
                {saving ? "Eliminando…" : "Eliminar programa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tiempo total del planeador (base histórica de bitácoras) */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClockIcon className="h-4 w-4" /> Tiempo total del planeador
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setPlanOpen((v) => !v)}
              aria-expanded={planOpen}
            >
              Editar base
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform ${planOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </div>
          {!planOpen ? (
            <p className="text-xs text-muted-foreground">
              {loading ? (
                "Cargando…"
              ) : mostrarPlaneador ? (
                <>
                  Base{" "}
                  <span className="font-mono">
                    {fmtDecimal(data?.planeador_horas_base, 1)} h
                  </span>{" "}
                  cuando el taco marcaba{" "}
                  <span className="font-mono">{fmtDecimal(data?.planeador_taco_ref, 1)}</span>{" "}
                  · total hoy{" "}
                  <span className="font-mono">
                    {fmtDecimal(data?.tiempo_total_planeador, 1)} h
                  </span>
                </>
              ) : (
                "Sin base histórica capturada: el tiempo total equivale al tacómetro."
              )}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Captura la base real del avión según sus bitácoras: p.ej. el
                planeador llevaba 12,345.0 hrs cuando el tacómetro marcaba
                4,198.9. Las horas siguen derivándose del tacómetro; esto solo
                fija la base histórica.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className={labelCls} htmlFor="plan-base">
                    Horas totales del planeador
                  </label>
                  <input
                    id="plan-base"
                    className={`${inputCls} ${planError ? "border-destructive" : ""}`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={planBase}
                    onChange={(e) => {
                      setPlanBase(e.target.value);
                      setPlanError(null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls} htmlFor="plan-ref">
                    Lectura del tacómetro en ese momento
                  </label>
                  <input
                    id="plan-ref"
                    className={`${inputCls} ${planError ? "border-destructive" : ""}`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={planRef}
                    onChange={(e) => {
                      setPlanRef(e.target.value);
                      setPlanError(null);
                    }}
                  />
                </div>
              </div>
              {planError && (
                <p role="alert" className="text-xs text-destructive">
                  {planError}
                </p>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={guardarPlaneador} disabled={savingPlan}>
                  {savingPlan ? "Guardando…" : "Guardar base"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Histórico */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico de tacómetros
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : !data || data.historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin lecturas registradas.</p>
          ) : (
            (() => {
              /* Paginado con el DataTable compartido (10/20/50/100 + búsqueda),
                 igual que las demás listas: el histórico completo hacía
                 kilométrico el expediente. El "salto" de cadena depende de la
                 fila SIGUIENTE (más antigua), así que se precalcula sobre el
                 arreglo COMPLETO antes de paginar. */
              const filas = data.historial.map((h, i) => {
                const anterior = data.historial[i + 1];
                const salto =
                  h.taco_salida != null &&
                  anterior?.taco_llegada != null &&
                  h.taco_salida !== anterior.taco_llegada;
                return { ...h, salto };
              });
              return (
                <DataTable
                  rows={filas}
                  rowKey={(h) => h.escala_id}
                  defaultPageSize={10}
                  searchText={(h) =>
                    [
                      h.ruta,
                      h.folio != null ? `#${h.folio}` : "",
                      h.fecha ? fmtDateTime(h.fecha) : "",
                    ].join(" ")
                  }
                  searchPlaceholder="Buscar por ruta, folio o fecha…"
                  columns={[
                    {
                      key: "fecha",
                      header: "Fecha",
                      cell: (h) => (h.fecha ? fmtDateTime(h.fecha) : "—"),
                    },
                    {
                      key: "ruta",
                      header: "Ruta",
                      cell: (h) => (
                        <>
                          {h.ruta}
                          {h.folio != null &&
                            (h.vuelo_id ? (
                              <Link
                                href={`/admin/flights/${h.vuelo_id}`}
                                className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
                                title={`Ver detalle del vuelo #${h.folio}`}
                              >
                                #{h.folio}
                              </Link>
                            ) : (
                              <span className="ml-1 text-xs text-muted-foreground">
                                #{h.folio}
                              </span>
                            ))}
                        </>
                      ),
                    },
                    {
                      key: "salida",
                      header: "Salida",
                      headClassName: "text-right",
                      cellClassName: "text-right tabular-nums",
                      cell: (h) => (
                        <span
                          className={
                            h.salto || h.taco_salida_obs
                              ? "inline-block rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400"
                              : undefined
                          }
                          title={
                            [
                              h.salto
                                ? "Salto en la cadena de tacómetros"
                                : null,
                              h.taco_salida_obs
                                ? `Observación: ${h.taco_salida_obs}${
                                    h.taco_obs_por
                                      ? ` — ${h.taco_obs_por}${h.taco_obs_fecha ? `, ${h.taco_obs_fecha}` : ""}`
                                      : ""
                                  }`
                                : null,
                            ]
                              .filter(Boolean)
                              .join("\n") || undefined
                          }
                        >
                          <TacoLink h={h}>{h.taco_salida ?? "—"}</TacoLink>
                          {h.taco_salida_obs && (
                            <span className="ml-1">{"\ud83d\udcdd"}</span>
                          )}
                        </span>
                      ),
                    },
                    {
                      key: "llegada",
                      header: "Llegada",
                      headClassName: "text-right",
                      cellClassName: "text-right tabular-nums",
                      cell: (h) => (
                        <span
                          className={
                            h.taco_llegada_obs
                              ? "inline-block rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400"
                              : undefined
                          }
                          title={
                            h.taco_llegada_obs
                              ? `Observación: ${h.taco_llegada_obs}${
                                  h.taco_obs_por
                                    ? ` — ${h.taco_obs_por}${h.taco_obs_fecha ? `, ${h.taco_obs_fecha}` : ""}`
                                    : ""
                                }`
                              : undefined
                          }
                        >
                          <TacoLink h={h}>{h.taco_llegada ?? "—"}</TacoLink>
                          {h.taco_llegada_obs && (
                            <span className="ml-1">{"\ud83d\udcdd"}</span>
                          )}
                        </span>
                      ),
                    },
                    {
                      key: "horas",
                      header: "Horas",
                      headClassName: "text-right",
                      cellClassName: "text-right tabular-nums",
                      cell: (h) => (h.horas != null ? `${h.horas} h` : "—"),
                    },
                    {
                      key: "fotos",
                      header: "Fotos",
                      headClassName: "text-center",
                      cell: (h) => (
                        <div className="flex items-center justify-center gap-1">
                          <TacoFoto url={h.foto_salida_url} label="Salida" />
                          <TacoFoto url={h.foto_llegada_url} label="Llegada" />
                          {!h.foto_salida_url && !h.foto_llegada_url && (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              );
            })()
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * La lectura enlaza a "Tacómetros en vivo" en el DÍA del tramo, anclado al
 * vuelo (pedido de oficina, ago 2026): ahí se ajusta/confirma con la interfaz
 * que ya conocen. Día en CANCÚN — cortar el ISO crudo movería el día para los
 * vuelos de la noche.
 */
function TacoLink({
  h,
  children,
}: {
  h: { fecha: string | null; vuelo_id?: string | null };
  children: React.ReactNode;
}) {
  if (!h.fecha) return <>{children}</>;
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cancun",
  }).format(new Date(h.fecha));
  const ancla = h.vuelo_id ? `#vuelo-${h.vuelo_id}` : "";
  return (
    <Link
      href={`/admin/taco-live?fecha=${dia}${ancla}`}
      className="underline-offset-2 hover:underline hover:text-foreground transition-colors"
      title="Ajustar en Tacómetros en vivo"
    >
      {children}
    </Link>
  );
}

/// Miniatura clickable de la foto del tacómetro (salida/llegada). Abre la imagen
/// en grande en otra pestaña. Si no hay foto, no renderiza nada.
function TacoFoto({ url, label }: { url?: string | null; label: string }) {
  if (!url) return null;
  return <ImagePreview src={url} alt={`Tacómetro ${label}`} />;
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger";
  hint?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-green-600 dark:text-green-400"
          : "";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
