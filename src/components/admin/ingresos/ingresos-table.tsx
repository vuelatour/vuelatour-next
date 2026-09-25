"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightCircleIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  PaperClipIcon,
  PencilSquareIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { BadgeEstadoConciliacion } from "@/components/admin/ingresos/entradas-table";
import {
  RegistrarIngresoDialog,
  type CatalogosIngreso,
} from "@/components/admin/ingresos/registrar-ingreso-dialog";
import { BajaIngresoDialog } from "@/components/admin/ingresos/baja-ingreso-dialog";
import { AplicarAnticipoDialog } from "@/components/admin/ingresos/aplicar-anticipo-dialog";
import { archivoIngresoUrlAction } from "@/app/admin/ingresos/actions";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import { CATEGORIA_INGRESO_DESTINO, esAnticipo, etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { hrefIngresos, type FiltrosIngresos } from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Ingreso } from "@/types/ingresos";

export type AccionIngreso = "editar" | "reclasificar" | "baja" | "aplicar";

/** Abre el comprobante con URL firmada SIN que Safari bloquee la ventana. */
export async function verComprobanteIngreso(id: string): Promise<void> {
  const r = await abrirArchivoFirmado(() => archivoIngresoUrlAction(id));
  if (!r.ok) {
    toast.error(r.error);
    return;
  }
  if (!r.abierta) {
    toast("El navegador no abrió la pestaña", {
      action: { label: "Abrir comprobante", onClick: () => window.open(r.url, "_blank") },
    });
  }
}

/**
 * Menú ⋯ de un ingreso (Otros ingresos, Anticipos y el detalle). Solo pinta
 * lo que aplica: «Aplicar a vuelo» en anticipos con saldo, «Reclasificar» en
 * anticipos sin aplicaciones (penalización sin vuelo ⇒ «Otros ingresos»),
 * nada de escribir en un ingreso dado de baja.
 */
