"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon, LinkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { BancoBadge } from "@/components/admin/expenses/banco-badge";
import { GastoBancoSheet, useDetalleBancoGasto } from "@/components/admin/expenses/gasto-banco-sheet";
import { puedeVerDetalleBancoGasto } from "@/lib/admin/gasto-banco";
import {
  removePagoCompraAction,
  updatePagoRolAction,
} from "@/app/admin/inventory/compras/actions";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtTc } from "@/lib/format";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { MEDIO_PAGO_LABELS } from "@/lib/admin/medios-pago";
import { hrefGastoEnfocado } from "@/lib/admin/gasto-enfocado";
import {
  COMPRA_ROL_OPTIONS,
  fmtMontoMoneda,
  type CompraDetalle,
  type CompraPago,
  type CompraRol,
} from "@/types/compras";
import {
  BOTON_AGREGAR_GASTO,
  BOTON_VINCULAR_GASTO,
  DESCRIPCION_GASTOS_COMPRA,
  ETIQUETA_SUMA_GASTOS,
  ETIQUETA_TOTAL_COMPRA,
  TITULO_ABRIR_GASTO,
  TITULO_BOTON_AGREGAR_GASTO,
  TITULO_GASTOS_COMPRA,
  VACIO_GASTOS_COMPRA,
} from "@/lib/admin/compras-estado";
import { CompraAgregarGastoDialog } from "./compra-agregar-gasto-dialog";
import { CompraPagoAddDialog } from "./compra-pago-add-dialog";

/**
 * LOS GASTOS DE LA COMPRA (4-nov-2026, API 0.0.120): la factura de las
 * refacciones y los demás pagos (el envío de UPS en pesos, la aduana…), cada
 * uno un gasto real en Gastos con su comprobante y su cruce bancario. Aquí
 * se agregan («Agregar gasto» crea el gasto; «Vincular gasto ya registrado»
 * liga uno existente), se desligan y se corrige el rol; el gasto se edita en
 * /admin/expenses (enlace por fila). El total de la compra es informativo.
 * «Registrar gasto» (la mercancía) vive en las acciones de arriba.
 */
