"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
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
import { aplicarAnticipoAction, vuelosCandidatosAction } from "@/app/admin/ingresos/actions";
import { etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import {
  descripcionVueloCandidato,
  etiquetaVueloCandidato,
  montoDefaultAplicacion,
  numeroCapturado,
  otroClienteDeConflicto,
  textoConfirmarAplicacion,
  type VueloCandidatoIngreso,
} from "@/lib/admin/ingresos-ui";
import { fmtMonto, fmtTc } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ingreso } from "@/types/ingresos";

/** Vuelo ya elegido (banner de la card de cobros del vuelo). */
export interface VueloFijoAnticipo {
  vuelo_id: string;
  folio: number | null;
  /** Pendiente de cobro del vuelo en USD (fuente: `pendienteCobro` de la página). */
  saldo_usd: number | null;
  tc_usd_mxn: number | null;
  cliente_nombre?: string | null;
}

interface Props {
  anticipo: Ingreso | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vueloFijo?: VueloFijoAnticipo | null;
  onAplicado?: () => void;
}

/**
 * «Aplicar anticipo ING-12 a un vuelo» (24-sep-2026). El API crea un cobro
 * NORMAL en el vuelo (cuenta por `cobrosEnUsd`: bandera cobrado, calendario
 * «Pagado», reparto) ligado al anticipo, con la fecha del anticipo. El saldo
 * del anticipo lo garantiza un trigger en BD: aquí solo se sugiere el monto.
 */
