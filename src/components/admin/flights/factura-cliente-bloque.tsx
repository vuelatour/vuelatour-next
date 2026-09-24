"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fmtDate } from "@/lib/datetime";
import {
  FACTURA_CLIENTE_ESTADOS,
  LIMITE_FOLIO_FACTURA,
  RAZON_BLOQUEO_CFDI,
  estadoFacturaCliente,
  estatusFacturaCliente,
  normalizarFolio,
  ofreceCapturarFolio,
  soportaFolio,
  textoArchivoFactura,
  type EstatusFacturaCliente,
} from "@/lib/admin/factura-cliente";
import {
  quitarFacturaClienteAction,
  setFacturaClienteEstatusAction,
  setFacturaClienteFolioAction,
  urlFacturaClienteAction,
} from "@/app/admin/flights/actions";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import type { FacturaClienteBloque as Bloque } from "@/types/flights";

/**
 * FACTURA DEL SERVICIO del vuelo, dentro de la card «Cobro» (22-sep-2026).
 *
 * Pedido del cliente: «agregar por cada vuelo las opciones para identificar
 * vuelos facturado, sin factura, factura elaborada y enviada, y que pueda yo
 * también subir la factura del servicio a un lado».
 *
 * 24-sep-2026 — FOLIO + subida confiable. «Subí la factura de un vuelo,
 * peroooo al momento de descargar el reporte en Excel … no aparece el folio
 * de la factura que subí en el registro.» Dos cosas:
 *  - el FOLIO se captura al subir (prellenado del XML del CFDI), se corrige
 *    con el lápiz y se puede capturar SIN archivo cuando el vuelo ya está
 *    Facturado / Elaborada y enviada; se ve junto al archivo («Folio A-1234 ·
 *    factura.pdf · subió Itzi · 23 sep»);
 *  - la subida ya NO es una server action (Vercel la cortaría arriba de 4.5
 *    MB y el error no se veía): va directo al API y solo se celebra si el
 *    API confirmó el archivo (hoy lo hace el registro de facturas emitidas,
 *    `lib/api/facturas-emitidas-browser.ts`).
 *  - El #297 (logs de Supabase del 23-sep): su PDF SÍ se subió y 9 minutos
 *    después alguien lo QUITÓ con «Quitar» (borrado duro del bucket). Por eso
 *    la confirmación de «Quitar» dice que no se puede deshacer.
 *
 * Reglas:
 *  - El estatus es de OFICINA y se cambia con un clic (reversible con el
 *    mismo control, sin confirmación).
 *  - Con CFDI timbrado (`facturado`) el selector va DESHABILITADO en
 *    «Facturado» y se explica por qué (409 `VUELO_CON_CFDI`).
 *  - El archivo vive en un bucket PRIVADO: «Ver» pide una URL firmada al
 *    momento (10 min); nunca se guarda una URL pública en el HTML.
 *  - «Quitar» el archivo y BORRAR el folio CONFIRMAN (regla del cliente).
 *  - Con un API sin folio (llave ausente) no se ofrece ni se manda folio.
 *
 * 24-sep-2026 (noche) — FACTURAS EMITIDAS. La factura del servicio ya se
 * REGISTRA en «Facturas emitidas» (número, UUID, PDF, varios vuelos): la
 * «burbuja» de la card (`FacturaServicioBurbuja`) pinta el número y abre el
 * diálogo «Registrar factura». Por eso este bloque:
 *  - ya NO sube archivos (el diálogo viejo «Subir factura» se borró);
 *  - se rotula «Seguimiento manual» cuando existe el registro (`conRegistro`)
 *    para no presentar dos «facturas» al mismo nivel, y deja de ofrecer
 *    «Agregar folio» (el folio vive en el registro);
 *  - conserva el selector de estatus y el archivo/folio LEGADOS (Ver/Quitar).
 */
