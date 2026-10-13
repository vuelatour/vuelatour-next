"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { TableRow } from "@/components/ui/table";
import { atributosDeInstantanea, instantaneaFila } from "@/lib/admin/filas-activas";
import type { FilasActivas } from "@/hooks/use-filas-activas";

export interface FilaNavegableProps extends ComponentProps<typeof TableRow> {
  /** Lo que devuelve `useFilasActivas` de ESTA tabla. */
  filas: FilasActivas;
  /** La clave de la fila (la `rowKey`). */
  clave: string;
  /** El href que abre Enter (el mismo del <Link> de la fila). */
  href?: string | null;
}

/**
 * Un <tr> NAVEGABLE de una tabla con fila activa (13-oct-2026, revisión):
 * envuelve `TableRow` tal cual (className y demás props pasan sin cambios) y
 * se suscribe POR FILA a la activa de su tabla (`useSyncExternalStore` sobre
 * `instantaneaFila`, un número: si no cambia, la fila no se repinta). Al
 * cambiar la activa solo se repintan las filas cuya instantánea cambia, y sus
 * celdas (`children`) son los MISMOS elementos del render del padre, así que
 * React no vuelve a entrar en ellas: la tabla entera (100 filas × 13 columnas
 * con menús de Base UI en Gastos) ya no se repinta con cada ↓, clic o foco.
 * En el servidor la instantánea sale del mismo estado (sin activa): el HTML
 * es determinista y la hidratación no difiere.
 */
export function FilaNavegable({ filas, clave, href, ...props }: FilaNavegableProps) {
  const { estado, claves } = filas;
  const leer = () => instantaneaFila(clave, estado.leer(), claves);
  const instantanea = useSyncExternalStore(estado.suscribir, leer, leer);
  return <TableRow {...props} {...atributosDeInstantanea(clave, instantanea, href)} />;
}
