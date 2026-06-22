"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ClockIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";
import {
  aircraftTacometrosAction,
  updateServicioProgramaAction,
} from "@/app/admin/aircraft/actions";
import type { TacometroHistorial } from "@/types/aircraft";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AircraftTacometrosCard({
  aircraftId,
  intervalos,
  horasBase,
}: {
  aircraftId: string;
  intervalos: number[];
  horasBase: number;
}) {
  const [data, setData] = useState<TacometroHistorial | null>(null);
  const [loading, setLoading] = useState(true);
  const [intervalosStr, setIntervalosStr] = useState(intervalos.join(", "));
  const [base, setBase] = useState(String(horasBase ?? 0));
  const [saving, startSaving] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await aircraftTacometrosAction(aircraftId);
    if (res.ok && res.data) {
      setData(res.data);
      setIntervalosStr(res.data.servicio_intervalos.join(", "));
      setBase(String(res.data.servicio_horas_base ?? 0));
    }
    setLoading(false);
  }, [aircraftId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
        void reload();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  const prox = data?.proximo_servicio;
  const vencido = prox != null && prox.faltan <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockIcon className="h-5 w-5" /> Tacómetros y servicio por horas
        </CardTitle>
        <CardDescription>
          Conteo de horas del avión (último Hobbs) y cada cuándo le toca servicio.
        </CardDescription>
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

        {/* Editor del programa */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <WrenchScrewdriverIcon className="h-4 w-4" /> Programa de servicio
          </div>
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
                  </tr>
                </thead>
                <tbody>
                  {data.historial.map((h) => (
                    <tr key={h.escala_id} className="border-t border-border">
                      <td className="px-3 py-2">{h.fecha ? fmtDateTime(h.fecha) : "—"}</td>
                      <td className="px-3 py-2">
                        {h.ruta}
                        {h.folio != null && (
                          <span className="ml-1 text-xs text-muted-foreground">#{h.folio}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {h.taco_salida ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {h.taco_llegada ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {h.horas != null ? `${h.horas} h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
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
