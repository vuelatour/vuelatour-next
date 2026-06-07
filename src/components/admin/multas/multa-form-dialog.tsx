"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createMultaAction,
  updateMultaAction,
  type MultaInput,
} from "@/app/admin/multas/actions";
import type { Multa } from "@/types/multas";

export function MultaFormDialog({
  open,
  onOpenChange,
  multa,
  aircraft,
  pilots,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  multa?: Multa;
  aircraft: { id: string; matricula: string }[];
  pilots: { id: string; nombre: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [aeronaveId, setAeronaveId] = useState(multa?.aeronave_id ?? "");
  const [pilotoId, setPilotoId] = useState(multa?.piloto_id ?? "");
  const [fecha, setFecha] = useState(multa?.fecha ?? new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState(multa?.monto ?? "");
  const [moneda, setMoneda] = useState(multa?.moneda ?? "MXN");
  const [autoridad, setAutoridad] = useState(multa?.autoridad ?? "");
  const [descripcion, setDescripcion] = useState(multa?.descripcion ?? "");
  const [estado, setEstado] = useState<MultaInput["estado"]>(multa?.estado ?? "PENDIENTE");
  const [referencia, setReferencia] = useState(multa?.referencia ?? "");
  const [notas, setNotas] = useState(multa?.notas ?? "");

  const submit = () => {
    if (!descripcion.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    const body: MultaInput = {
      fecha,
      descripcion: descripcion.trim(),
      estado,
      aeronave_id: aeronaveId || undefined,
      piloto_id: pilotoId || undefined,
      monto: monto ? Number(monto) : undefined,
      moneda,
      autoridad: autoridad || undefined,
      referencia: referencia || undefined,
      notas: notas || undefined,
    };
    startTransition(async () => {
      const res = multa
        ? await updateMultaAction(multa.id, body)
        : await createMultaAction(body);
      if (res.ok) {
        toast.success(multa ? "Multa actualizada" : "Multa registrada");
        onOpenChange(false);
      } else toast.error(res.error ?? "Error");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{multa ? "Editar multa" : "Registrar multa"}</DialogTitle>
          <DialogDescription>Registro histórico de multas (avión y/o piloto).</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Avión</Label>
            <SearchableSelect
              options={[
                { value: "", label: "Sin avión" },
                ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
              ]}
              value={aeronaveId}
              onChange={setAeronaveId}
              placeholder="Selecciona"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Piloto</Label>
            <SearchableSelect
              options={[
                { value: "", label: "Sin piloto" },
                ...pilots.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
              value={pilotoId}
              onChange={setPilotoId}
              placeholder="Selecciona"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Estado</Label>
            <SearchableSelect
              options={[
                { value: "PENDIENTE", label: "Pendiente" },
                { value: "PAGADA", label: "Pagada" },
                { value: "CANCELADA", label: "Cancelada" },
              ]}
              value={estado ?? "PENDIENTE"}
              onChange={(v) => setEstado(v as MultaInput["estado"])}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Monto</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Moneda</Label>
            <SearchableSelect
              options={[
                { value: "MXN", label: "MXN" },
                { value: "USD", label: "USD" },
              ]}
              value={moneda}
              onChange={setMoneda}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">Autoridad</Label>
            <Input
              value={autoridad}
              onChange={(e) => setAutoridad(e.target.value)}
              placeholder="AFAC, municipio…"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">Descripción *</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">Referencia</Label>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm font-medium">Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : multa ? "Guardar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
