"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BoltIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExtrasEditor } from "@/components/admin/quotes/extras-editor";
import { quickAdjustQuoteAction } from "@/app/admin/quotes/actions";
import {
  extrasAPayload,
  montoExtraActivo,
  normalizarExtrasEditor,
} from "@/lib/admin/extras";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { fmtUsd } from "@/lib/format";
import type { ExtraConcepto } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { VueloConGrupo } from "@/types/grupos";

/**
 * Ajuste rápido desde el detalle de la cotización: agregar/editar conceptos
 * extra y corregir pasajeros (recalcula TUAs) sin rearmar el cotizador. Cada
 * guardado queda versionado en el historial como una revisión.
 *
 * Extras (4-sep): mismo editor que el cotizador (cantidad × unitario, por
 * persona) — el monto derivado lo calcula el motor. Las líneas con origen
 * GRUPO se pintan bloqueadas y viajan intactas (el API las ancla igual).
 */
export function QuoteQuickAdjustCard({ quote }: { quote: PersistedQuote }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [extras, setExtras] = useState<ExtraConcepto[]>(
    normalizarExtrasEditor(quote.extras),
  );
  const [pasajeros, setPasajeros] = useState<number>(quote.pasajeros);
  const grupo = grupoDeVuelo(quote as PersistedQuote & VueloConGrupo);

  const tcCapturado = Number(quote.tc_usd_mxn) > 0;
  const extrasValidos = extrasAPayload(extras, { tcCapturado: true });

  const cambioPax = pasajeros !== quote.pasajeros;
  // Comparar contra la MISMA normalización de lo persistido: si no, un extra
  // MXN marcaría "cambios" siempre (canon vs nativo).
  const cambioExtras =
    JSON.stringify(extrasValidos) !==
    JSON.stringify(
      extrasAPayload(normalizarExtrasEditor(quote.extras), { tcCapturado: true }),
    );
  const hayCambios = cambioPax || cambioExtras;
  // Extra MXN sin TC en la cotización: el motor lo rechazaría con 400 — se
  // bloquea guardar (el aviso ámbar del renglón explica cómo destrabarlo).
  const extraMxnSinTc =
    !tcCapturado &&
    extras.some((e) => e.moneda === "MXN" && montoExtraActivo(e) > 0);

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
    <Card className="border-t-2 border-t-brand-600/60">
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
              {grupo
                ? " En un avión de grupo, los pasajeros del grupo se cambian desde el grupo."
                : ""}
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

        {/* Extras (editor compartido con el cotizador) */}
        <ExtrasEditor
          value={extras}
          onChange={setExtras}
          tcCapturado={tcCapturado}
          sinTcTexto="La cotización no tiene tipo de cambio: captúralo con «Revisar» antes de guardar montos en MXN."
          pasajeros={pasajeros}
          grupo={grupo}
        />

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
