"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { conciliacionDeGastoAction } from "@/app/admin/conciliacion/actions";
import { useDetalleBanco } from "@/components/admin/banco/use-detalle-banco";
import {
  TEXTO_CARGANDO_BANCO,
  TITULO_HOJA_BANCO,
  descripcionHojaBanco,
  lineaPagoGasto,
  type GastoBancoFila,
} from "@/lib/admin/gasto-banco";

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

/** Lo que pide la hoja de un gasto (función de MÓDULO: estable para el hook). */
const pedirGasto = (g: GastoBancoFila) => conciliacionDeGastoAction(g.id);
/** La llave de una respuesta: el id del gasto. */
const claveGasto = (g: GastoBancoFila) => g.id;

/**
 * Estado de la hoja «Conciliación con el banco» (13-oct-2026, «conciliación
 * al revés», API 0.0.75). UNA hoja por tabla, no una por fila. Desde el
 * 15-oct-2026 es el hook GENÉRICO (`components/admin/banco/use-detalle-banco.ts`,
 * compartido con la hoja de las entradas de dinero) con el gasto: turno,
 * `.catch`, cerrar sin vaciar y la descarga del estado de cuenta viven allá.
 */
export const useDetalleBancoGasto = () => useDetalleBanco({ pedir: pedirGasto, clave: claveGasto });

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
              // «Recargar» de «El estado cambió…» (revisión del 15-oct-2026):
              // la hoja guarda la fila del clic y un refresh no la cambia (la
              // franja nunca se iba): se CIERRA y la lista se pone al día.
              onRecargar={() => {
                detalle.cerrar();
                router.refresh();
              }}
              onDescargar={detalle.descargarEstadoCuenta}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
