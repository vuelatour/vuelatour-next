"use client";

import { useState } from "react";
import { ArrowsRightLeftIcon, ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MovimientoDialog } from "./movimiento-dialog";
import type { MovimientoFormValues } from "@/app/admin/inventory/schema";
import type { InventarioEmpaque, InventarioUbicacion, StockUbicacion } from "@/types/inventory";

interface MovimientoButtonProps {
  itemId: string;
  itemNombre: string;
  unidad?: string | null;
  /** Precio de venta del ítem: prellenado del cargo al avión en SALIDA. */
  precioVenta?: number | null;
  precioVentaMoneda?: "MXN" | "USD" | null;
  empaques?: InventarioEmpaque[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Empaque preseleccionado (llegó escaneando el código de la caja). */
  initialEmpaqueId?: string;
  /** Abrir el diálogo al montar (navegación desde el escáner). */
  autoOpen?: boolean;
  /** Margen de la tienda: textos de la salida («Vacío = último precio de compra + 25 %»). */
  margenVentaPct?: number | null;
  /** ¿Ya tiene una compra con costo? Texto de la ENTRADA sin costo (undefined = no se sabe). */
  tieneCostoVigente?: boolean;
  /** T.C. oficial de hoy: la salida se cobra en pesos (un precio en USD se sugiere convertido). */
  tcHoy?: number | null;
  /**
   * Bodegas (27-oct-2026, API 0.0.111): catálogo, principal del producto y
   * reparto actual (el selector de bodega y el tipo «Traspaso»).
   */
  ubicaciones?: InventarioUbicacion[] | null;
  ubicacionPrincipalId?: string | null;
  stockPorUbicacion?: StockUbicacion[] | null;
  /** Tipo con el que abre el diálogo (p. ej. TRASPASO desde «Stock y ubicaciones»). */
  initialTipo?: MovimientoFormValues["tipo"];
  /** Texto del botón (default «Registrar movimiento»). */
  etiqueta?: string;
  variant?: "default" | "outline";
}

export function MovimientoButton({
  initialEmpaqueId,
  autoOpen,
  etiqueta = "Registrar movimiento",
  variant = "default",
  ...props
}: MovimientoButtonProps) {
  const [open, setOpen] = useState(!!autoOpen);
  const cerrarOAbrir = (o: boolean) => {
    setOpen(o);
    // Al cerrar el diálogo que abrió el escáner, se limpia `?empaque=` de la
    // URL para que un refresh no lo vuelva a abrir.
    if (!o && autoOpen && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("empaque")) {
        url.searchParams.delete("empaque");
        window.history.replaceState(null, "", url.toString());
      }
    }
  };
  const Icono = props.initialTipo === "TRASPASO" ? ArrowsRightLeftIcon : ArrowsUpDownIcon;
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" variant={variant}>
        <Icono className="h-4 w-4" />
        {etiqueta}
      </Button>
      <MovimientoDialog
        open={open}
        onOpenChange={cerrarOAbrir}
        initialEmpaqueId={initialEmpaqueId}
        {...props}
      />
    </>
  );
}