export function AplicarAnticipoDialog({ anticipo, open, onOpenChange, vueloFijo, onAplicado }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Aplicar anticipo {anticipo ? etiquetaIngreso(anticipo.folio) : ""} a un vuelo
          </DialogTitle>
          <DialogDescription>
            Se registra como cobro del vuelo (con la fecha en que el cliente pagó) y el saldo del
            anticipo baja. Si te equivocas, se desaplica y vuelve al saldo.
          </DialogDescription>
        </DialogHeader>
        {open && anticipo && (
          <FormularioAplicar
            anticipo={anticipo}
            vueloFijo={vueloFijo ?? null}
            onAplicado={onAplicado}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioAplicar({
  anticipo,
  vueloFijo,
  onAplicado,
  onCerrar,
}: {
  anticipo: Ingreso;
  vueloFijo: VueloFijoAnticipo | null;
  onAplicado?: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const moneda = anticipo.moneda;
  const [saldo, setSaldo] = useState(anticipo.anticipo?.saldo ?? 0);
  const [vuelos, setVuelos] = useState<VueloCandidatoIngreso[] | null>(vueloFijo ? [] : null);
  // Falla al LEER los vuelos (≠ «el cliente no tiene vuelos»): jamás se pinta
  // «no tiene vuelos» cuando la consulta falló.
  const [errorVuelos, setErrorVuelos] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [otrosClientes, setOtrosClientes] = useState(false);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const inicial = vueloFijo
    ? {
        vuelo_id: vueloFijo.vuelo_id,
        folio: vueloFijo.folio,
        saldo_usd: vueloFijo.saldo_usd,
        tc_usd_mxn: vueloFijo.tc_usd_mxn,
      }
    : null;
  const [vuelo, setVuelo] = useState<{
    vuelo_id: string;
    folio: number | null;
    saldo_usd: number | null;
    tc_usd_mxn: number | null;
  } | null>(inicial);
  const tcInicial = anticipo.tc_usd_mxn ?? inicial?.tc_usd_mxn ?? null;
  const [tc, setTc] = useState(tcInicial != null ? fmtTc(tcInicial) : "");
  const [monto, setMonto] = useState(() =>
    inicial
      ? String(
          montoDefaultAplicacion({
            saldoAnticipo: anticipo.anticipo?.saldo ?? 0,
            moneda,
            saldoVueloUsd: inicial.saldo_usd,
            tc: tcInicial,
          }),
        )
      : String(anticipo.anticipo?.saldo ?? ""),
  );
  const [notas, setNotas] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [confirmar, setConfirmar] = useState(false);
  const [otroCliente, setOtroCliente] = useState<{ anticipo: string | null; vuelo: string | null } | null>(
    null,
  );
  const [aplicando, setAplicando] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vuelos del cliente del anticipo al abrir (sin vuelo fijo) y al volver de
  // «otros clientes» o al reintentar (`recarga`).
  useEffect(() => {
    if (vueloFijo || otrosClientes) return;
    let vivo = true;
    void vuelosCandidatosAction({ cliente_id: anticipo.cliente_id, alcance: "cliente" })
      .then((r) => {
        if (!vivo) return;
        if (r.ok) {
          setVuelos(r.data ?? []);
          setErrorVuelos(null);
        } else {
          setVuelos([]);
          setErrorVuelos(r.error ?? "No se pudieron cargar los vuelos del cliente.");
        }
      })
      .catch(() => {
        if (!vivo) return;
        setVuelos([]);
        setErrorVuelos("No se pudieron cargar los vuelos del cliente (sin conexión con el servidor).");
      });
    return () => {
      vivo = false;
    };
  }, [anticipo.cliente_id, vueloFijo, otrosClientes, recarga]);

  const buscarOtros = async () => {
    const texto = q.trim();
    if (texto.length < 2) {
      toast.error("Escribe el folio o el cliente del vuelo (2 letras o más).");
      return;
    }
    setBuscando(true);
    // Con el cliente del anticipo el API marca `es_otro_cliente` (ámbar): sin
    // él TODOS los vuelos salían como del mismo cliente.
    const r = await vuelosCandidatosAction({
      cliente_id: anticipo.cliente_id,
      q: texto,
      alcance: "todos",
    }).catch(() => null);
    setBuscando(false);
    if (!r?.ok) {
      toast.error(r?.error ?? "No se pudieron buscar los vuelos.");
      return;
    }
    setErrorVuelos(null);
    setVuelos(r.data ?? []);
  };

  const elegir = (v: VueloCandidatoIngreso) => {
    setVuelo({ vuelo_id: v.vuelo_id, folio: v.folio, saldo_usd: v.saldo_usd, tc_usd_mxn: v.tc_usd_mxn });
    const tcV = anticipo.tc_usd_mxn ?? v.tc_usd_mxn ?? null;
    if (moneda === "MXN") setTc(tcV != null ? fmtTc(tcV) : "");
    setMonto(
      String(montoDefaultAplicacion({ saldoAnticipo: saldo, moneda, saldoVueloUsd: v.saldo_usd, tc: tcV })),
    );
    setError(null);
  };

  const montoN = numeroCapturado(monto);
  const tcN = tc.trim() ? numeroCapturado(tc) : null;
  const errMonto =
    montoN == null || montoN <= 0
      ? "Captura el monto a aplicar."
      : montoN > saldo + 0.005
        ? `No puede pasar del saldo del anticipo (${fmtMonto(saldo, moneda)}).`
        : null;
  const errTc = tc.trim() && (tcN == null || tcN <= 0) ? "Tipo de cambio inválido." : null;

  const aplicar = async (aceptarOtroCliente = false) => {
    if (!vuelo || montoN == null) return;
    setAplicando(true);
    setError(null);
    const r = await aplicarAnticipoAction(anticipo.id, {
      vuelo_id: vuelo.vuelo_id,
      monto: montoN,
      ...(moneda === "MXN" && tcN ? { tc_usd_mxn: tcN } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      client_request_id: clientRequestId,
      ...(aceptarOtroCliente ? { aceptar_otro_cliente: true } : {}),
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo" }));
    setAplicando(false);
    if (r.ok && "data" in r && r.data) {
      const d = r.data;
      toast.success(
        d.idempotente
          ? "Esa aplicación ya estaba registrada: no se duplicó."
          : `Anticipo aplicado: cobro de ${fmtMonto(montoN, moneda)} en el vuelo #${vuelo.folio ?? "—"}`,
      );
      for (const a of d.avisos ?? []) toast.warning(a, { duration: 10_000 });
      setSaldo(d.anticipo.saldo);
      setUltimo(
        `Cobro de ${fmtMonto(montoN, moneda)} registrado en el vuelo #${vuelo.folio ?? "—"}. Saldo del anticipo: ${fmtMonto(
          d.anticipo.saldo,
          moneda,
        )}.`,
      );
      setClientRequestId(crypto.randomUUID());
      setVuelo(null);
      setNotas("");
      onAplicado?.();
      router.refresh();
      return;
    }
    const code = "code" in r ? r.code : undefined;
    if (code === "ANTICIPO_OTRO_CLIENTE") {
      setOtroCliente(otroClienteDeConflicto("details" in r ? r.details : null));
      return;
    }
    setError(r.error ?? "No se pudo aplicar el anticipo.");
    toast.error(r.error ?? "No se pudo aplicar el anticipo.");
  };

  if (ultimo) {
    return (
      <>
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ultimo}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Listo
          </Button>
          {saldo > 0.005 && !vueloFijo && (
            <Button
              onClick={() => {
                setUltimo(null);
                setMonto(String(saldo));
              }}
            >
              Aplicar a otro vuelo
            </Button>
          )}
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <p>
            Saldo por aplicar:{" "}
            <span className="font-mono font-semibold">{fmtMonto(saldo, moneda)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {[anticipo.cliente_nombre, anticipo.descripcion].filter(Boolean).join(" · ")}
          </p>
        </div>

        {vueloFijo ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">Vuelo #{vueloFijo.folio ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {[
                vueloFijo.cliente_nombre,
                vueloFijo.saldo_usd != null ? `pendiente ${fmtMonto(vueloFijo.saldo_usd, "USD")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {otrosClientes ? "Buscar el vuelo" : `Vuelos de ${anticipo.cliente_nombre ?? "este cliente"}`}
              </p>
              <button
                type="button"
                className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline"
                onClick={() => {
                  // Al volver, el efecto relee los vuelos del cliente (con su
                  // manejo de error); al ir a «otros», se espera la búsqueda.
                  setVuelos(otrosClientes ? null : []);
                  setErrorVuelos(null);
                  setOtrosClientes((v) => !v);
                }}
              >
                {otrosClientes ? "Volver a los vuelos del cliente" : "Ver vuelos de otros clientes"}
              </button>
            </div>
            {otrosClientes && (
              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void buscarOtros();
                    }
                  }}
                  placeholder="Folio del vuelo o nombre del cliente"
                />
                <Button type="button" variant="outline" className="h-9 gap-1" onClick={() => void buscarOtros()} disabled={buscando}>
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  {buscando ? "Buscando…" : "Buscar"}
                </Button>
              </div>
            )}
            {errorVuelos ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span className="flex items-start gap-2">
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {errorVuelos}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setErrorVuelos(null);
                    setVuelos(null);
                    setRecarga((n) => n + 1);
                  }}
                >
                  Reintentar
                </Button>
              </div>
            ) : vuelos === null ? (
              <p className="text-sm text-muted-foreground">Buscando vuelos…</p>
            ) : vuelos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {otrosClientes
                  ? "Escribe el folio o el cliente y pulsa Buscar."
                  : "Este cliente no tiene vuelos todavía. Cuando exista la reserva, aplica aquí el anticipo."}
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {vuelos.map((v) => {
                  const sel = vuelo?.vuelo_id === v.vuelo_id;
                  return (
                    <button
                      key={v.vuelo_id}
                      type="button"
                      onClick={() => elegir(v)}
                      className={cn(
                        "block w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        sel ? "border-brand-600 bg-brand-600/10" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="font-medium">{etiquetaVueloCandidato(v)}</span>
                      <span
                        className={cn(
                          "block text-xs",
                          v.es_otro_cliente ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                        )}
                      >
                        {descripcionVueloCandidato(v)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {vuelo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Monto a aplicar (${moneda})`}
              required
              error={errMonto ?? undefined}
              hint="Sugerido: lo que le falta al vuelo, sin pasar del saldo."
            >
              <Input
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="font-mono"
                disabled={aplicando}
              />
            </Field>
            {moneda === "MXN" && (
              <Field
                label="Tipo de cambio"
                error={errTc ?? undefined}
                hint="Convierte el cobro a USD en el vuelo. Vacío = el del vuelo."
              >
                <Input
                  inputMode="decimal"
                  value={tc}
                  onChange={(e) => setTc(e.target.value)}
                  className="font-mono"
                  disabled={aplicando}
                />
              </Field>
            )}
          </div>
        )}
        {vuelo && (
          <Field label="Notas (opcional)">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={300} />
          </Field>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={aplicando}>
          Cancelar
        </Button>
        <Button
          onClick={() => setConfirmar(true)}
          disabled={!vuelo || !!errMonto || !!errTc || aplicando || saldo <= 0.005}
        >
          {aplicando ? "Aplicando…" : "Aplicar"}
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar el anticipo?</AlertDialogTitle>
            <AlertDialogDescription>
              {vuelo && montoN != null
                ? textoConfirmarAplicacion({
                    monto: montoN,
                    moneda,
                    folio: vuelo.folio,
                    fechaAnticipo: anticipo.fecha,
                    saldoRestante: saldo - montoN,
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
                void aplicar(false);
              }}
            >
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={otroCliente !== null} onOpenChange={(o) => !o && setOtroCliente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El vuelo es de otro cliente</AlertDialogTitle>
            <AlertDialogDescription>
              {`El anticipo es de ${otroCliente?.anticipo ?? "un cliente"} y el vuelo de ${
                otroCliente?.vuelo ?? "otro cliente"
              }. ¿Aplicarlo de todos modos?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setOtroCliente(null);
                // MISMO client_request_id: si la primera sí quedó, no se duplica.
                void aplicar(true);
              }}
              className="bg-amber-600 text-white hover:bg-amber-600/90"
            >
              Aplicar de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