export function CompraPagosCard({
  compra,
  fotoUrls,
  rolUsuario = null,
  providers = [],
  tcOficialHoy = null,
}: {
  compra: CompraDetalle;
  /** URLs firmadas de las facturas (bucket privado) por path. */
  fotoUrls: Record<string, string>;
  /** Rol de quien mira (de `/me`; null si falló). No se llama `rol`: ese
      nombre ya es el `CompraRol` del pago dentro de este componente. */
  rolUsuario?: string | null;
  /** Para «Agregar gasto» (proveedor del pago y T.C. sugerido). */
  providers?: { id: string; nombre: string }[];
  tcOficialHoy?: number | null;
}) {
  const router = useRouter();
  // «Conciliación al revés» (13-oct-2026): el MISMO badge «Banco» de Gastos;
  // con clic solo para quien concilia (Compras es de ADMIN y COORDINADOR, así
  // que aquí solo ADMIN lo tiene). UNA hoja para todo el card.
  const detalleBanco = useDetalleBancoGasto();
  const abrirBanco = puedeVerDetalleBancoGasto(rolUsuario) ? detalleBanco.abrir : null;
  const [pending, startTransition] = useTransition();
  const [openAdd, setOpenAdd] = useState(false);
  const [openAgregar, setOpenAgregar] = useState(false);
  const [quitar, setQuitar] = useState<CompraPago | null>(null);

  const cambiarRol = (p: CompraPago, rol: CompraRol) => {
    if (rol === p.compra_rol) return;
    startTransition(async () => {
      // PATCH atómico del rol: si falla, el pago sigue ligado con su rol
      // anterior (antes era DELETE + POST y podía quedar desligado).
      const r = await updatePagoRolAction(compra.id, p.id, rol);
      if (r.ok) toast.success("Rol del pago actualizado");
      else toast.error(r.error ?? "No se pudo cambiar el rol");
      router.refresh();
    });
  };

  const confirmarQuitar = () => {
    if (!quitar) return;
    startTransition(async () => {
      const r = await removePagoCompraAction(compra.id, quitar.id);
      if (r.ok) {
        toast.success("Pago desligado de la compra");
        setQuitar(null);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo quitar el pago");
      }
    });
  };

  // Totales por moneda (nunca se mezclan MXN y USD).
  const totales = compra.pagos.reduce<Record<string, number>>((acc, p) => {
    acc[p.moneda] = (acc[p.moneda] ?? 0) + Number(p.monto);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">
              {TITULO_GASTOS_COMPRA}{" "}
              <span className="text-sm font-normal text-muted-foreground">({compra.pagos.length})</span>
            </CardTitle>
            <CardDescription>{DESCRIPCION_GASTOS_COMPRA}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setOpenAgregar(true)}
              title={TITULO_BOTON_AGREGAR_GASTO}
              data-accion="agregar-gasto"
            >
              <PlusIcon className="h-4 w-4" />
              {BOTON_AGREGAR_GASTO}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpenAdd(true)} data-accion="vincular">
              <LinkIcon className="h-4 w-4" />
              {BOTON_VINCULAR_GASTO}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {compra.pagos.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground" data-sin-pagos>
            {VACIO_GASTOS_COMPRA}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Pagó</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {compra.pagos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateOnly(p.fecha_gasto)}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <SearchableSelect
                      options={COMPRA_ROL_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label.split(" (")[0],
                      }))}
                      value={p.compra_rol}
                      onChange={(v) => cambiarRol(p, v as CompraRol)}
                      className="h-8"
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>{categoriaGastoLabel(p.categoria)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtMontoMoneda(p.monto, p.moneda)}
                    {p.moneda !== compra.moneda && p.tc_gasto != null && (
                      <p className="text-[10px] text-muted-foreground">TC {fmtTc(p.tc_gasto)}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{MEDIO_PAGO_LABELS[p.medio_pago] ?? p.medio_pago}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="block max-w-[180px] truncate" title={p.notas ?? undefined}>
                      {p.proveedor?.nombre ?? ((p.notas ?? "").split("\n")[0].trim() || "—")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.foto_url && fotoUrls[p.foto_url] ? (
                      <ComprobantePreview
                        bucket="gasto-fotos"
                        path={p.foto_url}
                        url={fotoUrls[p.foto_url]}
                        alt={`Factura · ${p.categoria}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin foto</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* La fuente única del estado (Conciliado / Sin
                        conciliar / «—» en efectivo). El API de compras no
                        manda lo ligado: un pago parcial se ve «Sin conciliar»
                        y la hoja dice la verdad. */}
                    <BancoBadge gasto={p} alAbrir={abrirBanco ? () => abrirBanco(p) : undefined} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {/* El gasto se edita (comprobante, factura, banco) en Gastos: ahí va resaltado. */}
                    <Link
                      href={hrefGastoEnfocado({ id: p.id, fecha_gasto: p.fecha_gasto })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 hover:bg-muted dark:text-brand-400"
                      title={TITULO_ABRIR_GASTO}
                      aria-label={TITULO_ABRIR_GASTO}
                      data-abrir-gasto={p.id}
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setQuitar(p)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                      title="Quitar de la compra"
                      disabled={pending}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {compra.pagos.length > 0 && (
          // Pie en dos renglones (feedback 5-sep-2026: «no sé si es el total o
          // solo la mercancía»): la suma de TODOS los pagos por moneda y, aparte,
          // el total de la compra que calcula el API (mercancía + envío +
          // impuestos al TC de la compra). Aquí solo se pinta.
          <div className="space-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span>{ETIQUETA_SUMA_GASTOS}</span>
              <span className="flex flex-wrap gap-x-3">
                {Object.entries(totales).map(([moneda, total]) => (
                  <span key={moneda} className="font-medium text-foreground tabular-nums">
                    {fmtMontoMoneda(total, moneda)}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span>
                {ETIQUETA_TOTAL_COMPRA}{" "}
                <span className="text-[11px]">
                  (refacciones {fmtMontoMoneda(compra.resumen.total_mercancia, compra.resumen.moneda)}
                  {" + "}envío e impuestos{" "}
                  {fmtMontoMoneda(
                    Number(compra.resumen.cargos_factura) + Number(compra.resumen.cargos_pagos),
                    compra.resumen.moneda,
                  )}
                  {compra.resumen.tc_usd_mxn ? ` · TC ${Number(compra.resumen.tc_usd_mxn).toFixed(4)}` : ""}
                  )
                </span>
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {fmtMontoMoneda(compra.resumen.total, compra.resumen.moneda)}
                {compra.resumen.moneda === "USD" && compra.resumen.total_mxn != null && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ≈ {fmtMontoMoneda(compra.resumen.total_mxn, "MXN")}
                  </span>
                )}
                {compra.resumen.moneda === "MXN" && compra.resumen.total_usd != null && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ≈ {fmtMontoMoneda(compra.resumen.total_usd, "USD")}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>

      <CompraPagoAddDialog
        open={openAdd}
        onOpenChange={setOpenAdd}
        compraId={compra.id}
        folio={compra.folio}
      />
      <CompraAgregarGastoDialog
        open={openAgregar}
        onOpenChange={setOpenAgregar}
        compra={compra}
        providers={providers}
        tcOficialHoy={tcOficialHoy}
      />

      <GastoBancoSheet detalle={detalleBanco} />

      <AlertDialog open={quitar !== null} onOpenChange={(o) => !o && setQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular este gasto de la compra?</AlertDialogTitle>
            <AlertDialogDescription>
              El gasto no se borra: vuelve a ser un gasto suelto en Gastos. El costo de las refacciones
              se recalcula sin este cargo y, si era la factura de mercancía, la compra vuelve a quedar
              «Sin gasto registrado».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarQuitar();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar pago"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
