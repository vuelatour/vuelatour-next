"use client";

import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "@/components/ui/table";
import { FondoActions } from "./fondo-actions";
import type { CajaFondo } from "@/types/caja-chica";

const money = (n: number, moneda: string) =>
  n.toLocaleString("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 2 });

export function FondoRow({
  fondo,
  usuarios,
}: {
  fondo: CajaFondo;
  usuarios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  return (
    <TableRow
      onClick={() => router.push(`/admin/caja-chica/${fondo.id}`)}
      className="cursor-pointer"
    >
      <TableCell className="font-medium">{fondo.usuario?.nombre ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{fondo.usuario?.rol ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{fondo.moneda}</TableCell>
      <TableCell
        className={`text-right tabular-nums font-medium ${fondo.saldo < 0 ? "text-destructive" : ""}`}
      >
        {money(fondo.saldo, fondo.moneda)}
      </TableCell>
      {/* La celda de acciones no debe navegar al abrir el menú. */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <FondoActions fondo={fondo} usuarios={usuarios} />
      </TableCell>
    </TableRow>
  );
}
