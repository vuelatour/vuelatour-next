import { toast } from "sonner";

/**
 * Avisos NO bloqueantes del API (4-sep-2026): capacidad del avión vs
 * pasajeros, doble reserva del avión ese día, pilotos sin asignar, hijos de
 * grupo con precio desactualizado… Vienen como `avisos: string[]` en la
 * respuesta de assign / assignEscala / createReserva y de TODAS las
 * escrituras de la cotización de grupo. Se muestran en ámbar, uno por
 * aviso, SIN bloquear el flujo (el guardado ya ocurrió). Fuente única para
 * que todos los sitios los pinten igual. Solo para componentes cliente.
 */
export function toastAvisos(
  avisos: string[] | null | undefined,
  opts: { max?: number; duration?: number } = {},
): void {
  const lista = (avisos ?? []).map((a) => a?.trim()).filter((a): a is string => !!a);
  if (lista.length === 0) return;
  const max = opts.max ?? 4;
  const duration = opts.duration ?? 9000;
  for (const a of lista.slice(0, max)) {
    toast.warning(a, { duration });
  }
  if (lista.length > max) {
    toast.warning(
      `…y ${lista.length - max} aviso(s) más: revísalos en el detalle.`,
      { duration },
    );
  }
}
