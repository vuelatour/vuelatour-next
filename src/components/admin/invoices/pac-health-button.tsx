"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { SignalIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { pacHealthAction } from "@/app/admin/facturas/actions";

/**
 * Diagnóstico de la conexión con el PAC (Facturama) SIN consumir timbres:
 * valida credenciales y muestra cuántos CSD hay cargados en la plataforma.
 */
export function PacHealthButton() {
  const [probando, startProbe] = useTransition();

  const probar = () => {
    startProbe(async () => {
      const res = await pacHealthAction();
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo consultar el PAC");
        return;
      }
      const h = res.data;
      const encabezado = h?.pac
        ? `${h.pac}${h.modo ? ` (${h.modo})` : ""}`
        : "PAC";
      if (h?.ok) {
        toast.success(`Conexión con ${encabezado} OK. ${h.detalle ?? ""}`);
      } else {
        toast.error(`Sin conexión con ${encabezado}: ${h?.detalle ?? "sin detalle"}`, {
          duration: 10000,
        });
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={probar}
      disabled={probando}
      className="gap-1.5"
      title="Valida usuario/contraseña del PAC sin timbrar (no consume folios)."
    >
      <SignalIcon className="h-4 w-4" />
      {probando ? "Probando…" : "Probar conexión PAC"}
    </Button>
  );
}
