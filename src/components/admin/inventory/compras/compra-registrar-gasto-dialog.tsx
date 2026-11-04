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
import { registrarGastoCompraAction } from "@/app/admin/inventory/compras/actions";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import { todayCancun } from "@/lib/datetime";
import {
  BOTON_REGISTRAR_GASTO,
  CODIGO_GASTO_YA_REGISTRADO,
  cuerpoRegistrarGastoCompra,
  descripcionRegistrarGasto,
  formGastoCompraVacio,
  tcInicialCompra,
  textoConfirmarRegistrarGasto,
  textoEquivalente,
  tituloRegistrarGasto,
  toastGastoRegistrado,
  validarTcCompra,
  type FormGastoCompra,
} from "@/lib/admin/compras-estado";
import { fmtMontoMoneda, toNum, type CompraDetalle } from "@/types/compras";
import { CompraGastoCampos } from "./compra-gasto-campos";

/**
 * «Registrar gasto» de la compra (21-oct-2026, API 0.0.102, invariante 101
 * del API): la factura de las REFACCIONES. El MONTO no se captura: es el
 * total de la factura que calculó el API (líneas + cargos impresos). El T.C.
 * es OBLIGATORIO (en pesos y en dólares; banda 15–25, mismos textos que el
 * API) y se sugiere el de la compra o el oficial de hoy. Desde el 4-nov-2026
 * (API 0.0.120) también se adjunta el comprobante, con los MISMOS campos que
 * «Agregar gasto» (`CompraGastoCampos`). Dinero ⇒ confirmación antes de
 * crear. El formulario se monta SOLO abierto: cada apertura arranca limpio.
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
  const [form, setForm] = useState<FormGastoCompra>(() =>
    formGastoCompraVacio({
      tc: tcInicialCompra(compra.tc_usd_mxn, tcOficialHoy),
      fecha: todayCancun(),
      proveedor: compra.proveedor?.id ?? "",
      folio: compra.referencia ?? "",
    }),
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const set = (patch: Partial<FormGastoCompra>) => setForm((f) => ({ ...f, ...patch }));

  const monto = compra.resumen.total_factura == null ? null : toNum(compra.resumen.total_factura);
  const tcValido = validarTcCompra(form.tc);
  const equivalente = monto != null ? textoEquivalente(monto, compra.moneda, tcValido.ok ? tcValido.tc : null) : null;
  const veredicto = cuerpoRegistrarGastoCompra(form, null);

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
      const r = await registrarGastoCompraAction(compra.id, {
        ...cuerpo,
        ...(fotoPath ? { foto_url: fotoPath } : {}),
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
        <CompraGastoCampos
          form={form}
          onChange={set}
          providers={providers}
          tcOficialHoy={tcOficialHoy}
          hintProveedor="El de la compra, salvo que la factura sea de otro."
          archivo={archivo}
          onArchivo={setArchivo}
        />
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
              {veredicto.ok && monto != null
                ? textoConfirmarRegistrarGasto({
                    folio: compra.folio,
                    monto,
                    moneda: compra.moneda,
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
              {pending ? "Registrando…" : "Sí, registrar el gasto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
