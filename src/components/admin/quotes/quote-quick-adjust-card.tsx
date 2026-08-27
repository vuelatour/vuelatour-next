"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, BoltIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { quickAdjustQuoteAction } from "@/app/admin/quotes/actions";
import { fmtUsd } from "@/lib/format";
import type { ExtraConcepto } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";

const EXTRAS_SUGERIDOS = ["Handler", "Comisariato", "Extensión de servicios"];

/**
 * El editor trabaja con el monto NATIVO del renglón (monto_usd es nombre
 * legado): un extra MXN persistido trae el canon USD convertido en monto_usd
 * y los pesos reales en monto_nativo — editar/re-enviar el canon como nativo
 * re-interpretaría dólares como pesos y movería el total MXN.
 */
function normalizeExtras(list: ExtraConcepto[] | undefined): ExtraConcepto[] {
  return (list ?? []).map((e) => ({
    concepto: e.concepto,
    monto_usd: Number(e.monto_nativo ?? e.monto_usd) || 0,
    moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
    aplica_iva: e.aplica_iva ?? true,
  }));
}

function toPayloadExtras(list: ExtraConcepto[]) {
  return list
    .filter((e) => e.concepto.trim() && Number(e.monto_usd) > 0)
    .map((e) => ({
      concepto: e.concepto.trim(),
      monto_usd: Number(e.monto_usd),
      moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
      aplica_iva: e.aplica_iva ?? true,
    }));
}

/**
 * Ajuste rápido desde el detalle de la cotización: agregar/editar conceptos
 * extra y corregir pasajeros (recalcula TUAs) sin rearmar el cotizador. Cada
 * guardado queda versionado en el historial como una revisión.
 */
export function QuoteQuickAdjustCard({ quote }: { quote: PersistedQuote }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [extras, setExtras] = useState<ExtraConcepto[]>(
    normalizeExtras(quote.extras),
  );
  const [pasajeros, setPasajeros] = useState<number>(quote.pasajeros);

  const update = (idx: number, patch: Partial<ExtraConcepto>) => {
    setExtras((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };
  const add = (concepto = "") =>
    setExtras((prev) => [
      ...prev,
      { concepto, monto_usd: 0, moneda: "USD", aplica_iva: true },
    ]);
  const remove = (idx: number) =>
    setExtras((prev) => prev.filter((_, i) => i !== idx));

  const extrasValidos = toPayloadExtras(extras);

  const cambioPax = pasajeros !== quote.pasajeros;
  // Comparar contra la MISMA normalización de lo persistido: si no, un extra
  // MXN marcaría "cambios" siempre (canon vs nativo).
  const cambioExtras =
    JSON.stringify(extrasValidos) !==
    JSON.stringify(toPayloadExtras(normalizeExtras(quote.extras)));
  const hayCambios = cambioPax || cambioExtras;
  // Extra MXN sin TC en la cotización: el motor lo rechazaría con 400 — se
  // bloquea guardar (el aviso ámbar del renglón explica cómo destrabarlo).
  const extraMxnSinTc =
    !(Number(quote.tc_usd_mxn) > 0) &&
    extras.some((e) => e.moneda === "MXN" && Number(e.monto_usd) > 0);

  const handleSave = () => {
    if (!hayCambios) {
      toast.info("No hay cambios que aplicar");
      return;
    }
    startTransition(async () => {
      const res = await quickAdjustQuoteAction(quote.id, {
        ...(cambioExtras ? { extras: extrasValidos } : {}),
        ...(cambioPax ? { pasajeros } : {}),
      });
      if (res.ok && res.data) {
        toast.success(
          `Cotización ajustada (v${res.data.cotizacion_version}) · nuevo total ${fmtUsd(res.data.monto_total_usd)}`,
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo ajustar la cotización");
      }
    });
  };

  return (
    <Card className="zona-clara">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <BoltIcon className="h-4 w-4 text-muted-foreground" />
          Ajuste rápido
        </CardTitle>
        <CardDescription className="text-xs">
          Conceptos extra y pasajeros (recalcula TUAs) sin salir de esta
          pantalla. El total se recalcula y queda versionado en el historial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Pasajeros */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Pasajeros</Label>
            <p className="text-xs text-muted-foreground">
              Ej. cambiar de 1 a 2-3 TUAs a última hora.
            </p>
          </div>
          <Input
            type="number"
            min={1}
            value={pasajeros}
            onChange={(e) => setPasajeros(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 text-right"
          />
        </div>

        {/* Extras */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Conceptos extra</Label>
          {extras.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin extras. Agrega handler, comisariato, extensión de servicios…
            </p>
          )}
          {extras.map((e, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border bg-muted p-2.5 space-y-2"
            >
              <div className="grid grid-cols-[1fr_96px_76px] gap-2">
                <Input
                  placeholder="Concepto (ej. Handler)"
                  value={e.concepto}
                  onChange={(ev) => update(idx, { concepto: ev.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={e.moneda === "MXN" ? "MXN" : "USD"}
                  value={e.monto_usd || ""}
                  onChange={(ev) =>
                    update(idx, { monto_usd: Number(ev.target.value) || 0 })
                  }
                />
                <MonedaSelect
                  value={e.moneda === "MXN" ? "MXN" : "USD"}
                  onChange={(m) => update(idx, { moneda: m })}
                />
              </div>
              {e.moneda === "MXN" && !(Number(quote.tc_usd_mxn) > 0) && (
                <p className="text-xs text-amber-700">
                  La cotización no tiene tipo de cambio: captúralo con
                  «Revisar» antes de guardar montos en MXN.
                </p>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={e.aplica_iva ?? true}
                    onCheckedChange={(c) => update(idx, { aplica_iva: c })}
                  />
                  Entra a la base de IVA
                </label>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="text-xs text-destructive hover:opacity-80 transition-opacity"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => add()}
              className="gap-1.5"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Agregar concepto
            </Button>
            {EXTRAS_SUGERIDOS.filter(
              (sug) =>
                !extras.some(
                  (e) => e.concepto.toLowerCase() === sug.toLowerCase(),
                ),
            ).map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => add(sug)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            onClick={handleSave}
            disabled={pending || !hayCambios || extraMxnSinTc}
          >
            {pending ? "Recalculando…" : "Aplicar y recalcular"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
