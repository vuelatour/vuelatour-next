"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { estadoCuentaUrlAction, type ActionResult } from "@/app/admin/conciliacion/actions";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import {
  ACCION_DESCARGAR,
  MSG_DETALLE_BANCO_FALLO,
  TEXTO_NO_ABRIO_PESTANA,
  mensajeErrorDescargaEstadoCuenta,
} from "@/lib/admin/hoja-banco";

/** Falla de transporte (red, «Failed to find Server Action» tras un deploy): jamás al error boundary. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_DETALLE_BANCO_FALLO });

export interface OpcionesDetalleBanco<F, D> {
  /** Pide el detalle de la fila (server action que nunca lanza). Función de MÓDULO: estable. */
  pedir: (fila: F) => Promise<ActionResult<D>>;
  /** La llave de la fila: una respuesta solo vale para SU llave. Función de MÓDULO: estable. */
  clave: (fila: F) => string;
  /**
   * MODO CONTROLADO (solo el cuerpo embebido del detalle `?ingreso=`): la
   * fila que se muestra SIEMPRE. La petición sale en un efecto cuya única
   * dependencia es `clave(fija) + '#' + intento`; el ÚNICO setState de la
   * carga ocurre en el `.then` asíncrono (con turno) y «cargando» / «cambió
   * de fila» se DERIVAN comparando la llave de la carga con la vigente
   * (`react-hooks/set-state-in-effect` es ERROR en este repo: nada de un
   * efecto que llame `abrir()`). Sin `fija`, el hook de la hoja de siempre.
   */
  fija?: F | null;
}

/**
 * Estado de una hoja «Conciliación con el banco» (gasto o entrada de dinero),
 * GENÉRICO desde el 15-oct-2026 (API 0.0.78): el de Gastos (13-oct-2026) sin
 * el tipo del gasto. UNA hoja por tabla o por tarjeta, no una por fila.
 *  - `abrir(f)` (estable): pide con `.catch` y TURNO — una respuesta vieja
 *    (otro badge) jamás pisa a la nueva; nunca un `await` desnudo dentro de
 *    `startTransition`.
 *  - `cerrar()` sube el turno y cierra SIN vaciar fila ni carga (el texto no
 *    desaparece durante la animación de salida).
 *  - `descargarEstadoCuenta(id)`: la pestaña se abre en el MISMO clic
 *    (`abrirArchivoFirmado`, Safari no la bloquea) y el enlace firmado (1 h)
 *    se pide después; si el navegador no la abrió, un toast con «Descargar».
 *  - Con `fija` (modo controlado), ver `OpcionesDetalleBanco.fija`.
 */
export function useDetalleBanco<F, D>({ pedir, clave, fija = null }: OpcionesDetalleBanco<F, D>) {
  const [abierto, setAbierto] = useState(false);
  const [fila, setFila] = useState<F | null>(null);
  const [carga, setCarga] = useState<{ id: string; r: ActionResult<D> } | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const turno = useRef(0);

  const pedirFila = useCallback(
    (f: F) => {
      const n = ++turno.current;
      setCarga(null);
      void pedir(f)
        .catch(sinConexion)
        .then((r) => {
          if (turno.current === n) setCarga({ id: clave(f), r });
        });
    },
    [pedir, clave],
  );

  const abrir = useCallback(
    (f: F) => {
      setFila(f);
      setAbierto(true);
      pedirFila(f);
    },
    [pedirFila],
  );

  const cerrar = useCallback(() => {
    turno.current += 1;
    setAbierto(false);
  }, []);

  // ── MODO CONTROLADO: la carga se DERIVA de su llave (fila fija + intento).
  const claveFija = fija ? `${clave(fija)}#${intento}` : null;
  const pedirFija = useEffectEvent((id: string) => {
    if (!fija) return;
    const n = ++turno.current;
    void pedir(fija)
      .catch(sinConexion)
      .then((r) => {
        if (turno.current === n) setCarga({ id, r });
      });
  });
  useEffect(() => {
    if (claveFija !== null) pedirFija(claveFija);
  }, [claveFija]);

  const controlado = fija != null;
  const reintentar = useCallback(() => {
    if (controlado) {
      // Evento (no efecto): vacía la carga y sube el intento ⇒ otra llave.
      setCarga(null);
      setIntento((i) => i + 1);
      return;
    }
    if (fila) pedirFila(fila);
  }, [controlado, fila, pedirFila]);

  const descargarEstadoCuenta = useCallback((id: string) => {
    setDescargando(id);
    void abrirArchivoFirmado(async () => {
      const res = await estadoCuentaUrlAction(id).catch(sinConexion);
      return res.ok && res.data
        ? { ok: true, data: res.data.url }
        : { ok: false, error: mensajeErrorDescargaEstadoCuenta(res) };
    })
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        if (!r.abierta) {
          const url = r.url;
          toast(TEXTO_NO_ABRIO_PESTANA, {
            action: { label: ACCION_DESCARGAR, onClick: () => window.open(url, "_blank") },
          });
        }
      })
      .finally(() => setDescargando(null));
  }, []);

  const resultado = fija
    ? carga && carga.id === claveFija
      ? carga.r
      : null
    : carga && fila && carga.id === clave(fila)
      ? carga.r
      : null;
  return {
    abierto,
    fila: fija ?? fila,
    resultado,
    descargando,
    abrir,
    cerrar,
    reintentar,
    descargarEstadoCuenta,
  };
}
