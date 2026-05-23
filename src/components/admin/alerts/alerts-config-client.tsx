"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateAlertConfig, runAlerts } from "@/lib/api/alerts";
import { cn } from "@/lib/utils";
import type { AlertConfig } from "@/types/alerts";

const ROLES = ["ADMIN", "COORDINADOR", "FACTURACION", "ANALISTA", "SOCIO", "PILOTO"];

export function AlertsConfigClient({ initial }: { initial: AlertConfig[] }) {
  const [configs, setConfigs] = useState<AlertConfig[]>(initial);
  const [running, setRunning] = useState(false);

  const patch = (clave: string, p: Partial<AlertConfig>) =>
    setConfigs((prev) => prev.map((c) => (c.clave === clave ? { ...c, ...p } : c)));

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await runAlerts();
      toast.success(
        res.ejecutadas.length > 0
          ? `Alertas ejecutadas: ${res.ejecutadas.join(", ")}`
          : "Sin alertas activas para ejecutar",
      );
    } catch {
      toast.error("No se pudieron ejecutar las alertas");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estas alertas se evalúan automáticamente (cada hora las urgentes, una vez al día el resto).
          Aparecen en la campana de notificaciones y, según el canal, también por correo.
        </p>
        <Button variant="outline" size="sm" onClick={handleRun} disabled={running} className="shrink-0">
          {running ? "Ejecutando…" : "Ejecutar ahora"}
        </Button>
      </div>

      {configs.map((c) => (
        <AlertCard key={c.clave} config={c} onChange={(p) => patch(c.clave, p)} />
      ))}
    </div>
  );
}

function AlertCard({
  config,
  onChange,
}: {
  config: AlertConfig;
  onChange: (p: Partial<AlertConfig>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const esPermiso = config.clave === "permiso_pista";
  const conEmail = config.canal === "email" || config.canal === "ambos";

  const toggleRole = (rol: string) => {
    const next = config.roles.includes(rol)
      ? config.roles.filter((r) => r !== rol)
      : [...config.roles, rol];
    onChange({ roles: next });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateAlertConfig(config.clave, {
        activa: config.activa,
        canal: config.canal,
        roles: config.roles,
        dias_anticipacion: config.dias_anticipacion,
        horas_anticipacion: config.horas_anticipacion,
      });
      toast.success("Alerta actualizada");
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={config.activa ? "" : "opacity-70"}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-sm font-medium">{config.descripcion}</CardTitle>
        <Switch
          checked={config.activa}
          onCheckedChange={(v) => onChange({ activa: v })}
          aria-label="Activar alerta"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">CANAL</p>
          <div className="flex gap-2">
            <Seg active={!conEmail} onClick={() => onChange({ canal: "socket" })}>
              Solo app
            </Seg>
            <Seg active={conEmail} onClick={() => onChange({ canal: "ambos" })}>
              App + email
            </Seg>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">ROLES QUE RECIBEN</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((rol) => (
              <Seg key={rol} active={config.roles.includes(rol)} onClick={() => toggleRole(rol)}>
                {rol}
              </Seg>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">
            {esPermiso ? "HORAS DE ANTICIPACIÓN" : "DÍAS DE ANTICIPACIÓN"}
          </p>
          {esPermiso ? (
            <input
              type="number"
              min={1}
              value={config.horas_anticipacion ?? ""}
              onChange={(e) =>
                onChange({ horas_anticipacion: e.target.value ? Number(e.target.value) : null })
              }
              className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <input
              type="text"
              inputMode="numeric"
              value={config.dias_anticipacion.join(", ")}
              onChange={(e) =>
                onChange({
                  dias_anticipacion: e.target.value
                    .split(",")
                    .map((s) => Number(s.trim()))
                    .filter((n) => Number.isFinite(n) && n >= 0),
                })
              }
              placeholder="30, 15, 7"
              className="h-9 w-40 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-brand-600 bg-brand-600/10 text-brand-600 dark:text-brand-400"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
