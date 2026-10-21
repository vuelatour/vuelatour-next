import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMxn } from "@/lib/format";
import { etiquetaMetodoPagoSocio, piezasPago, textoMontoPago } from "@/lib/admin/reparto-pagos";
import { nombreSocioDeEntrega, textoMesEntrega } from "@/lib/admin/reparto-avion";
import type { PagoSocio } from "@/types/reparto-pagos";
import { ComprobanteEntrega } from "./comprobante-entrega";

/**
 * Entregas que «corresponden a» este avión (pantalla del avión y su
 * histórico, 20-oct-2026, API 0.0.101): fecha, socio, monto EN PESOS (una
 * entrega en dólares dice «$1,000 USD = $18,500.00 MXN»), método,
 * «corresponde a» mes, quién entregó y el comprobante (la oficina puede
 * adjuntarlo desde aquí). Editar y eliminar siguen en la cuenta del socio.
 */
export function EntregasAvionTable({
  entregas,
  socios,
  puedeAdjuntar,
  vacio,
}: {
  entregas: PagoSocio[];
  socios: ReadonlyArray<{ socio_id: string; socio_nombre: string }>;
  puedeAdjuntar: boolean;
  vacio: string;
}) {
  if (entregas.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <Table data-tabla-entregas-avion>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Socio</TableHead>
          <TableHead className="text-right">Monto (MXN)</TableHead>
          <TableHead>Método</TableHead>
          <TableHead>Corresponde a</TableHead>
          <TableHead>Entregó</TableHead>
          <TableHead>Comprobante</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entregas.map((p) => {
          const piezas = piezasPago(p);
          const extras = [piezas.recibio, piezas.factura, piezas.referencia].filter(Boolean) as string[];
          return (
            <TableRow key={p.id} data-entrega-avion={p.id}>
              <TableCell className="whitespace-nowrap align-top text-xs">{fmtDateOnly(p.fecha_pago)}</TableCell>
              <TableCell className="min-w-[9rem] whitespace-normal align-top text-sm font-medium">
                {nombreSocioDeEntrega(p, socios)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right align-top font-mono text-sm">
                {fmtMxn(p.monto_mxn)}
                {p.moneda !== "MXN" && (
                  <span className="mt-0.5 block font-sans text-[10px] font-normal text-muted-foreground">
                    {textoMontoPago(p)}
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap align-top text-xs">{etiquetaMetodoPagoSocio(p.metodo)}</TableCell>
              <TableCell className="whitespace-nowrap align-top text-xs">{textoMesEntrega(p)}</TableCell>
              <TableCell className="min-w-[10rem] whitespace-normal align-top text-xs">
                {piezas.entrego}
                {extras.length > 0 && (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{extras.join(" · ")}</span>
                )}
                {p.notas && <span className="mt-0.5 block whitespace-pre-line text-[11px] text-muted-foreground">{p.notas}</span>}
              </TableCell>
              <TableCell className="align-top">
                <span className="inline-flex items-center gap-1">
                  <ComprobanteEntrega pago={p} puedeAdjuntar={puedeAdjuntar} />
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
