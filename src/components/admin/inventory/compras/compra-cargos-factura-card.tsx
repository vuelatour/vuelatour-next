"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateCompraAction } from "@/app/admin/inventory/compras/actions";
import { fmtMontoMoneda, toNum, type CompraDetalle } from "@/types/compras";

interface CargoEdit {
  key: string;
  concepto: string;
  monto: string;
}

/**
 * Cargos que vienen DENTRO de la factura de mercancía (Shipping, Tax,
 * Handling…): no son refacciones, se prorratean al costo igual que los
 * pagos-cargo. Van en la moneda de la compra. Solo se editan mientras la
 * compra está ABIERTA (el API responde 409 en RECIBIDA): después se ven en
 * solo lectura y los cargos nuevos entran como pagos + "Recalcular costos".
 */
export function CompraCargosFacturaCard({ compra }: { compra: CompraDetalle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editable = compra.estado === "ABIERTA";
  const inicial = (): CargoEdit[] =>
    compra.cargos_factura.map((c, i) => ({
      key: `c-${i}`,
      concepto: c.concepto,
      monto: String(toNum(c.monto)),
    }));
  const [cargos, setCargos] = useState<CargoEdit[]>(inicial);

  const dirty =
    cargos.length !== compra.cargos_factura.length ||
    cargos.some(
      (c, i) =>
        c.concepto !== compra.cargos_factura[i]?.concepto ||
        toNum(c.monto) !== toNum(compra.cargos_factura[i]?.monto),
    );

  const set = (key: string, patch: Partial<CargoEdit>) =>
    setCargos((p) => p.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const guardar = () => {
    if (!editable) return;
    const payload: Array<{ concepto: string; monto: number }> = [];
    for (const [i, c] of cargos.entries()) {
      if (!c.concepto.trim()) {
        toast.error(`Cargo ${i + 1}: captura el concepto`);
        return;
      }
      if (!(Number(c.monto) >= 0) || c.monto.trim() === "") {
        toast.error(`Cargo ${i + 1}: captura el monto`);
        return;
      }
      payload.push({ concepto: c.concepto.trim(), monto: Number(c.monto) });
    }
    startTransition(async () => {
      const r = await updateCompraAction(compra.id, { cargos_factura: payload });
      if (r.ok) {
        toast.success("Cargos de la factura guardados");
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudieron guardar los cargos");
      }
    });
  };

  const total = cargos.reduce((s, c) => s + toNum(c.monto), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Cargos en la factura de mercancía</CardTitle>
            <CardDescription>
              Shipping, tax, handling… que vienen en la misma factura ({compra.moneda}). Se reparten al
              costo de cada línea.
            </CardDescription>
          </div>
          {editable && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={pending}
                onClick={() =>
                  setCargos((p) => [
                    ...p,
                    { key: `n-${Date.now()}`, concepto: "", monto: "" },
                  ])
                }
              >
                <PlusIcon className="h-4 w-4" />
                Agregar cargo
              </Button>
              <Button size="sm" onClick={guardar} disabled={pending || !dirty}>
                {pending ? "Guardando…" : "Guardar cargos"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!editable && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Compra recibida: los cargos de factura ya no se editan; liga los pagos que lleguen y
            usa &ldquo;Recalcular costos&rdquo;.
          </p>
        )}
        {cargos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cargos dentro de la factura. Los pagos aparte (UPS, aduana) se ligan abajo como pagos.
          </p>
        ) : (
          cargos.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <Input
                className="h-8 flex-1"
                value={c.concepto}
                placeholder="Concepto (ej. Shipping)"
                readOnly={!editable}
                aria-readonly={!editable}
                onChange={(e) => set(c.key, { concepto: e.target.value })}
              />
              <Input
                className="h-8 w-32 text-right"
                type="number"
                step="any"
                min="0"
                value={c.monto}
                placeholder="0.00"
                readOnly={!editable}
                aria-readonly={!editable}
                onChange={(e) => set(c.key, { monto: e.target.value })}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => setCargos((p) => p.filter((x) => x.key !== c.key))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                  title="Quitar cargo"
                  disabled={pending}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
        {cargos.length > 0 && (
          <p className="text-right text-xs text-muted-foreground">
            Total cargos en factura:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {fmtMontoMoneda(total, compra.moneda)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