export function IngresoMenu({
  ingreso,
  filtros,
  onAccion,
}: {
  ingreso: Ingreso;
  filtros: FiltrosIngresos;
  onAccion: (accion: AccionIngreso, ingreso: Ingreso) => void;
}) {
  const router = useRouter();
  const vivo = !ingreso.baja;
  const ant = esAnticipo(ingreso.categoria);
  const conSaldo = (ingreso.anticipo?.saldo ?? 0) > 0.005;
  const sinAplicaciones = (ingreso.anticipo?.aplicaciones_n ?? 0) === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <EllipsisHorizontalIcon className="h-4 w-4" />
        <span className="sr-only">Acciones del ingreso</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {ant && vivo && conSaldo && (
          <DropdownMenuItem onClick={() => onAccion("aplicar", ingreso)} className="cursor-pointer gap-2">
            <ArrowRightCircleIcon className="h-4 w-4" />
            Aplicar a vuelo
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => router.push(hrefIngresos(filtros, { ingreso: ingreso.id }), { scroll: false })}
          className="cursor-pointer gap-2"
        >
          <EyeIcon className="h-4 w-4" />
          Ver
        </DropdownMenuItem>
        {vivo && (
          <DropdownMenuItem onClick={() => onAccion("editar", ingreso)} className="cursor-pointer gap-2">
            <PencilSquareIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
        )}
        {ant && vivo && sinAplicaciones && (
          <DropdownMenuItem onClick={() => onAccion("reclasificar", ingreso)} className="cursor-pointer gap-2">
            <TagIcon className="h-4 w-4" />
            Reclasificar
          </DropdownMenuItem>
        )}
        {ingreso.archivo && (
          <DropdownMenuItem onClick={() => void verComprobanteIngreso(ingreso.id)} className="cursor-pointer gap-2">
            <PaperClipIcon className="h-4 w-4" />
            Ver comprobante
          </DropdownMenuItem>
        )}
        {vivo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onAccion("baja", ingreso)}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4" />
              Dar de baja
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Los diálogos de las acciones de un ingreso (UNA instancia por tabla). */
export function DialogosIngreso({
  estado,
  onCerrar,
  catalogos,
}: {
  estado: { accion: AccionIngreso; ingreso: Ingreso } | null;
  onCerrar: () => void;
  catalogos: CatalogosIngreso;
}) {
  if (!estado) return null;
  const { accion, ingreso } = estado;
  if (accion === "editar" || accion === "reclasificar") {
    return (
      <RegistrarIngresoDialog
        {...catalogos}
        open
        onOpenChange={(o) => !o && onCerrar()}
        ingreso={ingreso}
      />
    );
  }
  if (accion === "baja") {
    return <BajaIngresoDialog ingreso={ingreso} open onOpenChange={(o) => !o && onCerrar()} />;
  }
  return (
    <AplicarAnticipoDialog anticipo={ingreso} open onOpenChange={(o) => !o && onCerrar()} />
  );
}

/** Categoría + destino en verde (como el selector de Gastos). */
export function CeldaCategoriaIngreso({ ingreso }: { ingreso: Ingreso }) {
  return (
    <span className="block min-w-[160px]">
      <span className="block text-sm">{ingreso.categoria_etiqueta}</span>
      <span className="block text-[10px] leading-tight text-green-600 dark:text-green-400">
        {CATEGORIA_INGRESO_DESTINO[ingreso.categoria] ?? ""}
      </span>
    </span>
  );
}

/**
 * «Otros ingresos» (24-sep-2026): todo lo que NO es anticipo — otros
 * ingresos, intereses del banco, reembolsos recibidos, venta de activos y
 * aportaciones. La conciliación y los totales los decide el API.
 */
export function IngresosTable({
  ingresos,
  filtros,
  catalogos,
  huboCorte,
}: {
  ingresos: Ingreso[];
  filtros: FiltrosIngresos;
  catalogos: CatalogosIngreso;
  huboCorte?: boolean;
}) {
  const [estado, setEstado] = useState<{ accion: AccionIngreso; ingreso: Ingreso } | null>(null);

  const columns = useMemo<Array<DataTableColumn<Ingreso>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (i) => fmtDateOnly(i.fecha),
      },
      {
        key: "ing",
        header: "ING",
        noLink: true,
        cell: (i) => (
          <span className="block whitespace-nowrap">
            <Link
              href={hrefIngresos(filtros, { ingreso: i.id })}
              scroll={false}
              className="font-medium text-brand-600 hover:underline"
            >
              {i.etiqueta || etiquetaIngreso(i.folio)}
            </Link>
            {i.baja && (
              <Badge variant="outline" className="ml-1 border-destructive/40 text-[10px] text-destructive" title={i.baja.motivo}>
                Dado de baja
              </Badge>
            )}
          </span>
        ),
      },
      { key: "categoria", header: "Categoría", cell: (i) => <CeldaCategoriaIngreso ingreso={i} /> },
      {
        key: "concepto",
        header: "Concepto",
        cellClassName: "max-w-[240px]",
        cell: (i) => (
          <span className="block truncate text-sm" title={i.descripcion}>
            {i.descripcion}
          </span>
        ),
      },
      {
        key: "quien",
        header: "Cliente / Pagador",
        cellClassName: "text-sm",
        cell: (i) => i.cliente_nombre ?? i.pagador ?? "—",
      },
      {
        key: "cuenta",
        header: "Cuenta",
        cellClassName: "whitespace-nowrap text-xs text-muted-foreground",
        cell: (i) => (i.cuenta ? i.cuenta.alias : "Efectivo / caja"),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        cell: (i) => (
          <span className={cn("block font-mono", i.baja ? "text-muted-foreground line-through" : "font-semibold")}>
            {fmtMonto(i.monto, i.moneda)}
            {i.comision_monto != null && i.comision_monto > 0 && (
              <span className="block text-[10px] font-sans font-normal text-muted-foreground">
                neto {fmtMonto(i.neto)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        cell: (i) => <BadgeEstadoConciliacion estado={i.conciliacion.estado} />,
      },
      {
        key: "archivo",
        header: "Comp.",
        noLink: true,
        cell: (i) =>
          i.archivo ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Ver comprobante: ${i.archivo.nombre}`}
              aria-label="Ver comprobante"
              onClick={() => void verComprobanteIngreso(i.id)}
            >
              <PaperClipIcon className="h-4 w-4" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        cell: (i) => (
          <IngresoMenu
            ingreso={i}
            filtros={filtros}
            onAccion={(accion, ingreso) => setEstado({ accion, ingreso })}
          />
        ),
      },
    ],
    [filtros],
  );

  return (
    <>
      <DataTable
        syncId="oi"
        columns={columns}
        rows={ingresos}
        rowKey={(i) => i.id}
        rowClassName={(i) => (i.baja ? "opacity-60" : undefined)}
        searchText={(i) =>
          `${i.etiqueta} ${i.categoria_etiqueta} ${i.descripcion} ${i.cliente_nombre ?? ""} ${i.pagador ?? ""} ${
            i.referencia ?? ""
          } ${i.monto}`
        }
        searchPlaceholder="Buscar (ING-n, concepto, pagador, referencia, monto)…"
        huboCorte={huboCorte}
      />
      <DialogosIngreso estado={estado} onCerrar={() => setEstado(null)} catalogos={catalogos} />
    </>
  );
}
