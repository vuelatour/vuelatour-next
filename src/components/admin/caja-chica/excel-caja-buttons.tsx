"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownTrayIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { todayCancun } from "@/lib/datetime";
import { descargarArchivoDelPanel } from "@/lib/descargar-archivo";
import {
  DESCRIPCION_REPOSICION_REGISTRADA,
  ETIQUETA_DESCARGAR_DE_NUEVO,
  TEXTO_BOTON_POR_REPONER,
  TEXTO_REPOSICION_REGISTRADA,
  TITULO_BOTON_POR_REPONER,
  TITULO_ICONO_REPOSICION,
  nombreExcelPorReponer,
  nombreExcelReposicion,
  rutaExcelPorReponer,
  rutaExcelReposicion,
  textoExcelNoDescargado,
} from "@/lib/admin/caja-chica-excel";

/**
 * Descargas del EXCEL de caja chica (24-sep-2026). Todo pasa por el proxy
 * del panel (`app/api/caja-chica/**`, cookie de sesión) y el Excel lo arma el
 * API: aquí no se calcula ningún peso.
 */

/** Descarga el Excel de UNA reposición. `null` = salió bien; si no, el motivo. */
export function descargarExcelReposicion(
  movimientoId: string,
  persona: string,
  fecha?: string | null,
): Promise<string | null> {
  return descargarArchivoDelPanel(rutaExcelReposicion(movimientoId), {
    respaldo: nombreExcelReposicion(persona, fecha || todayCancun()),
  });
}

/**
 * Toast «Reposición registrada» + descarga AUTOMÁTICA del Excel de esa
 * reposición, con «Descargar de nuevo» (pedido del cliente: «al momento de
 * reembolsar la caja de cada uno, me puede arrojar un Excel descargable»).
 * La reposición YA quedó: si el Excel falla, el error lo dice así y ofrece
 * «Reintentar» — nunca parece que el dinero no se registró.
 */
export function avisarReposicionYDescargar(
  movimientoId: string,
  persona: string,
  fecha: string | null,
): void {
  const descargar = async () => {
    const error = await descargarExcelReposicion(movimientoId, persona, fecha);
    if (error) {
      toast.error(textoExcelNoDescargado(error), {
        action: { label: "Reintentar", onClick: () => void descargar() },
        duration: 12_000,
      });
    }
  };
  toast.success(TEXTO_REPOSICION_REGISTRADA, {
    description: DESCRIPCION_REPOSICION_REGISTRADA,
    action: { label: ETIQUETA_DESCARGAR_DE_NUEVO, onClick: () => void descargar() },
    duration: 12_000,
  });
  void descargar();
}

/** Botón «Descargar lo pendiente por reponer (Excel)», junto a «Registrar movimiento». */
export function DescargarPorReponerButton({
  fondoId,
  persona,
}: {
  fondoId: string;
  persona: string;
}) {
  const [cargando, setCargando] = useState(false);

  const descargar = async () => {
    setCargando(true);
    try {
      const error = await descargarArchivoDelPanel(rutaExcelPorReponer(fondoId), {
        respaldo: nombreExcelPorReponer(persona, todayCancun()),
      });
      if (error) toast.error(error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="gap-2 cursor-pointer"
      onClick={() => void descargar()}
      disabled={cargando}
      title={TITULO_BOTON_POR_REPONER}
    >
      <TableCellsIcon className="h-4 w-4" />
      {cargando ? "Generando Excel…" : TEXTO_BOTON_POR_REPONER}
    </Button>
  );
}

/** Ícono de descarga en cada fila REPOSICIÓN del historial. */
export function DescargarReposicionIcon({
  movimientoId,
  persona,
  fecha,
}: {
  movimientoId: string;
  persona: string;
  fecha?: string | null;
}) {
  const [cargando, setCargando] = useState(false);

  const descargar = async () => {
    setCargando(true);
    try {
      const error = await descargarExcelReposicion(movimientoId, persona, fecha);
      if (error) toast.error(error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="cursor-pointer text-muted-foreground hover:text-foreground"
      onClick={() => void descargar()}
      disabled={cargando}
      title={TITULO_ICONO_REPOSICION}
      aria-label="Descargar el Excel de esta reposición"
    >
      <ArrowDownTrayIcon className={`h-4 w-4 ${cargando ? "animate-pulse" : ""}`} />
    </Button>
  );
}
