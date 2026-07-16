"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";
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
import { Label } from "@/components/ui/label";
import { emitirFacturaAction } from "@/app/admin/facturas/actions";

interface EmisoraOption {
  id: string;
  label: string;
}

interface FacturadoAState {
  facturado_a_rfc: string;
  facturado_a_nombre: string;
  facturado_a_regimen: string;
  facturado_a_cp: string;
  facturado_a_uso_cfdi: string;
}

const EMPTY_FACTURADO_A: FacturadoAState = {
  facturado_a_rfc: "",
  facturado_a_nombre: "",
  facturado_a_regimen: "",
  facturado_a_cp: "",
  facturado_a_uso_cfdi: "",
};

/** Paso de confirmación previo al timbrado (acción fiscal irreversible). */
interface ConfirmState {
  payload: Record<string, string | boolean>;
  receptorNombre: string;
  receptorRfc: string;
  /** Cierra/limpia el diálogo de origen tras timbrar con éxito. */
  onDone?: () => void;
}

export function EmitirFacturaButton({
  vueloId,
  emisoras,
  clienteNombre,
  clienteRfc,
  montoTotalMxn,
  montoTotalUsd,
}: {
  vueloId: string;
  emisoras: EmisoraOption[];
  clienteNombre: string;
  clienteRfc: string | null;
  montoTotalMxn: string | null;
  montoTotalUsd: string;
}) {
  const [emisoraId, setEmisoraId] = useState(emisoras[0]?.id ?? "");
  const [openOtro, setOpenOtro] = useState(false);
  const [openPublico, setOpenPublico] = useState(false);
  // c_Periodicidad de la factura global (default mensual del mes en curso).
  const [periodicidad, setPeriodicidad] = useState("04");
  const [facturadoA, setFacturadoA] = useState<FacturadoAState>(EMPTY_FACTURADO_A);
  // Nada se timbra sin pasar por este paso de confirmación.
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [tc, setTc] = useState("");
  const [pending, startTransition] = useTransition();
  const [previewLoading, setPreviewLoading] = useState(false);

  // Vuelo cotizado en USD sin importe MXN: el CFDI se emite en MXN y exige TC.
  const requiereTc = !montoTotalMxn;
  const tcNum = Number(tc);
  const tcValido = Number.isFinite(tcNum) && tcNum > 0;

  const abrirConfirmacion = (c: ConfirmState) => {
    if (!emisoraId) {
      toast.error("Selecciona la entidad emisora");
      return;
    }
    setConfirm(c);
  };

  const cerrarConfirmacion = () => {
    setConfirm(null);
    setTc("");
  };

  const timbrar = () => {
    if (!confirm) return;
    const payload: Record<string, string | boolean | number> = { ...confirm.payload };
    if (requiereTc) {
      if (!tcValido) {
        toast.error("Captura el tipo de cambio (MXN por USD)");
        return;
      }
      payload.tc_usd_mxn = tcNum;
    }
    startTransition(async () => {
      const result = await emitirFacturaAction({
        vuelo_id: vueloId,
        entidad_fiscal_emisora_id: emisoraId,
        ...payload,
      });
      if (result.ok) {
        toast.success("Factura timbrada");
        confirm.onDone?.();
        cerrarConfirmacion();
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "No se pudo emitir la factura");
      }
    });
  };

  /**
   * Vista previa del PDF SIN timbrar: mismo payload que el timbrado, contra
   * /v1/invoices/preview (responde el PDF binario). Es fetch nativo (no
   * apiFetch): aquí SÍ va JSON.stringify + Content-Type explícito, y la
   * respuesta se abre como blob (patrón handlePdf del cotizador).
   */
  const vistaPrevia = async () => {
    if (!confirm) return;
    const payload: Record<string, string | boolean | number> = {
      vuelo_id: vueloId,
      entidad_fiscal_emisora_id: emisoraId,
      ...confirm.payload,
    };
    if (requiereTc) {
      if (!tcValido) {
        toast.error("Captura el tipo de cambio (MXN por USD)");
        return;
      }
      payload.tc_usd_mxn = tcNum;
    }
    setPreviewLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${env.API_URL}/v1/invoices/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // El error de Nest suele venir como JSON con .message (string o array).
        let msg = "No se pudo generar la vista previa";
        try {
          const err = (await res.json()) as { message?: string | string[] };
          const m = Array.isArray(err?.message) ? err.message.join(", ") : err?.message;
          if (m) msg = m;
        } catch {
          // cuerpo no-JSON: se queda el mensaje genérico
        }
        toast.error(msg);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar la vista previa");
    } finally {
      setPreviewLoading(false);
    }
  };

  const setField = (k: keyof FacturadoAState) => (v: string) =>
    setFacturadoA((s) => ({ ...s, [k]: v }));

  const emisoraLabel = emisoras.find((e) => e.id === emisoraId)?.label ?? "—";
  const totalLabel = montoTotalMxn
    ? `$${Number(montoTotalMxn).toLocaleString("es-MX")} MXN`
    : `$${Number(montoTotalUsd).toLocaleString("en-US")} USD`;

  return (
    <div className="flex items-center gap-2 justify-end">
      <select
        value={emisoraId}
        onChange={(e) => setEmisoraId(e.target.value)}
        disabled={pending}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-40"
      >
        {emisoras.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        onClick={() =>
          abrirConfirmacion({
            payload: {},
            receptorNombre: clienteNombre,
            receptorRfc: clienteRfc ?? "—",
          })
        }
        disabled={pending || emisoras.length === 0}
      >
        {pending ? "Emitiendo…" : "Emitir factura"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpenOtro(true)}
        disabled={pending || emisoras.length === 0}
        title="Facturar a un receptor distinto del cliente del vuelo"
      >
        Otro receptor
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpenPublico(true)}
        disabled={pending || emisoras.length === 0}
        title="El cliente no pide factura: CFDI a PÚBLICO EN GENERAL (XAXX010101000)"
      >
        Público en gral.
      </Button>

      <Dialog open={openPublico} onOpenChange={setOpenPublico}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Factura a PÚBLICO EN GENERAL</DialogTitle>
            <DialogDescription>
              El cliente no pide factura: el CFDI se emite al receptor genérico
              (RFC XAXX010101000, uso S01) con la periodicidad indicada — los
              datos fiscales del cliente no se usan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Periodicidad</Label>
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="01">Diaria</option>
              <option value="02">Semanal</option>
              <option value="03">Quincenal</option>
              <option value="04">Mensual (recomendada)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Mes y año se toman del día de hoy (hora Cancún).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPublico(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                abrirConfirmacion({
                  payload: { publico_en_general: true, periodicidad },
                  receptorNombre: "PÚBLICO EN GENERAL",
                  receptorRfc: "XAXX010101000",
                  onDone: () => setOpenPublico(false),
                })
              }
              disabled={pending}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openOtro} onOpenChange={setOpenOtro}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>SE FACTURÓ A (receptor distinto)</DialogTitle>
            <DialogDescription>
              Emite el CFDI a un receptor distinto del cliente del vuelo. Todos los campos son
              obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">RFC</Label>
                <Input
                  value={facturadoA.facturado_a_rfc}
                  onChange={(e) => setField("facturado_a_rfc")(e.target.value.toUpperCase().trim())}
                  className="font-mono uppercase"
                  maxLength={13}
                  placeholder="XAXX010101000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">CP</Label>
                <Input
                  value={facturadoA.facturado_a_cp}
                  onChange={(e) => setField("facturado_a_cp")(e.target.value.trim())}
                  className="font-mono"
                  maxLength={5}
                  placeholder="77500"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Razón social / Nombre</Label>
              <Input
                value={facturadoA.facturado_a_nombre}
                onChange={(e) => setField("facturado_a_nombre")(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Régimen fiscal SAT</Label>
                <Input
                  value={facturadoA.facturado_a_regimen}
                  onChange={(e) => setField("facturado_a_regimen")(e.target.value)}
                  maxLength={5}
                  placeholder="601"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Uso CFDI</Label>
                <Input
                  value={facturadoA.facturado_a_uso_cfdi}
                  onChange={(e) =>
                    setField("facturado_a_uso_cfdi")(e.target.value.toUpperCase().trim())
                  }
                  className="uppercase"
                  maxLength={5}
                  placeholder="G03"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenOtro(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!facturadoA.facturado_a_rfc.trim()) {
                  toast.error("Captura el RFC del receptor");
                  return;
                }
                abrirConfirmacion({
                  payload: { ...facturadoA },
                  receptorNombre: facturadoA.facturado_a_nombre || "(sin razón social)",
                  receptorRfc: facturadoA.facturado_a_rfc,
                  onDone: () => {
                    setOpenOtro(false);
                    setFacturadoA(EMPTY_FACTURADO_A);
                  },
                });
              }}
              disabled={pending}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación previa al timbrado: acción fiscal irreversible. */}
      <Dialog
        open={confirm !== null}
        onOpenChange={(v) => {
          if (!v && !pending) cerrarConfirmacion();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar timbrado</DialogTitle>
            <DialogDescription>
              Se timbrará un CFDI ante el SAT. Verifica los datos: cancelarlo después
              requiere un trámite ante el SAT.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Receptor</span>
              <span className="text-right font-medium">
                {confirm?.receptorNombre}
                <span className="block font-mono text-xs text-muted-foreground">
                  RFC: {confirm?.receptorRfc}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono">{totalLabel}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Emisora</span>
              <span className="text-right">{emisoraLabel}</span>
            </div>
          </div>

          {requiereTc && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Tipo de cambio (MXN por USD)
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0001"
                value={tc}
                onChange={(e) => setTc(e.target.value)}
                className="font-mono"
                placeholder="17.50"
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                El vuelo está cotizado en USD; el CFDI se emite en MXN.
              </p>
              {tcValido && (
                <p className="text-xs">
                  Total a facturar:{" "}
                  <span className="font-mono font-medium">
                    $
                    {(Number(montoTotalUsd) * tcNum).toLocaleString("es-MX", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    MXN
                  </span>
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrarConfirmacion}
              disabled={pending || previewLoading}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={vistaPrevia}
              disabled={pending || previewLoading || (requiereTc && !tcValido)}
              title="Ver el PDF tal como quedaría, sin timbrar ante el SAT"
            >
              {previewLoading ? "Generando…" : "Vista previa PDF"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={timbrar}
              disabled={pending || previewLoading || (requiereTc && !tcValido)}
            >
              {pending ? "Timbrando…" : "Timbrar factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
