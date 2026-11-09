"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import {
  CorreoEstadoBadge,
  VerContenidoCorreo,
} from "@/components/admin/quotes/correo-contenido";
import {
  PLACEHOLDER_BUSCAR_CORREOS,
  TITULO_ABRIR_VUELO,
  folioTexto,
  hrefVueloDeCorreo,
  nombreLimpio,
  textoBusquedaCorreo,
  textoErrorCorreo,
} from "@/lib/admin/correo-cliente";
import { fmtDateTime } from "@/lib/datetime";
import type { CorreoCliente } from "@/types/correos-cliente";

/**
 * Tabla de «Correos enviados» (9-nov-2026, API 0.0.133): TODOS los correos
 * que se le mandaron a los clientes, más reciente primero (así los entrega el
 * API; la tabla no reordena). «Ver contenido» abre el MISMO diálogo que la
 * card «Correo al cliente» de la cotización y del vuelo.
 */
const columns: Array<DataTableColumn<CorreoCliente>> = [
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "whitespace-nowrap text-sm",
    cell: (c) => fmtDateTime(c.created_at),
  },
  {
    key: "folio",
    header: "Folio",
    cell: (c) =>
      c.folio == null ? (
        <span className="text-muted-foreground">{folioTexto(c.folio)}</span>
      ) : (
        <Link
          href={hrefVueloDeCorreo(c)}
          className="font-mono font-medium underline underline-offset-2 hover:text-foreground"
          title={TITULO_ABRIR_VUELO}
        >
          {folioTexto(c.folio)}
        </Link>
      ),
  },
  {
    key: "cliente",
    header: "Cliente",
    cellClassName: "text-sm",
    cell: (c) => nombreLimpio(c.cliente_nombre) ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "para",
    header: "Para",
    cellClassName: "text-sm break-all",
    cell: (c) => c.destinatario || "—",
  },
  {
    key: "asunto",
    header: "Asunto",
    cellClassName: "text-sm max-w-[22rem]",
    cell: (c) => <span className="line-clamp-2">{c.asunto || "—"}</span>,
  },
  {
    key: "estado",
    header: "Estado",
    cell: (c) => {
      const error = textoErrorCorreo(c);
      return (
        <div className="space-y-1">
          <CorreoEstadoBadge estado={c.estado} />
          {error && (
            <p className="max-w-[16rem] break-words text-[11px] text-destructive">{error}</p>
          )}
        </div>
      );
    },
  },
  {
    key: "enviado_por",
    header: "Enviado por",
    cellClassName: "text-sm",
    cell: (c) =>
      nombreLimpio(c.enviado_por_nombre) ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "contenido",
    header: "",
    noLink: true,
    cellClassName: "text-right",
    cell: (c) => <VerContenidoCorreo correo={c} />,
  },
];

export function CorreosEnviadosTable({
  correos,
  truncado = false,
}: {
  correos: CorreoCliente[];
  /** El API cortó la lista: la búsqueda sin resultados no afirma «no existe». */
  truncado?: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      rows={correos}
      rowKey={(c) => c.id}
      searchText={textoBusquedaCorreo}
      searchPlaceholder={PLACEHOLDER_BUSCAR_CORREOS}
      huboCorte={truncado}
    />
  );
}
