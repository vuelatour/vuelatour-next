"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  conciliacionDeGastoAction,
  estadoCuentaUrlAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import {
  ACCION_DESCARGAR,
  MSG_DETALLE_BANCO_FALLO,
  TEXTO_CARGANDO_BANCO,
  TEXTO_NO_ABRIO_PESTANA,
  TITULO_HOJA_BANCO,
  descripcionHojaBanco,
  lineaPagoGasto,
  mensajeErrorDescargaEstadoCuenta,
  type GastoBancoFila,
} from "@/lib/admin/gasto-banco";
import type { ConciliacionDeGasto } from "@/types/conciliacion";

/**
 * El cuerpo de la hoja se carga al PRIMER clic (`next/dynamic`, sin SSR,
 * mismo precedente que «Vincular gasto»): la tabla de Gastos no paga ese
 * código hasta que alguien abre un badge.
 */
const GastoBancoDetalle = dynamic(
  () => import("./gasto-banco-detalle").then((m) => m.GastoBancoDetalle),
  {
    ssr: false,
    loading: () => (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {TEXTO_CARGANDO_BANCO}
      </p>
    ),
  },
);

/** Falla de transporte (red, «Failed to find Server Action» tras un deploy): jamás al error boundary. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_DETALLE_BANCO_FALLO });

/**
 * Estado de la hoja «Conciliación con el banco» (13-oct-2026, «conciliación
 * al revés», API 0.0.75). UNA hoja por tabla, no una por fila.
 *  - `abrir(g)` (estable): pide `conciliacionDeGastoAction` con `.catch` y
 *    TURNO — una respuesta vieja (otro badge) jamás pisa a la nueva; nunca un
 *    `await` desnudo dentro de `startTransition`.
 *  - `cerrar()` sube el turno y cierra SIN vaciar fila ni carga (el texto no
 *    desaparece durante la animación de salida).
 *  - `descargarEstadoCuenta(id)`: la pestaña se abre en el MISMO clic
 *    (`abrirArchivoFirmado`, Safari no la bloquea) y el enlace firmado (1 h)
 *    se pide después; si el navegador no la abrió, un toast con «Descargar».
 */
export function useDetalleBancoGasto() {
  const [abierto, setAbierto] = useState(false);
  const [fila, setFila] = useState<GastoBancoFila | null>(null);
  const [carga, setCarga] = useState<{ id: string; r: ActionResult<ConciliacionDeGasto> } | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const turno = useRef(0);

  const pedir = useCallback((g: GastoBancoFila) => {
    const n = ++turno.current;
    setCarga(null);
    void conciliacionDeGastoAction(g.id)
      .catch(sinConexion)
      .then((r) => {
        if (turno.current === n) setCarga({ id: g.id, r });
      });
  }, []);

  const abrir = useCallback(
    (g: GastoBancoFila) => {
      setFila(g);
      setAbierto(true);
      pedir(g);
    },
    [pedir],
  );

  const cerrar = useCallback(() => {
    turno.current += 1;
    setAbierto(false);
  }, []);

  const reintentar = useCallback(() => {
    if (fila) pedir(fila);
  }, [fila, pedir]);

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

  const resultado = carga && fila && carga.id === fila.id ? carga.r : null;
  return { abierto, fila, resultado, descargando, abrir, cerrar, reintentar, descargarEstadoCuenta };
}

export type DetalleBancoGasto = ReturnType<typeof useDetalleBancoGasto>;

/**
 * La hoja lateral «Conciliación con el banco»: el gasto (categoría · monto ·
 * fecha · vuelo · factura) y con qué se pagó; el cuerpo es
 * `GastoBancoDetalle`. Solo lectura: no hay acción destructiva que confirmar.
 */
export function GastoBancoSheet({ detalle }: { detalle: DetalleBancoGasto }) {
  const router = useRouter();
  const datos = detalle.resultado?.ok ? (detalle.resultado.data ?? null) : null;
  const encabezado = datos?.gasto ?? detalle.fila;
  const pago = lineaPagoGasto(datos?.gasto ?? detalle.fila);
  return (
    <Sheet open={detalle.abierto} onOpenChange={(o) => !o && detalle.cerrar()}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <div className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0 pr-8">
            <SheetTitle>{TITULO_HOJA_BANCO}</SheetTitle>
            <SheetDescription>
              {descripcionHojaBanco(encabezado)}
              {pago && <span className="block text-xs">{pago}</span>}
            </SheetDescription>
          </SheetHeader>
          {detalle.fila && (
            <GastoBancoDetalle
              fila={detalle.fila}
              resultado={detalle.resultado}
              descargando={detalle.descargando}
              onReintentar={detalle.reintentar}
              onRecargar={() => router.refresh()}
              onDescargar={detalle.descargarEstadoCuenta}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