export function FacturaClienteBloque({
  flightId,
  facturaCliente,
  facturado,
  puedeEditar,
  conRegistro = false,
}: {
  flightId: string;
  /** Bloque del API; `undefined` = API sin desplegar (no se pinta nada). */
  facturaCliente?: Bloque | null;
  facturado: boolean;
  /** ADMIN / COORDINADOR / FACTURACION. Sin permiso: solo lectura. */
  puedeEditar: boolean;
  /**
   * El API ya trae el registro de facturas emitidas (`factura_servicio`):
   * el bloque se rotula «Seguimiento manual» y no ofrece «Agregar folio».
   */
  conRegistro?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [editandoFolio, setEditandoFolio] = useState(false);
  const [folioBorrador, setFolioBorrador] = useState("");
  const [confirmarBorrarFolio, setConfirmarBorrarFolio] = useState(false);

  const estatus = estatusFacturaCliente({ facturado, factura_cliente: facturaCliente });
  const info = estadoFacturaCliente(estatus);
  const archivo = facturaCliente?.archivo ?? null;
  const conFolio = soportaFolio(facturaCliente);
  const folio = conFolio ? normalizarFolio(facturaCliente?.folio) : null;
  const uuid = conFolio ? (facturaCliente?.uuid ?? null) : null;
  const bloqueado = facturado;
  const ocupado = pendiente;
  // Con el registro de facturas emitidas el folio vive allá; el lápiz queda
  // solo para CORREGIR un folio legado que ya existe.
  const puedeFolio =
    puedeEditar &&
    conFolio &&
    (conRegistro
      ? !!folio
      : ofreceCapturarFolio({ estatus, tieneArchivo: !!archivo }));

  const cambiar = (v: EstatusFacturaCliente) => {
    if (v === estatus) return;
    startTransition(async () => {
      const res = await setFacturaClienteEstatusAction(flightId, v);
      if (res.ok) {
        toast.success(`Factura del servicio: ${estadoFacturaCliente(v).label}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cambiar el estatus de la factura");
      }
    });
  };

  const abrirFolio = () => {
    setFolioBorrador(folio ?? "");
    setEditandoFolio(true);
  };

  const guardarFolio = (valor: string | null) => {
    startTransition(async () => {
      const res = await setFacturaClienteFolioAction(flightId, valor);
      setConfirmarBorrarFolio(false);
      if (res.ok) {
        toast.success(valor ? `Folio guardado: ${valor}` : "Folio borrado");
        setEditandoFolio(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar el folio");
      }
    });
  };

  const enviarFolio = () => {
    const nuevo = normalizarFolio(folioBorrador);
    if (nuevo === folio) {
      setEditandoFolio(false);
      return;
    }
    // Vaciar un folio que existía es BORRAR un dato: se confirma.
    if (!nuevo && folio) {
      setConfirmarBorrarFolio(true);
      return;
    }
    guardarFolio(nuevo);
  };

  // La ventana se abre en el MISMO clic y luego recibe la URL firmada: un
  // `window.open` después del `await` lo bloquea Safari (24-sep-2026).
  const ver = () => {
    void abrirArchivoFirmado(() => urlFacturaClienteAction(flightId)).then((r) => {
      if (!r.ok) toast.error(r.error || "No se pudo abrir la factura");
      else if (!r.abierta) {
        toast.info("La factura está lista", {
          action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
        });
      }
    });
  };

  const quitar = () => {
    startTransition(async () => {
      const res = await quitarFacturaClienteAction(flightId);
      setConfirmarQuitar(false);
      if (res.ok) {
        toast.success("Archivo de la factura quitado.");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo quitar el archivo");
      }
    });
  };

  const renglon = archivo
    ? textoArchivoFactura(archivo, fmtDate(archivo.subida_at), folio)
    : folio
      ? `Folio ${folio} · sin archivo cargado`
      : "Sin archivo de factura cargado.";
  const tituloRenglon = [renglon, uuid ? `Folio fiscal (UUID): ${uuid}` : null]
    .filter(Boolean)
    .join("\n");
  // Con el registro de facturas emitidas, el renglón del archivo LEGADO solo
  // se pinta si de verdad hay algo legado (archivo o folio): «Sin archivo
  // de factura cargado» junto a una factura registrada confundiría.
  const conRenglonLegado = !conRegistro || !!archivo || !!folio;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          title={
            conRegistro
              ? "Seguimiento manual de oficina (no timbra nada). La factura registrada se ve arriba."
              : undefined
          }
        >
          <DocumentTextIcon className="h-3.5 w-3.5" />
          {conRegistro ? "Seguimiento manual" : "Factura del servicio"}
        </span>
        {puedeEditar && !bloqueado ? (
          <div className="min-w-[230px]">
            <SearchableSelect
              options={FACTURA_CLIENTE_ESTADOS.map((e) => ({
                value: e.value,
                label: e.labelForm,
                description: e.ayuda,
              }))}
              value={estatus}
              onChange={(v) => cambiar(v as EstatusFacturaCliente)}
              placeholder="Estatus de la factura"
              disabled={ocupado}
            />
          </div>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${info.pill}`}
            title={bloqueado ? RAZON_BLOQUEO_CFDI : info.ayuda}
          >
            {info.label}
          </span>
        )}
        {bloqueado && (
          <span className="text-[11px] text-muted-foreground" title={RAZON_BLOQUEO_CFDI}>
            CFDI timbrado en el sistema: el estatus se queda en «Facturado».
          </span>
        )}
      </div>

      {conRenglonLegado && (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="min-w-0 max-w-[340px] truncate text-[11px] text-muted-foreground"
          title={tituloRenglon}
        >
          {renglon}
        </span>
        {puedeFolio && !editandoFolio && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-muted-foreground"
            onClick={abrirFolio}
            disabled={ocupado}
            title={
              folio
                ? "Corregir el folio de la factura (es el que sale en el Excel)"
                : "Capturar el folio de la factura (es el que sale en el Excel)"
            }
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
            {folio ? <span className="sr-only">Corregir folio</span> : "Agregar folio"}
          </Button>
        )}
        {archivo && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={ver}
              disabled={ocupado}
              title="Abre la factura en otra pestaña (enlace firmado, 10 minutos)"
            >
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              Ver
            </Button>
            {puedeEditar && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmarQuitar(true)}
                disabled={ocupado}
                title="Quitar el archivo de la factura"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Quitar
              </Button>
            )}
          </>
        )}
      </div>
      )}

      {editandoFolio && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviarFolio();
          }}
        >
          <label
            className="cursor-pointer text-[11px] text-muted-foreground"
            htmlFor={`folio-${flightId}`}
          >
            Folio de la factura
          </label>
          <Input
            id={`folio-${flightId}`}
            value={folioBorrador}
            maxLength={LIMITE_FOLIO_FACTURA}
            placeholder="Ej. A-1234"
            className="h-7 w-44 text-xs"
            autoFocus
            onChange={(e) => setFolioBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditandoFolio(false);
            }}
            disabled={ocupado}
          />
          <Button type="submit" size="sm" className="h-7" disabled={ocupado}>
            {ocupado ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setEditandoFolio(false)}
            disabled={ocupado}
          >
            Cancelar
          </Button>
        </form>
      )}

      <AlertDialog open={confirmarQuitar} onOpenChange={(o) => !o && setConfirmarQuitar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el archivo de la factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el archivo que está guardado en el vuelo
              {archivo?.nombre ? ` (${archivo.nombre})` : ""} y NO se puede recuperar: para
              tenerlo otra vez habría que volver a subirlo. Si solo quieres cambiarlo por otro, usa
              «Reemplazar factura». El estatus y el folio de la factura no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={quitar}
              disabled={ocupado}
            >
              Quitar archivo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmarBorrarFolio}
        onOpenChange={(o) => !o && setConfirmarBorrarFolio(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el folio {folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              El vuelo se queda sin folio de factura y el Excel dejará de mostrarlo (saldrá solo el
              estatus). El archivo, si lo hay, no se toca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => guardarFolio(null)}
              disabled={ocupado}
            >
              Borrar folio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
