"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ESPERA_APLICAR_MS } from "@/lib/admin/periodo-selector";
import {
  borradoresVigentes,
  pasoAlSalirCampoFecha,
  pasoCampoFecha,
  rangoAlCambiarCampo,
  valorVisibleCampoFecha,
  type BorradorCampoFecha,
  type CampoRangoLista,
} from "@/lib/admin/quote-navegacion";

/** Cambios de la URL: `null` (o «») quita el parámetro. */
export type CambiosUrl = Record<string, string | null>;
/** Rango de días `YYYY-MM-DD` («» = sin ese extremo). */
export type RangoDias = { desde: string; hasta: string };

/**
 * Hook COMPARTIDO (15-oct-2026): nació en la barra de Gastos y ahora también
 * lo usa el filtro Desde/Hasta del historial de Caja chica. Solo pegamento de
 * React: las reglas son las funciones PURAS de `quote-navegacion`.
 *
 * BORRADOR de un rango de fechas de la barra (patrón de `quotes-filter-bar`,
 * 13-oct-2026): tecleando el año («0002-10-01») nada navega; solo una fecha
 * COMPLETA tras `ESPERA_APLICAR_MS`, o al salir del campo / Enter. Si el
 * extremo nuevo invierte el rango, el otro lo sigue (`rangoAlCambiarCampo`).
 * El borrador se guarda contra el valor de la URL con el que se escribió y
 * CADUCA en cuanto la URL del campo cambia (llegó la navegación, o Atrás /
 * «Quitar filtros» la movieron): ya no revive si la URL regresa a ese valor
 * (`borradoresVigentes`, revisión del 14-oct-2026). `extra` viaja en cada
 * navegación del rango (la captura apaga «Esta semana»: `cap: null`).
 */
export function useRangoBorrador({
  claveDesde,
  claveHasta,
  deUrl,
  navegar,
  rangoParaNavegar,
  extra,
}: {
  claveDesde: string;
  claveHasta: string;
  deUrl: RangoDias;
  navegar: (cambios: CambiosUrl) => void;
  /** El rango sobre el que se cambia un extremo: el de la última consulta PEDIDA. */
  rangoParaNavegar: () => RangoDias;
  extra?: CambiosUrl;
}) {
  const [borradores, setBorradores] = useState<Record<CampoRangoLista, BorradorCampoFecha | null>>({
    desde: null,
    hasta: null,
  });
  // Un borrador cuya URL ya cambió no vuelve a valer: se suelta aquí mismo
  // (ajuste en el render, guardado: devuelve el mismo objeto si nada caducó).
  const vigentes = borradoresVigentes(borradores, deUrl);
  if (vigentes !== borradores) setBorradores(vigentes);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarEspera = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);
  useEffect(() => cancelarEspera, [cancelarEspera]);

  const visible: RangoDias = {
    desde: valorVisibleCampoFecha(deUrl.desde, borradores.desde),
    hasta: valorVisibleCampoFecha(deUrl.hasta, borradores.hasta),
  };

  const guardarBorrador = (campo: CampoRangoLista, valor: string | null) =>
    setBorradores((b) => ({
      ...b,
      [campo]: valor === null ? null : { base: deUrl[campo], valor },
    }));

  /** Navega con el rango que resulta de cambiar UN extremo. */
  const aplicar = (campo: CampoRangoLista, valor: string) => {
    cancelarEspera();
    const base = rangoParaNavegar();
    const nuevo = rangoAlCambiarCampo(
      { desde: base.desde || undefined, hasta: base.hasta || undefined },
      campo,
      valor,
    );
    setBorradores({
      desde: { base: deUrl.desde, valor: nuevo.desde ?? "" },
      hasta: { base: deUrl.hasta, valor: nuevo.hasta ?? "" },
    });
    navegar({ [claveDesde]: nuevo.desde ?? null, [claveHasta]: nuevo.hasta ?? null, ...extra });
  };

  const onCambio = (campo: CampoRangoLista, valor: string) => {
    cancelarEspera();
    const paso = pasoCampoFecha(valor);
    guardarBorrador(campo, valor);
    if (paso.tipo === "aplicar") {
      temporizador.current = setTimeout(() => aplicar(campo, paso.valor), ESPERA_APLICAR_MS);
    }
  };

  const onSalir = (campo: CampoRangoLista) => {
    const paso = pasoAlSalirCampoFecha(visible[campo], deUrl[campo]);
    if (paso.tipo === "aplicar") {
      aplicar(campo, paso.valor);
      return;
    }
    cancelarEspera();
    if (paso.tipo === "limpiar") {
      guardarBorrador(campo, "");
      navegar({ [campo === "desde" ? claveDesde : claveHasta]: null, ...extra });
      return;
    }
    guardarBorrador(campo, null); // incompleto o igual a la URL: vuelve lo de la URL
  };

  /** Suelta los borradores (al limpiar los filtros). */
  const soltar = () => {
    cancelarEspera();
    setBorradores({ desde: null, hasta: null });
  };

  return { visible, onCambio, onSalir, soltar };
}
