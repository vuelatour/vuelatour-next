"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EllipsisHorizontalIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtMonto, fmtMxn } from "@/lib/format";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { retirarSolicitudFacturaAction } from "@/app/admin/flights/actions";
import {
  avisarCambioPorFacturar,
  fechaCortaCancun,
  puedePedirFactura,
  puedeRegistrarFactura,
  semaforoDeCobro,
  textoFaltanDatosFiscales,
} from "@/lib/admin/facturas-emitidas";
import {
  RegistrarFacturaDialog,
  type ClienteOpcion,
  type EmisoraOpcion,
} from "./registrar-factura-dialog";
import type { VueloSeleccionado } from "./selector-vuelos-factura";
import type { PorFacturarItem } from "@/types/facturas-emitidas";

function vueloDeItem(it: PorFacturarItem): VueloSeleccionado {
  return {
    id: it.vuelo.id,
    folio: it.vuelo.folio,
    fecha_vuelo: it.vuelo.fecha_vuelo,
    cliente_id: it.cliente?.id ?? null,
    cliente_nombre: it.cliente?.nombre ?? null,
    estado: it.vuelo.estado,
    total: it.total,
    grupo: it.vuelo.grupo,
  };
}

function datosFiscales(c: NonNullable<PorFacturarItem["cliente"]>): string {
  return [
    c.rfc ? `RFC ${c.rfc}` : null,
    c.razon_social,
    c.regimen_fiscal ? `Régimen ${c.regimen_fiscal}` : null,
    c.uso_cfdi ? `Uso ${c.uso_cfdi}` : null,
    c.codigo_postal ? `CP ${c.codigo_postal}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * «POR FACTURAR» (24-sep-2026, pedido de Itzi): los vuelos donde alguien
 * marcó «Necesito factura» y todavía no tienen factura registrada. Primero
 * los que pagan contra factura, luego la solicitud más vieja (orden del
 * API). Con los datos fiscales del cliente a la vista para que Mari no tenga
 * que buscarlos, y «Registrar factura» con el vuelo (y, en un grupo, sus
 * hermanos pendientes) ya elegido.
 *
 * `resaltar` (link de la notificación) pone esa fila primero, con un anillo
 * ámbar, y la lleva a la vista.
 */
export function PorFacturarTable({
  items,
  rol,
  resaltar,
  clientes,
  emisoras,
}: {
  items: PorFacturarItem[];
  rol: string | null;
  resaltar?: string;
  clientes?: ClienteOpcion[];
  emisoras?: EmisoraOpcion[];
}) {
  const router = useRouter();
  const [registrarPara, setRegistrarPara] = useState<VueloSeleccionado[] | null>(null);
  const [retirar, setRetirar] = useState<PorFacturarItem | null>(null);
  const [pendiente, startTransition] = useTransition();
  const puedeRegistrar = puedeRegistrarFactura(rol);
  const puedeRetirar = puedePedirFactura(rol);

  // La fila de la notificación va PRIMERO (la tabla pagina y podría quedar en
  // otra página) y se trae a la vista al montar.
  const filas = useMemo(() => {
    if (!resaltar) return items;
    const i = items.findIndex((it) => it.vuelo.id === resaltar);
    if (i <= 0) return items;
    return [items[i], ...items.slice(0, i), ...items.slice(i + 1)];
  }, [items, resaltar]);

  useEffect(() => {
    if (!resaltar) return;
    const el = document.getElementById(`por-facturar-${resaltar}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltar]);

  const abrirRegistrar = (it: PorFacturarItem) => {
    // En un grupo, los hermanos que TAMBIÉN están por facturar entran solos
    // (el cliente paga el grupo como uno).
    const grupoId = it.vuelo.grupo?.id;
    const hermanos = grupoId
      ? items.filter((x) => x.vuelo.grupo?.id === grupoId && x.vuelo.id !== it.vuelo.id)
      : [];
    setRegistrarPara([vueloDeItem(it), ...hermanos.map(vueloDeItem)]);
  };

  const confirmarRetiro = () => {
    if (!retirar) return;
    const it = retirar;
    startTransition(async () => {
      const res = await retirarSolicitudFacturaAction(it.vuelo.id);
      if (res.ok) {
        toast.success(`El vuelo #${it.vuelo.folio} salió de «Por facturar».`);
        setRetirar(null);
        avisarCambioPorFacturar();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo retirar la solicitud.");
      }
    });
  };

  const columns: Array<DataTableColumn<PorFacturarItem>> = [
    {
      key: "vuelo",
      header: "Vuelo",
      noLink: true,
      cell: (it) => (
        <span id={`por-facturar-${it.vuelo.id}`} className="inline-flex scroll-mt-24 flex-col gap-0.5">
          <Link
            href={`/admin/quotes/${it.vuelo.id}`}
            className="font-mono text-sm font-medium hover:underline underline-offset-2"
          >
            #{it.vuelo.folio}
          </Link>
          <span className="text-[11px] text-muted-foreground">
            {it.vuelo.fecha_vuelo ? fmtDate(it.vuelo.fecha_vuelo) : "Sin fecha"}
          </span>
          {it.vuelo.ruta_iatas.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {it.vuelo.ruta_iatas.join(" → ")}
            </span>
          )}
          {it.vuelo.grupo && it.vuelo.grupo.total_aviones > 1 && (
            <span className="w-fit rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
              {folioTexto(it.vuelo.grupo.folio)} · {it.vuelo.grupo.total_aviones} aviones
            </span>
          )}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      cell: (it) => {
        const faltan = textoFaltanDatosFiscales(it.faltan_datos_fiscales);
        return it.cliente ? (
          <span className="inline-flex max-w-[280px] flex-col gap-0.5">
            <span className="text-sm font-medium">{it.cliente.nombre}</span>
            {datosFiscales(it.cliente) && (
              <span className="text-[11px] text-muted-foreground">{datosFiscales(it.cliente)}</span>
            )}
            {faltan && (
              <span
                className="w-fit rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                title={`${faltan}. Pídeselos al cliente o captúralos en Catálogos → Clientes.`}
              >
                {faltan}
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      headClassName: "text-right",
      cellClassName: "text-right whitespace-nowrap",
      cell: (it) => (
        <span className="inline-flex flex-col items-end">
          <span className="font-mono text-sm tabular-nums">
            {it.total.usd > 0 ? fmtMonto(it.total.usd, "USD") : "Sin precio"}
          </span>
          {it.total.mxn != null && it.total.mxn > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {fmtMxn(it.total.mxn)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "cobro",
      header: "Cobro",
      cell: (it) => <CobroEstadoBadge estado={semaforoDeCobro(it.cobro)} />,
    },
    {
      key: "pedida",
      header: "Pedida",
      cell: (it) => {
        const quien = it.solicitud.solicitada_por?.nombre?.trim();
        const cuando = fechaCortaCancun(it.solicitud.solicitada_at);
        return (
          <span className="inline-flex max-w-[240px] flex-col gap-1">
            <span className="text-xs">{[quien, cuando].filter(Boolean).join(" · ") || "—"}</span>
            {it.solicitud.nota && (
              <span
                className="truncate text-[11px] text-muted-foreground"
                title={it.solicitud.nota}
              >
                {it.solicitud.nota}
              </span>
            )}
            {it.solicitud.paga_contra_factura && (
              <span className="w-fit rounded-full border border-amber-600/50 bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                Paga contra factura
              </span>
            )}
            {it.vuelo.estatus_manual === "FACTURADO" && (
              <span
                className="w-fit rounded-full border border-border bg-muted/40 px-1.5 text-[10px] text-muted-foreground"
                title="En el vuelo lo marcaron «Facturado» a mano, pero no hay factura registrada aquí."
              >
                Marcado «Facturado» sin factura registrada
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "acciones",
      header: "",
      noLink: true,
      cellClassName: "text-right",
      cell: (it) => (
        <span className="inline-flex items-center justify-end gap-1">
          {puedeRegistrar && (
            <Button type="button" size="sm" variant="outline" onClick={() => abrirRegistrar(it)}>
              Registrar factura
            </Button>
          )}
          {puedeRetirar && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Más acciones del vuelo #${it.vuelo.folio}`}
                title="Más acciones"
              >
                <EllipsisHorizontalIcon className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setRetirar(it)}
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Retirar solicitud
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={filas}
        rowKey={(it) => it.vuelo.id}
        syncId="pf"
        defaultPageSize={50}
        rowClassName={(it) =>
          it.vuelo.id === resaltar ? "ring-2 ring-inset ring-amber-400 bg-amber-500/5" : undefined
        }
      />

      {registrarPara && (
        <RegistrarFacturaDialog
          open={registrarPara !== null}
          onOpenChange={(o) => !o && setRegistrarPara(null)}
          modo="crear"
          vuelosPreseleccionados={registrarPara}
          clientes={clientes}
          emisoras={emisoras}
        />
      )}

      <AlertDialog open={retirar !== null} onOpenChange={(o) => !o && !pendiente && setRetirar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar la solicitud de factura?</AlertDialogTitle>
            <AlertDialogDescription>
              El vuelo #{retirar?.vuelo.folio} sale de «Por facturar». Si ya le avisaste a
              facturación, dile que ya no hace falta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmarRetiro}
              disabled={pendiente}
            >
              {pendiente ? "Retirando…" : "Retirar solicitud"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
