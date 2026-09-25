"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExclamationTriangleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/form-field";
import { cobroDeVueloDesdeAbonoAction, vuelosCandidatosAction } from "@/app/admin/ingresos/actions";
import {
  descripcionVueloCandidato,
  etiquetaVueloCandidato,
  numeroCapturado,
  textoConfirmarCobroDesdeAbono,
  type VueloCandidatoIngreso,
} from "@/lib/admin/ingresos-ui";
import { fmtMonto, fmtTc } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { AbonoPendiente } from "@/types/ingresos";

/**
 * «Es el pago de un vuelo (registrar su cobro)» (24-sep-2026): el cliente
 * pagó un vuelo que todavía NO tiene su cobro registrado. Una sola operación
 * del API: registra el cobro en el vuelo (con la fecha del abono) y lo
 * concilia con esta línea del banco; si la liga falla, el API borra el cobro.
 *
 * Existe para que el pago de un cliente jamás termine como «otro ingreso»
 * por falta de camino (caso real: LETICIA LEON 95,000).
 */
export function CobroDesdeAbonoDialog({
  abono,
  open,
  onOpenChange,
}: {
  abono: AbonoPendiente;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Es el pago de un vuelo</DialogTitle>
          <DialogDescription>
            {`Abono del ${fmtDateOnly(abono.fecha)} por ${fmtMonto(abono.monto, abono.cuenta_moneda ?? undefined)}${
              abono.descripcion ? `: «${abono.descripcion}»` : ""
            }. Elige el vuelo: se registra su cobro y queda conciliado con esta línea del banco.`}
          </DialogDescription>
        </DialogHeader>
        {open && <FormularioCobro abono={abono} onCerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FormularioCobro({ abono, onCerrar }: { abono: AbonoPendiente; onCerrar: () => void }) {
  const router = useRouter();
  const moneda = abono.cuenta_moneda ?? "MXN";
  const clienteId = abono.cliente_sugerido?.id ?? null;
  const [vuelos, setVuelos] = useState<VueloCandidatoIngreso[] | null>(clienteId ? null : []);
  // Falla al LEER los vuelos del cliente sugerido: se dice, nunca «no tiene vuelos».
  const [errorVuelos, setErrorVuelos] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vuelo, setVuelo] = useState<VueloCandidatoIngreso | null>(null);
  const bruto = abono.monto_bruto != null && abono.monto_bruto > 0 ? abono.monto_bruto : null;
  const [monto, setMonto] = useState(String(bruto ?? abono.monto));
  const comisionInicial =
    abono.comision_monto != null && abono.comision_monto > 0
      ? abono.comision_monto
      : bruto != null
        ? Math.round((bruto - abono.monto) * 100) / 100
        : null;
  const [comision, setComision] = useState(
    comisionInicial != null && comisionInicial > 0 ? String(comisionInicial) : "",
  );
  const [tc, setTc] = useState("");
  const [notas, setNotas] = useState("");
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    void vuelosCandidatosAction({ cliente_id: clienteId, alcance: "cliente" })
      .then((r) => {
        if (!vivo) return;
        setVuelos(r.ok ? (r.data ?? []) : []);
        setErrorVuelos(
          r.ok ? null : `${r.error ?? "No se pudieron cargar los vuelos del cliente."} Búscalo por folio.`,
        );
      })
      .catch(() => {
        if (!vivo) return;
        setVuelos([]);
        setErrorVuelos("No se pudieron cargar los vuelos del cliente (sin conexión). Búscalo por folio.");
      });
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  const buscar = async () => {
    const texto = q.trim();
    if (texto.length < 2) {
      toast.error("Escribe el folio del vuelo o el nombre del cliente (2 letras o más).");
      return;
    }
    setBuscando(true);
    const r = await vuelosCandidatosAction({ q: texto, alcance: "todos" }).catch(() => null);
    setBuscando(false);
    if (!r?.ok) {
      toast.error(r?.error ?? "No se pudieron buscar los vuelos.");
      return;
    }
    setErrorVuelos(null);
    setVuelos(r.data ?? []);
  };

  const elegir = (v: VueloCandidatoIngreso) => {
    setVuelo(v);
    if (moneda === "MXN" && !tc && v.tc_usd_mxn) setTc(fmtTc(v.tc_usd_mxn));
  };

  const montoN = numeroCapturado(monto);
  const comN = comision.trim() ? numeroCapturado(comision) : null;
  const tcN = tc.trim() ? numeroCapturado(tc) : null;
  const errMonto = montoN == null || montoN <= 0 ? "Captura el monto del cobro." : null;
  const errCom =
    comision.trim() && (comN == null || comN < 0 || (montoN != null && comN >= montoN))
      ? "La comisión debe ser menor que el monto."
      : null;
  // Aviso (no candado): el API exige que neto o bruto cuadren a ≤ $1 del abono.
  const neto = montoN != null ? montoN - (comN ?? 0) : null;
  const noCuadra =
    montoN != null &&
    neto != null &&
    Math.abs(neto - abono.monto) > 1 &&
    Math.abs(montoN - (bruto ?? abono.monto)) > 1;

  const registrar = async () => {
    if (!vuelo || montoN == null) return;
    setGuardando(true);
    setError(null);
    const r = await cobroDeVueloDesdeAbonoAction(abono.id, {
      vuelo_id: vuelo.vuelo_id,
      monto: montoN,
      ...(comision.trim() ? { comision_banco_monto: comN ?? 0 } : {}),
      ...(moneda === "MXN" && tcN ? { tc_usd_mxn: tcN } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      client_request_id: clientRequestId,
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo" }));
    setGuardando(false);
    if (r.ok) {
      const d = "data" in r ? r.data : undefined;
      toast.success(
        d?.idempotente
          ? "Ese cobro ya estaba registrado y conciliado: no se duplicó."
          : `Cobro registrado en el vuelo #${vuelo.folio ?? "—"} y conciliado con el abono`,
      );
      for (const a of d?.avisos ?? []) toast.warning(a, { duration: 10_000 });
      router.refresh();
      onCerrar();
      return;
    }
    setError(r.error ?? "No se pudo registrar el cobro.");
    toast.error(r.error ?? "No se pudo registrar el cobro.");
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {clienteId ? `Vuelos de ${abono.cliente_sugerido?.nombre}` : "Buscar el vuelo"}
          </p>
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void buscar();
                }
              }}
              placeholder={clienteId ? "¿Otro vuelo? Folio o cliente" : "Folio del vuelo o nombre del cliente"}
            />
            <Button type="button" variant="outline" className="h-9 gap-1" onClick={() => void buscar()} disabled={buscando}>
              <MagnifyingGlassIcon className="h-4 w-4" />
              {buscando ? "Buscando…" : "Buscar"}
            </Button>
          </div>
          {errorVuelos ? (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {errorVuelos}
            </p>
          ) : vuelos === null ? (
            <p className="text-sm text-muted-foreground">Buscando vuelos del cliente…</p>
          ) : vuelos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {clienteId
                ? "El cliente sugerido no tiene vuelos: busca por folio. Si el vuelo aún no existe, esto es un anticipo."
                : "Busca por folio o cliente. Si el vuelo aún no existe, esto es un anticipo."}
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {vuelos.map((v) => (
                <button
                  key={v.vuelo_id}
                  type="button"
                  onClick={() => elegir(v)}
                  className={cn(
                    "block w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    vuelo?.vuelo_id === v.vuelo_id
                      ? "border-brand-600 bg-brand-600/10"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="font-medium">{etiquetaVueloCandidato(v)}</span>
                  <span className="block text-xs text-muted-foreground">{descripcionVueloCandidato(v)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {vuelo && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Monto del cobro (${moneda})`}
                required
                error={errMonto ?? undefined}
                hint="El BRUTO que pagó el cliente."
              >
                <Input
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="font-mono"
                  disabled={guardando}
                />
              </Field>
              <Field
                label="Comisión del banco"
                error={errCom ?? undefined}
                hint="Vacío = la que trae el estado de cuenta (o ninguna)."
              >
                <Input
                  inputMode="decimal"
                  value={comision}
                  onChange={(e) => setComision(e.target.value)}
                  className="font-mono"
                  disabled={guardando}
                />
              </Field>
            </div>
            {moneda === "MXN" && (
              <Field label="Tipo de cambio" hint="Convierte el cobro a USD en el vuelo. Vacío = el del vuelo.">
                <Input
                  inputMode="decimal"
                  value={tc}
                  onChange={(e) => setTc(e.target.value)}
                  className="font-mono"
                  disabled={guardando}
                />
              </Field>
            )}
            {noCuadra && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                El neto (monto − comisión) no cuadra con el abono ({fmtMonto(abono.monto, moneda)}): el
                sistema no lo va a conciliar. Revisa el monto o la comisión.
              </p>
            )}
            <Field label="Notas (opcional)">
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={300} />
            </Field>
          </>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={() => setConfirmar(true)} disabled={!vuelo || !!errMonto || !!errCom || guardando}>
          {guardando ? "Registrando…" : "Registrar cobro y conciliar"}
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Registrar el cobro?</AlertDialogTitle>
            <AlertDialogDescription>
              {vuelo && montoN != null
                ? textoConfirmarCobroDesdeAbono({
                    monto: montoN,
                    moneda,
                    folio: vuelo.folio,
                    fecha: abono.fecha,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmar(false);
                void registrar();
              }}
            >
              Registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
