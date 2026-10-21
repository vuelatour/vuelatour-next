"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { CuentaGastoSelector } from "@/components/admin/expenses/cuenta-gasto-selector";
import { ProveedorSelector } from "@/components/admin/expenses/proveedor-selector";
import { listCardsOptionsAction, type CardOption } from "@/app/admin/users/actions";
import { registrarGastoCompraAction } from "@/app/admin/inventory/compras/actions";
import { ETIQUETA_CAMPO_CUENTA, HINT_CUENTA, cuentaParaAlta, medioLlevaCuenta } from "@/lib/admin/cuentas-gasto";
import { MEDIOS_CAPTURA, ayudaMedioPago } from "@/lib/admin/medios-pago";
import { todayCancun } from "@/lib/datetime";
import {
  BOTON_REGISTRAR_GASTO,
  CODIGO_GASTO_YA_REGISTRADO,
  ETIQUETA_FECHA_PAGO_COMPRA,
  ETIQUETA_FOLIO_COMPRA,
  ETIQUETA_TC_COMPRA,
  HINT_FECHA_PAGO_COMPRA,
  HINT_FOLIO_COMPRA,
  descripcionRegistrarGasto,
  hintTcSugerido,
  textoConfirmarRegistrarGasto,
  textoEquivalente,
  tituloRegistrarGasto,
  toastGastoRegistrado,
  validarTcCompra,
} from "@/lib/admin/compras-estado";
import { fmtMontoMoneda, toNum, type CompraDetalle } from "@/types/compras";

const MSG_MEDIO_REQUERIDO = "Elige el medio de pago";

/**
 * «Registrar gasto» de la compra (21-oct-2026, API 0.0.102, invariante 101
 * del API). El MONTO no se captura: es el total de la factura que calculó el
 * API (líneas + cargos impresos). El T.C. es OBLIGATORIO (en pesos y en
 * dólares; banda 15–25, mismos textos que el API) y se sugiere el de la
 * compra o el oficial de hoy. Dinero ⇒ confirmación antes de crear. El
 * formulario se monta SOLO abierto: cada apertura arranca limpio sin efectos.
 */
