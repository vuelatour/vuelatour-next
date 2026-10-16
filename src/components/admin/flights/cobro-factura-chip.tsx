"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { urlArchivoFacturaAction } from "@/app/admin/facturas-emitidas/actions";
import {
  abrirArchivoFirmado,
  puedeRegistrarFactura,
  puedeVerPdfFactura,
} from "@/lib/admin/facturas-emitidas";
import {
  BOTON_ASIGNAR_FACTURA,
  TEXTO_COBRO_SIN_FACTURA,
  TITULO_COBRO_SIN_FACTURA,
  asignacionDisponible,
  cobroAsignable,
  textoChipFacturaCobro,
  tituloChipFacturaCobro,
  tonoSinFactura,
} from "@/lib/admin/cobro-factura";
import type { FacturaServicioBloque } from "@/types/facturas-emitidas";
import type { FlightCobro } from "@/types/flights";

const CLASE_VERDE =
  "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300";
const CLASE_TONO = {
  ambar: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  gris: "border-border bg-muted/40 text-muted-foreground",
} as const;

/**
 * FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API): qué
 * factura AMPARA cada cobro, debajo de la línea «método · → cuenta ·
 * referencia» de las cards de cobros del VUELO y de la COTIZACIÓN (las dos
 * dicen lo mismo). Pedido del cliente (captura de #332: 4 cobros, UNA
 * «Factura A-0420»): «unos pagos son con una factura y a lo mejor otro con
 * otra».
 *
 *  - Con factura ⇒ chip verde «Factura A-0420»; clic = el PDF si la mini del
 *    bloque dice `tiene_pdf` y el rol puede abrirlo.
 *  - Sin factura, el vuelo tiene ≥ 1 vigente y el API puede asignar ⇒ chip
 *    «Sin factura asignada» (ámbar o gris: `tonoSinFactura`) + «Asignar
 *    factura» para ADMIN/FACTURACION (abre «Corregir cobro» con el foco en
 *    el selector); los demás roles solo ven el chip.
 *  - Sin factura y sin vigentes ⇒ nada (la burbuja ya dice «Sin factura»).
 *  - Reembolsos y partes de sobre ⇒ nada. Sin la llave `factura_emitida` en
 *    el cobro (API previo) ⇒ nada: la card queda byte-igual a hoy.
 */
export function CobroFacturaChip({
  cobro,
  bloque,
  rol,
  onAsignar,
}: {
  cobro: FlightCobro;
  bloque: FacturaServicioBloque | null | undefined;
  rol: string | null | undefined;
  /** Abre el formulario del cobro en edición con el foco en «Factura». */
  onAsignar?: (cobro: FlightCobro) => void;
}) {
  if (cobro.factura_emitida === undefined || !cobroAsignable(cobro)) return null;

  const texto = textoChipFacturaCobro(cobro);
  if (texto && cobro.factura_emitida) {
    const factura = cobro.factura_emitida;
    const mini = bloque?.facturas.find((f) => f.id === factura.id);
    const abrePdf = mini?.tiene_pdf === true && puedeVerPdfFactura(rol);
    const title = tituloChipFacturaCobro(factura.etiqueta);
    const verPdf = () => {
      void abrirArchivoFirmado(() => urlArchivoFacturaAction(factura.id, "pdf")).then((r) => {
        if (!r.ok) toast.error(r.error);
        else if (!r.abierta) {
          toast.info(`La factura ${factura.etiqueta} está lista`, {
            action: { label: "Abrir PDF", onClick: () => window.open(r.url, "_blank") },
          });
        }
      });
    };
    return (
      <p className="mt-1 text-[11px]">
        {abrePdf ? (
          <button
            type="button"
            data-cobro-factura={factura.id}
            onClick={verPdf}
            className={`${CLASE_VERDE} cursor-pointer hover:bg-emerald-500/20`}
            title={`${title} · Abrir el PDF`}
          >
            Factura <span className="ml-1 font-mono tabular-nums">{factura.etiqueta}</span>
          </button>
        ) : (
          <span data-cobro-factura={factura.id} className={CLASE_VERDE} title={title}>
            Factura <span className="ml-1 font-mono tabular-nums">{factura.etiqueta}</span>
          </span>
        )}
      </p>
    );
  }

  // Sin factura: solo si hay vigentes que asignar y el API puede hacerlo.
  if (!bloque || bloque.facturas.length === 0 || !asignacionDisponible(bloque)) return null;
  const tono = tonoSinFactura(bloque);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        data-cobro-sin-factura={tono}
        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${CLASE_TONO[tono]}`}
        title={TITULO_COBRO_SIN_FACTURA}
      >
        {TEXTO_COBRO_SIN_FACTURA}
      </span>
      {onAsignar && puedeRegistrarFactura(rol) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 cursor-pointer px-2 text-[11px] text-muted-foreground hover:text-foreground"
          data-accion="asignar-factura"
          onClick={() => onAsignar(cobro)}
          title="Elige cuál de las facturas del vuelo ampara este cobro"
        >
          {BOTON_ASIGNAR_FACTURA}
        </Button>
      )}
    </p>
  );
}
