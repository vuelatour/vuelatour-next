"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { conciliacionDeEntradaAction } from "@/app/admin/conciliacion/actions";
import { useDetalleBanco } from "@/components/admin/banco/use-detalle-banco";
import {
  TEXTO_CARGANDO_ENTRADA,
  claveEntradaControlada,
  descripcionHojaEntrada,
  lineaPagoEntrada,
  lineaRegistroEntrada,
  type EntradaBancoFila,
} from "@/lib/admin/entrada-banco";
import { TITULO_HOJA_BANCO } from "@/lib/admin/hoja-banco";

/**
 * El cuerpo se carga al PRIMER clic (`next/dynamic`, sin SSR, el precedente de
 * Gastos): las tablas de Ingresos y las tarjetas de cobros no pagan ese código
 * hasta que alguien abre un badge. Lo comparten la hoja y la sección embebida
 * del detalle `?ingreso=`.
 */
export const EntradaBancoDetalleDinamico = dynamic(
  () => import("./entrada-banco-detalle").then((m) => m.EntradaBancoDetalle),
  {
    ssr: false,
    loading: () => (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {TEXTO_CARGANDO_ENTRADA}
      </p>
    ),
  },
);

/** Lo que pide la hoja de una entrada (función de MÓDULO: estable para el hook). */
export const pedirEntrada = (f: EntradaBancoFila) => conciliacionDeEntradaAction(f.origen, f.id);
/** La llave de una respuesta en la hoja: origen + id. */
export const claveEntrada = (f: EntradaBancoFila) => `${f.origen}:${f.id}`;
/**
 * La llave del MODO CONTROLADO (cuerpo embebido en `?ingreso=`):
 * `claveEntradaControlada` — origen + id + el abono que conoce la lista y lo
 * que pinta el cuerpo (cuenta, día, monto, moneda y estado). Tras
 * «Desvincular del abono» o tras «Editar» la cuenta, la fecha o el monto en el
 * MISMO detalle, `router.refresh()` cambia la fila y el cuerpo se vuelve a
 * pedir solo (revisión del 15-oct-2026).
 */
export const claveEntradaConAbono = (f: EntradaBancoFila) => claveEntradaControlada(f);

/**
 * Estado de la hoja «Conciliación con el banco» de una ENTRADA de dinero
 * (15-oct-2026, API 0.0.78, invariante 78): el hook GENÉRICO con la entrada.
 * UNA hoja por tabla y por tarjeta.
 */
export const useDetalleBancoEntrada = () => useDetalleBanco({ pedir: pedirEntrada, clave: claveEntrada });

export type DetalleBancoEntrada = ReturnType<typeof useDetalleBancoEntrada>;

/**
 * La hoja lateral «Conciliación con el banco» de un cobro de vuelo (también la
 * parte de un sobre o el cobro de un anticipo) o de un ingreso: qué entrada es
 * (vuelo o ING · categoría · monto · fecha · cliente), con qué se pagó y quién
 * la registró; el cuerpo es `EntradaBancoDetalle`. Solo lectura: no hay
 * acción destructiva que confirmar.
 */
export function EntradaBancoSheet({ detalle }: { detalle: DetalleBancoEntrada }) {
  const router = useRouter();
  const datos = detalle.resultado?.ok ? (detalle.resultado.data ?? null) : null;
  const encabezado = datos?.entrada ?? detalle.fila;
  const pago = lineaPagoEntrada(encabezado);
  const registro = lineaRegistroEntrada(datos?.entrada ?? null);
  return (
    <Sheet open={detalle.abierto} onOpenChange={(o) => !o && detalle.cerrar()}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <div className="flex flex-col gap-4 p-4">
          <SheetHeader className="p-0 pr-8">
            <SheetTitle>{TITULO_HOJA_BANCO}</SheetTitle>
            <SheetDescription>
              {descripcionHojaEntrada(encabezado)}
              {pago && <span className="block text-xs">{pago}</span>}
              {registro && <span className="block text-xs">{registro}</span>}
            </SheetDescription>
          </SheetHeader>
          {detalle.fila && (
            <EntradaBancoDetalleDinamico
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