export function CompraRegistrarGastoDialog({
  open,
  onOpenChange,
  compra,
  providers,
  tcOficialHoy = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compra: CompraDetalle;
  providers: { id: string; nombre: string }[];
  /** T.C. oficial de hoy (sugerencia; null = sin dato). */
  tcOficialHoy?: number | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tituloRegistrarGasto(compra.folio)}</DialogTitle>
          <DialogDescription>{descripcionRegistrarGasto(compra)}</DialogDescription>
        </DialogHeader>
        {open && (
          <RegistrarGastoFormulario
            compra={compra}
            providers={providers}
            tcOficialHoy={tcOficialHoy}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function tcInicialDe(compra: CompraDetalle, tcOficialHoy: number | null): string {
  const deCompra = compra.tc_usd_mxn != null ? toNum(compra.tc_usd_mxn) : 0;
  if (deCompra > 0) return String(deCompra);
  return tcOficialHoy != null && tcOficialHoy > 0 ? String(tcOficialHoy) : "";
}

function RegistrarGastoFormulario({
  compra,
  providers,
  tcOficialHoy,
  onCerrar,
}: {
  compra: CompraDetalle;
  providers: { id: string; nombre: string }[];
  tcOficialHoy: number | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tc, setTc] = useState(() => tcInicialDe(compra, tcOficialHoy));
  const [fecha, setFecha] = useState(todayCancun);
  const [medio, setMedio] = useState("");
  const [tarjeta, setTarjeta] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [proveedor, setProveedor] = useState(compra.proveedor?.id ?? "");
  const [folio, setFolio] = useState(compra.referencia ?? "");
  const [notas, setNotas] = useState("");
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [confirmar, setConfirmar] = useState(false);

  // Tarjetas del catálogo para «¿con qué tarjeta?» (solo TARJETA_CORP).
  useEffect(() => {
    let cancel = false;
    void listCardsOptionsAction().then((res) => {
      if (!cancel && res.ok && res.data) setCardOptions(res.data);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const monto = compra.resumen.total_factura == null ? null : toNum(compra.resumen.total_factura);
  const tcValido = validarTcCompra(tc);
  const equivalente = monto != null ? textoEquivalente(monto, compra.moneda, tcValido.ok ? tcValido.tc : null) : null;

  const pedirConfirmacion = () => {
    if (!tcValido.ok) {
      toast.error(tcValido.error);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      toast.error("Captura la fecha del pago.");
      return;
    }
    if (!medio) {
      toast.error(`${MSG_MEDIO_REQUERIDO}.`);
      return;
    }
    setConfirmar(true);
  };

  const registrar = () => {
    if (!tcValido.ok) return;
    const cuentaFinal = cuentaParaAlta(medio, cuenta);
    startTransition(async () => {
      const r = await registrarGastoCompraAction(compra.id, {
        tc_usd_mxn: tcValido.tc,
        fecha_gasto: fecha,
        medio_pago: medio,
        ...(medio === "TARJETA_CORP" && tarjeta ? { tarjeta_terminacion: tarjeta } : {}),
        ...(cuentaFinal ? { cuenta_bancaria_id: cuentaFinal } : {}),
        ...(proveedor ? { proveedor_id: proveedor } : {}),
        ...(folio.trim() ? { folio_ticket: folio.trim() } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      });
      setConfirmar(false);
      if (r.ok && r.data) {
        toast.success(toastGastoRegistrado(r.data), { duration: 8000 });
        onCerrar();
        router.refresh();
      } else if (r.code === CODIGO_GASTO_YA_REGISTRADO) {
        toast.info(r.error ?? "Esta compra ya tiene su gasto registrado.");
        onCerrar();
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo registrar el gasto");
      }
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2" data-monto-gasto-compra>
          <p className="text-xs text-muted-foreground">Monto del gasto (lo calcula el API: líneas + cargos de la factura)</p>
          <p className="text-lg font-semibold tabular-nums">
            {monto != null ? fmtMontoMoneda(monto, compra.moneda) : "—"}
            {equivalente && <span className="ml-2 text-sm font-normal text-muted-foreground">{equivalente}</span>}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field
            label={ETIQUETA_TC_COMPRA}
            required
            hint={hintTcSugerido(tcOficialHoy)}
            error={tc.trim() !== "" && !tcValido.ok ? tcValido.error : undefined}
          >
            <Input
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
              placeholder="Ej. 18.25"
              data-tc-compra
            />
          </Field>
          <Field label={ETIQUETA_FECHA_PAGO_COMPRA} required hint={HINT_FECHA_PAGO_COMPRA}>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Medio de pago" required hint={ayudaMedioPago(medio) ?? undefined}>
            <SearchableSelect
              options={MEDIOS_CAPTURA}
              value={medio}
              onChange={(v) => {
                setMedio(v);
                if (v !== "TARJETA_CORP") setTarjeta("");
                if (!medioLlevaCuenta(v)) setCuenta("");
              }}
              placeholder={MSG_MEDIO_REQUERIDO}
            />
          </Field>
          {medio === "TARJETA_CORP" ? (
            <Field label="¿Con qué tarjeta?" hint="vacío = la asignada a quien registra">
              <SearchableSelect
                options={[
                  { value: "", label: "Automática (asignada al capturador)" },
                  ...cardOptions.map((c) => ({
                    value: c.terminacion,
                    label: `**** ${c.terminacion} · ${c.nombre_titular}`,
                  })),
                ]}
                value={tarjeta}
                onChange={setTarjeta}
                placeholder="Automática"
              />
            </Field>
          ) : medioLlevaCuenta(medio) ? (
            <Field label={ETIQUETA_CAMPO_CUENTA} hint={HINT_CUENTA}>
              <CuentaGastoSelector key={medio} medio={medio} value={cuenta} onChange={setCuenta} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Proveedor" hint="El de la compra, salvo que la factura sea de otro.">
            <ProveedorSelector providers={providers} value={proveedor} onChange={setProveedor} />
          </Field>
          <Field label={ETIQUETA_FOLIO_COMPRA} hint={HINT_FOLIO_COMPRA}>
            <Input value={folio} onChange={(e) => setFolio(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={pedirConfirmacion} disabled={pending || monto == null || monto <= 0}>
          {pending ? "Registrando…" : BOTON_REGISTRAR_GASTO}
        </Button>
      </DialogFooter>

      {/* Dinero: confirmación anidada (Esc cierra solo esta). */}
      <AlertDialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Registrar el gasto por {monto != null ? fmtMontoMoneda(monto, compra.moneda) : "—"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tcValido.ok && monto != null
                ? textoConfirmarRegistrarGasto({
                    folio: compra.folio,
                    monto,
                    moneda: compra.moneda,
                    tc: tcValido.tc,
                    fecha,
                    medio,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Revisar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                registrar();
              }}
            >
              {pending ? "Registrando…" : "Sí, registrar el gasto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
