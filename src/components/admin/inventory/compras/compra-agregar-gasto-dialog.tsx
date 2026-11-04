"use client";

import { useState, useTransition } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { agregarGastoCompraAction } from "@/app/admin/inventory/compras/actions";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import { todayCancun } from "@/lib/datetime";
import {
  BOTON_AGREGAR_GASTO,
  DESCRIPCION_AGREGAR_GASTO,
  ETIQUETA_MONEDA_GASTO,
  ETIQUETA_MONTO_GASTO,
  ETIQUETA_QUE_PAGASTE,
  HINT_MONEDA_GASTO,
  HINT_PROVEEDOR_OTRO_GASTO,
  HINT_TC_OTRO_GASTO,
  ROL_OTRO_GASTO_OPTIONS,
  cuerpoAgregarGastoCompra,
  formOtroGastoCompraVacio,
  hintTcSugerido,
  montoDeTexto,
  tcInicialCompra,
  textoConfirmarAgregarGasto,
  textoEquivalente,
  tituloAgregarGasto,
  toastGastoAgregado,
  validarTcCompra,
  type FormOtroGastoCompra,
} from "@/lib/admin/compras-estado";
import { fmtMontoMoneda, type CompraDetalle, type CompraRolOtro } from "@/types/compras";
import { CompraGastoCampos } from "./compra-gasto-campos";

const MONEDAS: Array<{ value: "MXN" | "USD"; label: string }> = [
  { value: "MXN", label: "MXN (pesos)" },
  { value: "USD", label: "USD (dólares)" },
];

/**
 * «Agregar gasto» a la compra (4-nov-2026, API 0.0.120, invariante 116 del
 * API): el envío de UPS en pesos, la aduana, otro cargo. Se captura qué
 * pagó, cuánto y en qué moneda (la de SU factura), el T.C. obligatorio y
 * sugerido, el medio, el proveedor de ESTE pago y el comprobante; el API lo
 * crea en Gastos y lo liga a la compra. Dinero ⇒ confirmación. El
 * formulario se monta SOLO abierto: cada apertura arranca limpio.
 */
export function CompraAgregarGastoDialog({
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
  tcOficialHoy?: number | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tituloAgregarGasto(compra.folio)}</DialogTitle>
          <DialogDescription>{DESCRIPCION_AGREGAR_GASTO}</DialogDescription>
        </DialogHeader>
        {open && (
          <AgregarGastoFormulario
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

function AgregarGastoFormulario({
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
  const [form, setForm] = useState<FormOtroGastoCompra>(() =>
    formOtroGastoCompraVacio({ tc: tcInicialCompra(compra.tc_usd_mxn, tcOficialHoy), fecha: todayCancun() }),
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const set = (patch: Partial<FormOtroGastoCompra>) => setForm((f) => ({ ...f, ...patch }));

  const monto = montoDeTexto(form.monto);
  const tcValido = validarTcCompra(form.tc);
  const equivalente = monto != null ? textoEquivalente(monto, form.moneda, tcValido.ok ? tcValido.tc : null) : null;
  const veredicto = cuerpoAgregarGastoCompra(form, null);

  const pedirConfirmacion = () => {
    if (!veredicto.ok) {
      toast.error(veredicto.error);
      return;
    }
    setConfirmar(true);
  };

  const registrar = () => {
    if (!veredicto.ok) return;
    const cuerpo = veredicto.cuerpo;
    startTransition(async () => {
      // Primero el comprobante: si la subida falla, no se crea el gasto a medias.
      let fotoPath: string | null = null;
      if (archivo) {
        try {
          fotoPath = await uploadGastoComprobante(archivo);
        } catch (err) {
          setConfirmar(false);
          toast.error(err instanceof Error ? err.message : "No se pudo subir el comprobante");
          return;
        }
      }
      const r = await agregarGastoCompraAction(compra.id, {
        ...cuerpo,
        ...(fotoPath ? { foto_url: fotoPath } : {}),
      });
      setConfirmar(false);
      if (r.ok && r.data) {
        toast.success(toastGastoAgregado(r.data, form.rol), { duration: 8000 });
        onCerrar();
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo agregar el gasto");
      }
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label={ETIQUETA_QUE_PAGASTE} required>
            <SearchableSelect
              options={ROL_OTRO_GASTO_OPTIONS.map((o) => ({ ...o }))}
              value={form.rol}
              onChange={(v) => set({ rol: v as CompraRolOtro })}
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3 [&>*]:min-w-0">
            <Field label={ETIQUETA_MONTO_GASTO} required hint={equivalente ?? undefined}>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.monto}
                onChange={(e) => set({ monto: e.target.value })}
                placeholder="Ej. 1850.50"
                data-monto-otro-gasto
              />
            </Field>
            <Field label={ETIQUETA_MONEDA_GASTO} required hint={HINT_MONEDA_GASTO}>
              <SearchableSelect
                options={MONEDAS}
                value={form.moneda}
                onChange={(v) => set({ moneda: v === "USD" ? "USD" : "MXN" })}
                className="w-36"
              />
            </Field>
          </div>
        </div>
        <CompraGastoCampos
          form={form}
          onChange={set}
          providers={providers}
          tcOficialHoy={tcOficialHoy}
          hintTc={`${HINT_TC_OTRO_GASTO} ${hintTcSugerido(tcOficialHoy)}`}
          hintProveedor={HINT_PROVEEDOR_OTRO_GASTO}
          archivo={archivo}
          onArchivo={setArchivo}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={pedirConfirmacion} disabled={pending} data-accion="agregar-gasto-confirmar">
          {pending ? "Agregando…" : BOTON_AGREGAR_GASTO}
        </Button>
      </DialogFooter>

      {/* Dinero: confirmación anidada (Esc cierra solo esta). */}
      <AlertDialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Agregar el gasto por {monto != null ? fmtMontoMoneda(monto, form.moneda) : "—"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {veredicto.ok
                ? textoConfirmarAgregarGasto({
                    folio: compra.folio,
                    rol: form.rol,
                    monto: veredicto.cuerpo.monto,
                    moneda: veredicto.cuerpo.moneda,
                    tc: veredicto.cuerpo.tc_usd_mxn,
                    fecha: veredicto.cuerpo.fecha_gasto,
                    medio: veredicto.cuerpo.medio_pago,
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
              {pending ? "Agregando…" : "Sí, agregar el gasto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
