import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  BOTON_CONFIRMAR_COSTO,
  avisoEditarCosto,
  avisoEditarCostoSinCargo,
  lineaSalidaDependiente,
  type ConfirmacionCosto,
} from "@/lib/admin/inventario-ficha";

/**
 * Recuadro ÁMBAR de «Corregir el costo de la compra» (25-sep-2026, D7 del
 * contrato): este precio ya se usó en N salidas. Se pinta ANTES de guardar
 * (con los conteos del detalle) o tras el 409 `ENTRADA_CON_SALIDAS` del API
 * (con la lista). Nada cambia en silencio: las salidas conservan lo que se
 * cobró al avión, y las que salieron a $0 SIN cargo lo dicen en rojo —
 * completar el costo no las cobra.
 */
export function AvisoSalidasCosto({
  confirmacion,
  unidad,
  pending,
  onConfirmar,
}: {
  confirmacion: ConfirmacionCosto;
  unidad?: string | null;
  pending?: boolean;
  onConfirmar: () => void;
}) {
  const sinCargo = avisoEditarCostoSinCargo(confirmacion.sinCargo);
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/20"
    >
      <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{avisoEditarCosto(confirmacion.n)}</span>
      </p>
      {confirmacion.salidas.length > 0 && (
        <ul className="ml-6 list-disc space-y-0.5 text-xs text-muted-foreground">
          {confirmacion.salidas.map((s) => (
            <li key={s.id} className={s.sin_cargo ? "text-red-600" : undefined}>
              {lineaSalidaDependiente(s, unidad)}
            </li>
          ))}
        </ul>
      )}
      {sinCargo && <p className="font-medium text-red-600">{sinCargo}</p>}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          onClick={onConfirmar}
          disabled={pending}
        >
          {pending ? "Guardando…" : BOTON_CONFIRMAR_COSTO}
        </Button>
      </div>
    </div>
  );
}
