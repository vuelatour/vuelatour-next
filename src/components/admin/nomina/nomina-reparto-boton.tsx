"use client";

/**
 * Botón primario «Repartir entre aviones» de la cabecera de `/admin/nomina`
 * (16-oct-2026, API 0.0.90). Monta el diálogo SOLO al abrirse (sus lecturas
 * —aviones activos y la vista previa— no corren con la pantalla en reposo) y
 * lo desmonta al cerrar: cada apertura arranca con la selección por defecto.
 * La página decide quién lo ve (`puedeRepartirNomina`, espejo del `@Roles`).
 */

import { useState } from "react";
import { UsersIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { NominaRepartoDialog } from "@/components/admin/nomina/nomina-reparto-dialog";
import {
  ETIQUETA_BOTON_REPARTIR_NOMINA,
  TITULO_BOTON_REPARTIR_NOMINA,
  type PagoNomina,
} from "@/lib/admin/nomina-reparto";

export function NominaRepartoBoton({
  pagos,
  etiquetaMes,
}: {
  pagos: PagoNomina[];
  /** «octubre 2026». */
  etiquetaMes: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 cursor-pointer"
        title={TITULO_BOTON_REPARTIR_NOMINA}
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
      >
        <UsersIcon className="h-4 w-4" aria-hidden="true" />
        {ETIQUETA_BOTON_REPARTIR_NOMINA}
      </Button>
      {abierto && (
        <NominaRepartoDialog
          pagos={pagos}
          etiquetaMes={etiquetaMes}
          open={abierto}
          onOpenChange={setAbierto}
        />
      )}
    </>
  );
}
