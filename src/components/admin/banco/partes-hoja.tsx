"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  TEXTO_DESCARGANDO,
  TITULO_DESCARGAR_ESTADO_CUENTA,
  type ArchivoDeMovimiento,
} from "@/lib/admin/hoja-banco";
import { cn } from "@/lib/utils";

/**
 * Piezas de MARCADO comunes a las dos hojas «Conciliación con el banco» (15-oct-2026,
 * API 0.0.78): la de un gasto (`expenses/gasto-banco-detalle.tsx`) y la de una
 * entrada de dinero (`ingresos/entrada-banco-detalle.tsx`). Salieron TAL CUAL
 * del cuerpo de Gastos: el marcado es el mismo byte a byte (lo vigilan
 * `gasto-banco-sheet.test.tsx` y `banco-cableado.test.ts`).
 */

/** Toda liga de la hoja: pestaña NUEVA (la hoja y la lista se quedan). */
export function EnlaceNuevaPestana({
  href,
  title,
  className,
  children,
}: {
  href: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      title={title}
      className={cn("cursor-pointer text-brand-600 underline-offset-2 hover:underline", className)}
    >
      {children}
    </Link>
  );
}

/**
 * El estado de cuenta del que salió el movimiento («Estado de cuenta: … ·
 * Importado el … por …» + «Descargar estado de cuenta (PDF)» / «Abriendo…»)
 * o, si no hay archivo, el motivo REAL (`archivoDeMovimiento`).
 */
export function ArchivoEstadoCuenta({
  archivo,
  descargando,
  onDescargar,
}: {
  archivo: ArchivoDeMovimiento;
  descargando: string | null;
  onDescargar: (estadoCuentaId: string) => void;
}) {
  return archivo.tipo === "ARCHIVO" ? (
    <div className="space-y-1 text-xs">
      <p>
        Estado de cuenta: <span className="font-medium">{archivo.nombre}</span>
      </p>
      <p className="text-muted-foreground">{archivo.detalle}</p>
      <Button
        size="xs"
        variant="outline"
        className="cursor-pointer"
        title={TITULO_DESCARGAR_ESTADO_CUENTA}
        disabled={descargando === archivo.estadoCuentaId}
        onClick={() => {
          if (archivo.tipo === "ARCHIVO") onDescargar(archivo.estadoCuentaId);
        }}
      >
        {descargando === archivo.estadoCuentaId ? TEXTO_DESCARGANDO : archivo.etiquetaDescarga}
      </Button>
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">{archivo.texto}</p>
  );
}
