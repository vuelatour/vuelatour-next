import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { notaAeronaveEnTaller } from "@/lib/admin/aviso-taller";

/**
 * Advertencia ÁMBAR de «avión en taller» al elegirlo en un selector
 * (11-sep-2026, pedido del cliente: «la advertencia está bien pero con eso es
 * suficiente, no debe limitarte»). Informativa: ni modal, ni confirmación, ni
 * rojo, y jamás deshabilita el guardado. FUENTE ÚNICA de cómo se ve en el
 * panel (el texto vive en `lib/admin/aviso-taller.ts`).
 */
export function NotaTaller({ matricula }: { matricula: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{notaAeronaveEnTaller(matricula)}</span>
    </p>
  );
}
