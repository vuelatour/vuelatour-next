"use client";

import { useCallback, useEffect, useState } from "react";
import { facturasDeGastoAction } from "@/app/admin/expenses/actions";
import { llamarSinLanzar } from "@/lib/admin/reparto-gasto";
import type { FacturaDeGasto } from "@/lib/admin/facturas-gasto";

export type CargaFacturas =
  | { fase: "cargando"; varias: boolean | null; facturas: FacturaDeGasto[]; avisos: string[] }
  | { fase: "error"; varias: boolean | null; facturas: FacturaDeGasto[]; avisos: string[]; error: string }
  | { fase: "listo"; varias: boolean; facturas: FacturaDeGasto[]; avisos: string[] };

/**
 * Las facturas de UN gasto, pedidas al abrir (16-oct-2026). La lista de
 * gastos solo trae `facturas_n`: el arreglo vive en el detalle
 * (`GET /v1/expenses/:id`). `varias` dice si el API ya maneja varias
 * (0.0.86) o si es el previo (una por gasto). Un fallo de carga se DICE
 * («No se pudieron cargar…» + Reintentar): jamás «sin facturas» si falló.
 */
export function useFacturasDeGasto(gastoId: string, activo: boolean) {
  const [carga, setCarga] = useState<CargaFacturas>({
    fase: "cargando",
    varias: null,
    facturas: [],
    avisos: [],
  });
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let cancel = false;
    void llamarSinLanzar(() => facturasDeGastoAction(gastoId)).then((r) => {
      if (cancel) return;
      if (r.ok && r.valor.ok && r.valor.data) {
        const d = r.valor.data;
        setCarga({ fase: "listo", varias: d.varias, facturas: d.facturas, avisos: d.avisos ?? [] });
        return;
      }
      const error = r.ok ? (r.valor.error ?? "") : r.error;
      setCarga((prev) => ({ ...prev, fase: "error", error }));
    });
    return () => {
      cancel = true;
    };
  }, [gastoId, activo, pedido]);

  /** Vuelve a pedir la lista (tras subir o quitar, o «Reintentar»). */
  const recargar = useCallback(() => {
    setCarga((prev) => ({ ...prev, fase: "cargando" }) as CargaFacturas);
    setPedido((p) => p + 1);
  }, []);

  /** Marca que el API es el previo (rechazó `archivos`) sin volver a pedir. */
  const marcarApiPrevio = useCallback(() => {
    setCarga((prev) => ({ ...prev, varias: false }) as CargaFacturas);
  }, []);

  return { carga, recargar, marcarApiPrevio };
}
