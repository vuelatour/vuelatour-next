"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { cancunInputToIso } from "@/lib/datetime";
import { fmtUsd, fmtMxn } from "@/lib/format";
import {
  CUENTAS_COBRO,
  type CuentaCobro,
} from "@/lib/admin/cobros";
import { registerReembolsoAction } from "@/app/admin/flights/actions";
import { METODO_LABELS } from "@/components/admin/flights/cobros-card";
import type { MetodoPago } from "@/types/quote";

/** Métodos que tocan banco: solo en ellos se pregunta de qué cuenta salió. */
const METODOS_CON_CUENTA: MetodoPago[] = ["TRANSFERENCIA", "HSBC_LINK", "CHEQUE"];

const METODOS: MetodoPago[] = [
  "TRANSFERENCIA",
  "HSBC_LINK",
  "CHEQUE",
  "BILLPOCKET",
  "EFECTIVO",
  "DOLARES",
  "OTRO",
];

/** Hoy en hora Cancún (UTC−5 fija) para el default del formulario. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface FormState {
  monto: string;
  moneda: "USD" | "MXN";
  tc_usd_mxn: string;
  metodo_cobro: MetodoPago;
  cuenta_destino: string;
  fecha: string;
  motivo: string;
}

function vacio(): FormState {
  return {
    monto: "",
    moneda: "USD",
    tc_usd_mxn: "",
    metodo_cobro: "TRANSFERENCIA",
    cuenta_destino: "",
    fecha: hoyCancun(),
    motivo: "",
  };
}

/**
 * Botón + diálogo "Registrar reembolso" (solo oficina): devuelve dinero al
 * cliente como cobro NEGATIVO del vuelo — RESTA del cobrado y no lleva
 * comisión bancaria. Motivo obligatorio y confirmación explícita antes de
 * guardar (regla de la casa para acciones que quitan dinero).
 */
