import Link from "next/link";
import {
  TITULO_VER_VUELO_DE_ENTREGA,
  etiquetaEntrega,
  hrefVueloDeEntrega,
} from "@/lib/admin/reparto-pagos";
import type { PagoSocio } from "@/types/reparto-pagos";

/**
 * CÓMO se entregó una entrega a un socio, en la misma frase en toda pantalla
 * que la pinta (estado de cuenta y entregas por avión): «Transferencia»,
 * «Efectivo»… y, si nació de un VUELO que el socio pagó con sus utilidades
 * (23-nov-2026, API 0.0.148, `pago.vuelo`), «Vuelo #482 · pagado con
 * utilidades» con liga a la card «Cobro» de ese vuelo — ahí se corrige o se
 * quita —. Texto y destino: `etiquetaEntrega` / `hrefVueloDeEntrega`
 * (`lib/admin/reparto-pagos.ts`); aquí solo se pinta.
 */
export function EtiquetaEntrega({ pago }: { pago: Pick<PagoSocio, "metodo" | "vuelo"> }) {
  const texto = etiquetaEntrega(pago);
  const href = hrefVueloDeEntrega(pago);
  if (!href) return <span>{texto}</span>;
  return (
    <Link
      href={href}
      className="cursor-pointer underline underline-offset-2 hover:text-foreground"
      title={TITULO_VER_VUELO_DE_ENTREGA}
      data-entrega-vuelo={pago.vuelo?.id ?? ""}
    >
      {texto}
    </Link>
  );
}
