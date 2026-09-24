"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
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
import { retirarSolicitudFacturaAction } from "@/app/admin/flights/actions";
import { urlArchivoFacturaAction } from "@/app/admin/facturas-emitidas/actions";
import {
  abrirArchivoFirmado,
  avisarCambioPorFacturar,
  puedePedirFactura,
  puedeRegistrarFactura,
  puedeVerPdfFactura,
  textoCanceladas,
  textoPedidaPor,
  textoSolicitud,
} from "@/lib/admin/facturas-emitidas";
import { NecesitoFacturaDialog } from "./necesito-factura-dialog";
import { RegistrarFacturaDialog } from "./registrar-factura-dialog";
import type { FacturaEmitidaMini, FacturaServicioBloque } from "@/types/facturas-emitidas";

/**
 * «Burbujita» de FACTURA dentro de la card de cobros (24-sep-2026, pedido de
 * Itzi: «visualmente afuerita nada más diga el número de la factura y ya si
 * le picas ves el PDF»). La usan la card de cobros de la cotización y la del
 * detalle del vuelo.
 *
 *  - Facturas VIGENTES ⇒ un chip verde «Factura A-123» por factura; clic =
 *    el PDF (URL firmada, ventana abierta en el mismo clic).
 *  - Pedida y sin factura ⇒ chip ámbar «Factura pedida por Itzi · 24 sep —
 *    pendiente» (+ «Paga contra factura») y «Retirar» (confirma).
 *  - Nada ⇒ «Sin factura» + «Necesito factura».
 *  - Facturación (ADMIN/FACTURACION) ve «Registrar factura» con el vuelo ya
 *    elegido.
 *
 * `bloque` ausente o `null` (API previo o sin la migración) ⇒ no se pinta
 * NADA: ofrecer un botón que el API rechazaría es peor que no tenerlo.
 */
export function FacturaServicioBurbuja({
  vueloId,
  vueloFolio,
  vueloEstado,
  clienteId,
  clienteNombre,
  fechaVuelo,
  grupo,
  bloque,
  rol,
}: {
  vueloId: string;
  vueloFolio: number;
  vueloEstado: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  fechaVuelo?: string | null;
  grupo?: { id: string; total_aviones: number } | null;
  bloque: FacturaServicioBloque | null | undefined;
  rol: string | null | undefined;
}) {
  const router = useRouter();
  const [pedirAbierto, setPedirAbierto] = useState(false);
  const [registrarAbierto, setRegistrarAbierto] = useState(false);
  const [confirmarRetirar, setConfirmarRetirar] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (!bloque) return null;

  const puedePedir = puedePedirFactura(rol);
  const puedeRegistrar = puedeRegistrarFactura(rol);
  const puedeVerPdf = puedeVerPdfFactura(rol);
  const cancelado = vueloEstado === "CANCELADO";
  const vigentes = bloque.facturas;
  const solicitud = bloque.solicitud;

  const verPdf = (f: FacturaEmitidaMini) => {
    void abrirArchivoFirmado(() => urlArchivoFacturaAction(f.id, "pdf")).then((r) => {
      if (!r.ok) toast.error(r.error);
      else if (!r.abierta) {
        toast.info(`La factura ${f.etiqueta} está lista`, {
          action: { label: "Abrir PDF", onClick: () => window.open(r.url, "_blank") },
        });
      }
    });
  };

  const retirar = () => {
    startTransition(async () => {
      const res = await retirarSolicitudFacturaAction(vueloId);
      setConfirmarRetirar(false);
      if (res.ok) {
        toast.success(`El vuelo #${vueloFolio} salió de «Por facturar».`);
        avisarCambioPorFacturar();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo retirar la solicitud.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <DocumentTextIcon className="h-3.5 w-3.5" />
        Factura
      </span>

      {vigentes.length > 0 ? (
        <>
          {vigentes.map((f) =>
            f.tiene_pdf && puedeVerPdf ? (
              <button
                key={f.id}
                type="button"
                onClick={() => verPdf(f)}
                className="inline-flex cursor-pointer items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                title={`Abrir el PDF de la factura ${f.etiqueta}${f.uuid ? ` · Folio fiscal ${f.uuid}` : ""}`}
              >
                Factura <span className="ml-1 font-mono tabular-nums">{f.etiqueta}</span>
              </button>
            ) : (
              <span
                key={f.id}
                className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                title={f.tiene_pdf ? "Solo oficina abre el PDF" : "La factura está registrada pero todavía no tiene PDF"}
              >
                Factura <span className="ml-1 font-mono tabular-nums">{f.etiqueta}</span>
                {!f.tiene_pdf && <span className="ml-1 font-normal">· sin PDF</span>}
              </span>
            ),
          )}
          {solicitud && (
            <span className="text-[11px] text-muted-foreground">{textoPedidaPor(solicitud)}</span>
          )}
        </>
      ) : solicitud ? (
        <>
          <span
            className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
            title={solicitud.nota ? `Nota: ${solicitud.nota}` : undefined}
          >
            {textoSolicitud(solicitud)}
          </span>
          {solicitud.paga_contra_factura && (
            <span className="inline-flex items-center rounded-full border border-amber-600/50 bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              Paga contra factura
            </span>
          )}
          {puedePedir && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => setConfirmarRetirar(true)}
              disabled={pendiente}
            >
              Retirar
            </Button>
          )}
        </>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground">Sin factura</span>
          {puedePedir && !cancelado && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setPedirAbierto(true)}
            >
              Necesito factura
            </Button>
          )}
        </>
      )}

      {bloque.canceladas > 0 &&
        (puedeRegistrar ? (
          <Link
            href={`/admin/facturas-emitidas?vuelo_id=${vueloId}`}
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {textoCanceladas(bloque.canceladas)}
          </Link>
        ) : (
          <span className="text-[11px] text-muted-foreground">{textoCanceladas(bloque.canceladas)}</span>
        ))}

      {puedeRegistrar && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-7"
          onClick={() => setRegistrarAbierto(true)}
          title="Registra la factura que se le hizo al cliente (con su PDF)"
        >
          Registrar factura
        </Button>
      )}

      {pedirAbierto && (
        <NecesitoFacturaDialog
          open={pedirAbierto}
          onOpenChange={setPedirAbierto}
          vueloId={vueloId}
          vueloFolio={vueloFolio}
          grupo={grupo}
        />
      )}

      {registrarAbierto && (
        <RegistrarFacturaDialog
          open={registrarAbierto}
          onOpenChange={setRegistrarAbierto}
          modo="crear"
          vuelosPreseleccionados={[
            {
              id: vueloId,
              folio: vueloFolio,
              fecha_vuelo: fechaVuelo ?? null,
              cliente_id: clienteId ?? null,
              cliente_nombre: clienteNombre ?? null,
              estado: vueloEstado,
            },
          ]}
        />
      )}

      <AlertDialog open={confirmarRetirar} onOpenChange={(o) => !o && setConfirmarRetirar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar la solicitud de factura?</AlertDialogTitle>
            <AlertDialogDescription>
              El vuelo #{vueloFolio} sale de «Por facturar». Si ya le avisaste a facturación, dile
              que ya no hace falta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={retirar}
              disabled={pendiente}
            >
              {pendiente ? "Retirando…" : "Retirar solicitud"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