export function ReembolsoButton({
  flightId,
  flightFolio,
}: {
  flightId: string;
  /** Folio del vuelo para el encabezado (null = no se muestra). */
  flightFolio?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [form, setForm] = useState<FormState>(vacio());
  const [pending, startTransition] = useTransition();

  /** Abrir SIEMPRE con el formulario en limpio (sin setState en efectos). */
  const abrir = () => {
    setForm(vacio());
    setOpen(true);
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const monto = Number(form.monto);
  const tc = Number(form.tc_usd_mxn);
  const fmtMonto = (v: number) => (form.moneda === "USD" ? fmtUsd(v) : fmtMxn(v));

  // Cuentas del catálogo: primero las de la moneda del reembolso.
  const cuentaOptions = useMemo(() => {
    const ordenadas = [...CUENTAS_COBRO].sort(
      (a, b) => Number(a.moneda !== form.moneda) - Number(b.moneda !== form.moneda),
    );
    return [
      { value: "", label: "Sin especificar" },
      ...ordenadas.map((c) => ({
        value: c.value,
        label: c.value,
        description: c.moneda === "USD" ? "Cuenta en USD" : "Cuenta en MXN",
      })),
    ];
  }, [form.moneda]);

  /** Validación previa al diálogo de confirmación. */
  const validar = (): string | null => {
    if (!(monto > 0)) return "Captura el monto del reembolso (mayor a 0).";
    if (form.moneda === "MXN" && !(tc > 0))
      return "Captura el tipo de cambio: sin TC el reembolso en MXN no resta del total USD.";
    if (!form.motivo.trim()) return "El motivo del reembolso es obligatorio.";
    return null;
  };

  const pedirConfirmacion = () => {
    const error = validar();
    if (error) {
      toast.error(error);
      return;
    }
    setConfirmar(true);
  };

  const guardar = () => {
    startTransition(async () => {
      const res = await registerReembolsoAction(flightId, {
        monto,
        moneda: form.moneda,
        tc_usd_mxn: form.moneda === "MXN" && tc > 0 ? tc : undefined,
        metodo_cobro: form.metodo_cobro,
        cuenta_destino: METODOS_CON_CUENTA.includes(form.metodo_cobro)
          ? (form.cuenta_destino as CuentaCobro) || undefined
          : undefined,
        fecha_cobro: form.fecha
          ? cancunInputToIso(`${form.fecha.slice(0, 10)}T12:00`)
          : undefined,
        motivo: form.motivo.trim(),
      });
      setConfirmar(false);
      if (res.ok) {
        toast.success("Reembolso registrado: se restó del cobrado del vuelo.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo registrar el reembolso");
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={abrir}
        className="gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
        title="Devolver dinero al cliente: resta del cobrado del vuelo"
      >
        <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
        Registrar reembolso
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Registrar reembolso
              {flightFolio != null ? ` · vuelo #${flightFolio}` : ""}
            </DialogTitle>
            <DialogDescription>
              Devolución de dinero al cliente. Queda como un cobro en negativo:{" "}
              <span className="font-medium text-foreground">
                RESTA del cobrado del vuelo
              </span>{" "}
              y no lleva comisión bancaria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_120px] gap-3 [&>*]:min-w-0">
              <Field label="Monto devuelto" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.monto}
                  onChange={(e) => set("monto", e.target.value)}
                />
              </Field>
              <Field label="Moneda">
                <SearchableSelect
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "MXN", label: "MXN" },
                  ]}
                  value={form.moneda}
                  onChange={(v) => set("moneda", v as "USD" | "MXN")}
                  placeholder="Moneda"
                />
              </Field>
            </div>

            {form.moneda === "MXN" && (
              <Field
                label="Tipo de cambio USD/MXN"
                required
                hint="Necesario para restar del total en USD del vuelo."
              >
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ej. 18.50"
                  value={form.tc_usd_mxn}
                  onChange={(e) => set("tc_usd_mxn", e.target.value)}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Método de devolución">
                <SearchableSelect
                  options={METODOS.map((m) => ({
                    value: m,
                    label: METODO_LABELS[m] ?? m,
                  }))}
                  value={form.metodo_cobro}
                  onChange={(v) => set("metodo_cobro", v as MetodoPago)}
                  placeholder="Método"
                />
              </Field>
              <Field label="Fecha del reembolso">
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => set("fecha", e.target.value)}
                />
              </Field>
            </div>

            {METODOS_CON_CUENTA.includes(form.metodo_cobro) && (
              <Field
                label="¿De qué cuenta salió?"
                hint="Opcional · primero aparecen las cuentas en la moneda del reembolso"
              >
                <SearchableSelect
                  options={cuentaOptions}
                  value={form.cuenta_destino}
                  onChange={(v) => set("cuenta_destino", v)}
                  placeholder="Sin especificar"
                  searchPlaceholder="Buscar cuenta…"
                />
              </Field>
            )}

            <Field label="Motivo del reembolso" required>
              <Textarea
                rows={2}
                placeholder="Ej. Vuelo reprogramado: se devuelve el anticipo"
                value={form.motivo}
                onChange={(e) => set("motivo", e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={pedirConfirmacion} disabled={pending}>
              {pending ? "Registrando…" : "Registrar reembolso"}
            </Button>
          </DialogFooter>

          {/* Confirmación explícita (regla de la casa: quita dinero). */}
          <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Registrar el reembolso de {monto > 0 ? fmtMonto(monto) : "—"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esto <span className="font-semibold">RESTA</span> del cobrado
                  del vuelo: el saldo se recalcula al instante y el vuelo puede
                  volver a quedar pendiente de cobro. Motivo:{" "}
                  <span className="font-medium">{form.motivo.trim()}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Revisar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    guardar();
                  }}
                  disabled={pending}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {pending ? "Registrando…" : "Sí, restar del cobrado"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
