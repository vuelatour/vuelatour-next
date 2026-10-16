"use client";

import { useInicioOficial } from "./inicio-oficial-provider";
import { ChipAntesDelInicio, FranjaAntesDelInicio } from "./aviso-inicio-oficial";

/**
 * Chip «De antes del inicio oficial (1-sep-2026)» para componentes CLIENTE
 * (lee la fecha del Provider). Va junto a la liga o a la fila de un registro
 * cruzado anterior al inicio (cobro del 31-ago de un vuelo de septiembre,
 * gasto de agosto ligado a un cargo de septiembre…). Sin inicio, nada.
 */
export function ChipInicioOficial({
  fecha,
  antes,
  className,
}: {
  /** Fecha del registro: `fecha_vuelo`, `fecha_gasto`, `fecha_cobro` o `fecha`. */
  fecha: string | null | undefined;
  /** Bandera del API (ADITIVA): si viene, decide ella y no la fecha. */
  antes?: boolean;
  className?: string;
}) {
  const inicio = useInicioOficial();
  return <ChipAntesDelInicio fecha={fecha} inicio={inicio} antes={antes} className={className} />;
}

/** Franja «Este registro es de antes del inicio oficial…» para detalles CLIENTE (hojas laterales). */
export function FranjaInicioOficial({
  fecha,
  className,
}: {
  fecha: string | null | undefined;
  className?: string;
}) {
  const inicio = useInicioOficial();
  return <FranjaAntesDelInicio fecha={fecha} inicio={inicio} className={className} />;
}
