"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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

export function EmitirFacturaButton({
  vueloId,
  emisoras,
}: {
  vueloId: string;
  emisoras: EmisoraOption[];
}) {
  const [emisoraId, setEmisoraId] = useState(emisoras[0]?.id ?? "");
  const [openOtro, setOpenOtro] = useState(false);
  const [openPublico, setOpenPublico] = useState(false);
  // c_Periodicidad de la factura global (default mensual del mes en curso).
  const [periodicidad, setPeriodicidad] = useState("04");
  const [facturadoA, setFacturadoA] = useState<FacturadoAState>(EMPTY_FACTURADO_A);
  const [pending, startTransition] = useTransition();

  const emitir = (payload: Record<string, string | boolean>, onDone?: () => void) => {
    if (!emisoraId) {
      toast.error("Selecciona la entidad emisora");
      return;
    }
    startTransition(async () => {
      const result = await emitirFacturaAction({
        vuelo_id: vueloId,
        entidad_fiscal_emisora_id: emisoraId,
        ...payload,
      });
      if (result.ok) {
        toast.success("Factura timbrada");
        onDone?.();
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "No se pudo emitir la factura");
      }
    });
  };

  const setField = (k: keyof FacturadoAState) => (v: string) =>
    setFacturadoA((s) => ({ ...s, [k]: v }));

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
        onClick={() => emitir({})}
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
                emitir(
                  { publico_en_general: true, periodicidad },
                  () => setOpenPublico(false),
                )
              }
              disabled={pending}
            >
              {pending ? "Emitiendo…" : "Emitir a público en general"}
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
                  onChange={(e) => setField("facturado_a_rfc")(e.target.value)}
                  className="font-mono uppercase"
                  maxLength={13}
                  placeholder="XAXX010101000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">CP</Label>
                <Input
                  value={facturadoA.facturado_a_cp}
                  onChange={(e) => setField("facturado_a_cp")(e.target.value)}
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
                  onChange={(e) => setField("facturado_a_uso_cfdi")(e.target.value)}
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
              onClick={() =>
                emitir({ ...facturadoA }, () => {
                  setOpenOtro(false);
                  setFacturadoA(EMPTY_FACTURADO_A);
                })
              }
              disabled={pending}
            >
              {pending ? "Emitiendo…" : "Emitir a este receptor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
