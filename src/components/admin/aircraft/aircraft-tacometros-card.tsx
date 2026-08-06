"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDownIcon, ClockIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";
import {
  aircraftTacometrosAction,
  updateServicioProgramaAction,
} from "@/app/admin/aircraft/actions";
import type { TacometroHistorial } from "@/types/aircraft";
import { ImagePreview } from "@/components/admin/image-preview";
import { BitacoraPdfButton } from "./bitacora-pdf-button";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AircraftTacometrosCard({
  aircraftId,
  matricula,
  numMotores,
  intervalos,
  horasBase,
}: {
  aircraftId: string;
  matricula: string;
  numMotores: number;
  intervalos: number[];
  horasBase: number;
}) {
  const [data, setData] = useState<TacometroHistorial | null>(null);
  const [loading, setLoading] = useState(true);
  const [intervalosStr, setIntervalosStr] = useState(intervalos.join(", "));
  const [base, setBase] = useState(String(horasBase ?? 0));
  const [saving, startSaving] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);

  const reload = useCallback(async () => {
    // No se hace setLoading(true) síncrono aquí: el estado inicial ya es `true`
    // y así la carga dentro del efecto no dispara render en cascada (lint).
    const res = await aircraftTacometrosAction(aircraftId);
    if (res.ok && res.data) {
      setData(res.data);
      setIntervalosStr(res.data.servicio_intervalos.join(", "));
      setBase(String(res.data.servicio_horas_base ?? 0));
    }
    setLoading(false);
  }, [aircraftId]);

  useEffect(() => {
    let active = true;
    aircraftTacometrosAction(aircraftId).then((res) => {
      if (!active) return;
      if (res.ok && res.data) {
        setData(res.data);
        setIntervalosStr(res.data.servicio_intervalos.join(", "));
        setBase(String(res.data.servicio_horas_base ?? 0));
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [aircraftId]);

  const guardar = () => {
    const parsed = intervalosStr
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    startSaving(async () => {
      const res = await updateServicioProgramaAction(aircraftId, {
        servicio_intervalos: parsed,
        servicio_horas_base: Number(base) || 0,
      });
      if (res.ok) {
        toast.success("Programa de servicio guardado");
        setEditorOpen(false);
        void reload();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  const prox = data?.proximo_servicio;
  const vencido = prox != null && prox.faltan <= 0;

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
        {/* Tira imprimible para la bitácora física (formato del equipo). */}
        <BitacoraPdfButton
          aircraftId={aircraftId}
          matricula={matricula}
          numMotores={numMotores}
        />
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Estatus */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Horas actuales" value={data ? `${data.horas_actuales} h` : "—"} />
          <Metric
            label="Próximo servicio"
            value={prox ? `a las ${prox.a_las} h` : "Sin programa"}
          />
          <Metric
            label="Faltan"
            value={prox ? `${prox.faltan} h` : "—"}
            tone={prox ? (vencido ? "danger" : prox.faltan <= 10 ? "warn" : "ok") : undefined}
            hint={prox ? `Servicio de ${prox.intervalo} h` : undefined}
          />
        </div>

        {/* Programa de servicio (editor colapsado tras "Editar programa") */}
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
            <p className="text-xs text-muted-foreground">
              Intervalos:{" "}
              <span className="font-mono">{intervalosStr || "sin programa"}</span> · base{" "}
              <span className="font-mono">{base || 0} h</span>
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Secuencia de intervalos en horas que se repite. Ej. Cessna:{" "}
                <span className="font-mono">50, 100, 200</span> (servicios a +50, +150,
                +350 y vuelve a empezar). Seneca/Kodiak: <span className="font-mono">100</span>.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Intervalos (separados por coma)
                  </label>
                  <input
                    className={inputCls}
                    value={intervalosStr}
                    onChange={(e) => setIntervalosStr(e.target.value)}
                    placeholder="50, 100, 200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Horas base (Hobbs)
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={guardar} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar programa"}
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Ruta</th>
                    <th className="px-3 py-2 text-right">Salida</th>
                    <th className="px-3 py-2 text-right">Llegada</th>
                    <th className="px-3 py-2 text-right">Horas</th>
                    <th className="px-3 py-2 text-center">Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.historial.map((h, i) => {
                    // El histórico viene del más reciente al más antiguo: el tramo
                    // anterior en el tiempo es la fila SIGUIENTE. Si la salida no
                    // coincide con la llegada anterior, hay un salto en la cadena.
                    const anterior = data.historial[i + 1];
                    const salto =
                      h.taco_salida != null &&
                      anterior?.taco_llegada != null &&
                      h.taco_salida !== anterior.taco_llegada;
                    return (
                    <tr key={h.escala_id} className="border-t border-border">
                      <td className="px-3 py-2">{h.fecha ? fmtDateTime(h.fecha) : "—"}</td>
                      <td className="px-3 py-2">
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
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          salto
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium"
                            : ""
                        }`}
                        title={salto ? "Salto en la cadena de tacómetros" : undefined}
                      >
                        <TacoLink h={h}>{h.taco_salida ?? "—"}</TacoLink>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <TacoLink h={h}>{h.taco_llegada ?? "—"}</TacoLink>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {h.horas != null ? `${h.horas} h` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <TacoFoto url={h.foto_salida_url} label="Salida" />
                          <TacoFoto url={h.foto_llegada_url} label="Llegada" />
                          {!h.foto_salida_url && !h.foto_llegada_url && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
