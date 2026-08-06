"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Selector de día de "Tacómetros en vivo": se teclea o se elige del
 * calendario y navega directo, en vez de avanzar día por día con las flechas
 * (pedido de oficina, ago 2026).
 *
 * El valor es date-only (YYYY-MM-DD) tal cual lo devuelve el API — que ya lo
 * calcula en día Cancún —, así que NO se construye ningún Date: pasarlo por
 * `new Date()` lo movería un día según la zona del navegador.
 */
export function TacoLiveDatePicker({ fecha }: { fecha: string }) {
  const router = useRouter();

  return (
    <Input
      type="date"
      value={fecha}
      onChange={(e) => {
        const v = e.target.value;
        // El input queda vacío al borrarlo: sin fecha, el API responde hoy.
        router.push(v ? `/admin/taco-live?fecha=${v}` : "/admin/taco-live");
      }}
      className="h-9 w-40 font-mono"
      aria-label="Ir a una fecha"
      title="Escribe o elige la fecha"
    />
  );
}
