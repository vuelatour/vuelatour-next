"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknotesIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ComprobantePreview,
  EnlaceArchivoFirmado,
} from "@/components/admin/comprobante-preview";
import { PagoSocioDialog, type DialogoPago } from "./pago-socio-dialog";
import { eliminarPagoSocioAction } from "@/app/admin/profit-sharing/actions";
import { adjuntarComprobantePagoSocio } from "@/lib/api/reparto-pagos-browser";
import { motivoComprobanteInvalido, tipoComprobante } from "@/lib/admin/facturas-emitidas";
import {
  CONFIRMAR_REEMPLAZO_COMPROBANTE,
  ETIQUETA_REGISTRAR_PAGO,
  MOTIVO_BAJA_MAX,
  TEXTO_FALLO_RED_BAJA,
  TEXTO_NO_VIGENTE,
  TEXTO_SIN_PAGOS,
  confirmacionEliminarPago,
  errorPideRefrescar,
  etiquetaComprobantePago,
  etiquetaRegistrarPago,
  motivoNoRegistrarPago,
  ordenarPagos,
  piezasPago,
  textoContadorMotivo,
  textoExceso,
  textoUtilidadCambio,
  validarMotivoBaja,
  type UsuarioEntrega,
} from "@/lib/admin/reparto-pagos";
import type { FilaPagoSocio, PagoSocio } from "@/types/reparto-pagos";

const BUCKET = "reparto-comprobantes" as const;

/**
 * Relación de pagos de UN socio en UN avión y UN mes (1-oct-2026): avisos
 * del renglón, cada pago (fecha · monto con moneda y T.C. · método · entregó
 * · recibió/factura · referencia · comprobante) con «Editar» / «Eliminar»
 * (confirma con motivo) y «Registrar pago». Solo pinta lo que manda el API.
 */
export function PagosSocioDetalle({
  fila,
  mes,
  puedeRegistrar,
  usuarios,
  me,
  hoy,
  vigente,
}: {
  fila: FilaPagoSocio;
  mes: string;
  puedeRegistrar: boolean;
  usuarios: UsuarioEntrega[];
  me: UsuarioEntrega;
  hoy: string;
  /** false = ya no es socio vigente del avión (tiene pagos del mes). */
  vigente: boolean;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<(DialogoPago & { clave: string }) | null>(null);
  const [aEliminar, setAEliminar] = useState<PagoSocio | null>(null);
  const contador = useRef(0);

  const abrir = (d: DialogoPago) => {
    contador.current += 1;
    setDialogo({ ...d, clave: `${d.tipo}-${contador.current}` });
  };

  const pagos = ordenarPagos(fila.pagos);
  // El mismo socio sale en varias tarjetas: el nombre accesible lleva la
  // matrícula y el mes.
  const etiquetaRegistrar = etiquetaRegistrarPago({
    socio: fila.socio.nombre,
    matricula: fila.aeronave.matricula,
    mes,
  });
  const cambio = textoUtilidadCambio(fila);
  const exceso = textoExceso(fila.exceso_usd);
  const motivoNoRegistrar = motivoNoRegistrarPago(fila, vigente);
  // El aviso del renglón lo redacta el API (socio no vigente); sin él, el
  // del panel para el socio que ya no es vigente.
  const aviso = fila.aviso?.trim() || (vigente ? null : TEXTO_NO_VIGENTE);

  return (
    <div className="space-y-1.5" data-pagos-socio={fila.socio.id}>
      {(cambio || exceso || aviso) && (
        <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
          {aviso && (
            <li className="flex items-start gap-1" data-aviso-renglon>
              <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {aviso}
            </li>
          )}
          {cambio && (
            <li className="flex items-start gap-1" data-aviso-utilidad-cambio>
              <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {cambio}
            </li>
          )}
          {exceso && (
            <li className="flex items-start gap-1" data-aviso-exceso>
              <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {exceso}
            </li>
          )}
        </ul>
      )}

      {pagos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{TEXTO_SIN_PAGOS}</p>
      ) : (
        <ul className="space-y-1">
          {pagos.map((p) => (
            <PagoRenglon
              key={p.id}
              pago={p}
              puedeRegistrar={puedeRegistrar}
              onEditar={() => abrir({ tipo: "edicion", fila, pago: p })}
              onEliminar={() => setAEliminar(p)}
            />
          ))}
        </ul>
      )}

      {puedeRegistrar &&
        (motivoNoRegistrar ? (
          // Un botón apagado no explica nada (y sin puntero no enseña su
          // `title`): se dice por qué no hay pago que registrar. El socio no
          // vigente ya lo dice su aviso de arriba.
          vigente ? (
            <p className="text-[11px] text-muted-foreground" data-sin-registro-pago>
              {motivoNoRegistrar}
            </p>
          ) : null
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 cursor-pointer gap-1 text-xs"
            data-accion="registrar-pago-socio"
            title={etiquetaRegistrar}
            aria-label={etiquetaRegistrar}
            onClick={() => abrir({ tipo: "alta", fila, mes })}
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden />
            {ETIQUETA_REGISTRAR_PAGO}
          </Button>
        ))}

      {puedeRegistrar && (
        <>
          <PagoSocioDialog
            dialogo={dialogo}
            onCerrar={() => setDialogo(null)}
            usuarios={usuarios}
            me={me}
            hoy={hoy}
          />
          <EliminarPagoDialog
            pago={aEliminar}
            socioNombre={fila.socio.nombre}
            onCerrar={() => setAEliminar(null)}
            onEliminado={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}

function PagoRenglon({
  pago,
  puedeRegistrar,
  onEditar,
  onEliminar,
}: {
  pago: PagoSocio;
  puedeRegistrar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const p = piezasPago(pago);
  const extras = [p.recibio, p.factura, p.referencia].filter(Boolean) as string[];
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
      data-pago-socio-id={pago.id}
    >
      <div className="min-w-0 space-y-0.5 text-xs">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <BanknotesIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{p.fecha}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="font-mono">{p.monto}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span>{p.metodo}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span>{p.entrego}</span>
        </p>
        {extras.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{extras.join(" · ")}</p>
        )}
        {pago.notas && (
          <p className="whitespace-pre-line text-[11px] text-muted-foreground">{pago.notas}</p>
        )}
        <p className="text-[10px] text-muted-foreground/80">{p.registro}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <ComprobantePagoSocio pago={pago} puedeAdjuntar={puedeRegistrar} />
        {puedeRegistrar && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              title="Corregir este pago"
              aria-label={`Editar el pago del ${p.fecha} por ${p.monto}`}
              data-accion="editar-pago-socio"
              onClick={onEditar}
            >
              <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden />
              Editar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              title="Eliminar este pago (capturado por error)"
              aria-label={`Eliminar el pago del ${p.fecha} por ${p.monto}`}
              data-accion="eliminar-pago-socio"
              onClick={onEliminar}
            >
              <TrashIcon className="h-3.5 w-3.5" aria-hidden />
              Eliminar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Confirmación con MOTIVO (5–300). El DELETE sale SOLO de aquí. */
function EliminarPagoDialog({
  pago,
  socioNombre,
  onCerrar,
  onEliminado,
}: {
  pago: PagoSocio | null;
  socioNombre: string;
  onCerrar: () => void;
  onEliminado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const textos = pago ? confirmacionEliminarPago(pago, socioNombre) : null;
  const invalido = validarMotivoBaja(motivo);
  const contador = textoContadorMotivo(motivo);

  const cerrar = () => {
    setMotivo("");
    setError(null);
    onCerrar();
  };

  return (
    <Dialog open={pago !== null} onOpenChange={(o) => !o && !eliminando && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{textos?.titulo}</DialogTitle>
          <DialogDescription>{textos?.descripcion}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-baja-pago" className="text-sm font-medium">
            ¿Por qué se elimina?<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            id="motivo-baja-pago"
            rows={2}
            maxLength={MOTIVO_BAJA_MAX}
            placeholder="Ej. Se capturó dos veces el mismo pago."
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
          />
          {/* El botón apagado no tiene puntero ni enseña su `title`: el mínimo
              se DICE aquí («3/300 · mínimo 5»). */}
          <p
            className={`text-xs ${
              contador.falta && motivo.trim().length > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
            data-contador-motivo
          >
            {contador.texto}
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={eliminando}
            onClick={cerrar}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="cursor-pointer"
            disabled={eliminando || invalido !== null}
            title={invalido ?? undefined}
            data-accion="confirmar-eliminar-pago-socio"
            onClick={async () => {
              if (!pago) return;
              setEliminando(true);
              let res: Awaited<ReturnType<typeof eliminarPagoSocioAction>>;
              try {
                res = await eliminarPagoSocioAction(pago.id, motivo);
              } catch {
                // La LLAMADA falló (red, 502): sin esto el diálogo quedaba
                // «Eliminando…» y sin poder cerrarse.
                setEliminando(false);
                setError(TEXTO_FALLO_RED_BAJA);
                return;
              }
              setEliminando(false);
              if (res.ok) {
                toast.success("Pago eliminado; el pendiente del socio se recalculó.");
                cerrar();
                onEliminado();
                return;
              }
              if (errorPideRefrescar(res.code)) {
                toast.info(res.error);
                cerrar();
                onEliminado();
                return;
              }
              setError(res.error ?? "No se pudo eliminar el pago.");
            }}
          >
            {eliminando ? "Eliminando…" : textos?.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Comprobante de UN pago: miniatura (imagen) / «PDF» / «HEIC» con URL firmada
 * que se renueva sola; oficina adjunta o reemplaza (confirma; el anterior se
 * conserva en el bucket). La subida va del navegador DIRECTO al API.
 */
function ComprobantePagoSocio({
  pago,
  puedeAdjuntar,
}: {
  pago: PagoSocio;
  puedeAdjuntar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const path = pago.comprobante_path;
  const url = pago.comprobante_url;

  const subir = async (file: File) => {
    const motivo = motivoComprobanteInvalido(file);
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSubiendo(true);
    const res = await adjuntarComprobantePagoSocio(pago.id, file);
    setSubiendo(false);
    if (!res.ok) {
      toast.error(res.error);
      if (errorPideRefrescar(res.code)) router.refresh();
      return;
    }
    toast.success("Comprobante adjuntado");
    router.refresh();
  };

  const vista = (() => {
    if (!path) return null;
    if (!url) {
      return (
        <span
          className="inline-flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted-foreground"
          title="No se pudo preparar el enlace del comprobante; recarga la página."
        >
          <DocumentTextIcon className="h-3.5 w-3.5" aria-hidden />
          Con comprobante
        </span>
      );
    }
    if (tipoComprobante(path) === "heic") {
      return (
        <EnlaceArchivoFirmado
          bucket={BUCKET}
          path={path}
          url={url}
          title="Comprobante del pago (HEIC: se abre en otra pestaña o se descarga)"
          etiqueta="HEIC"
        />
      );
    }
    return (
      <ComprobantePreview
        bucket={BUCKET}
        path={path}
        url={url}
        alt="Comprobante del pago al socio"
        thumbClassName="h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
      />
    );
  })();

  return (
    <>
      {vista}
      {puedeAdjuntar && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground"
            disabled={subiendo}
            data-accion="comprobante-pago-socio"
            aria-label={etiquetaComprobantePago(pago)}
            title={
              path
                ? "Cambiar el comprobante por otro (el anterior se guarda por seguridad)"
                : "Adjunta la foto o el PDF de la transferencia, el cheque o el recibo firmado"
            }
            onClick={() => (path ? setConfirmarReemplazo(true) : inputRef.current?.click())}
          >
            <PaperClipIcon className="h-3.5 w-3.5" aria-hidden />
            {subiendo ? "Subiendo…" : path ? "Reemplazar" : "Adjuntar comprobante"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf,.heic,.heif"
            className="hidden"
            aria-label="Elegir el comprobante del pago"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subir(f);
            }}
          />
          <AlertDialog
            open={confirmarReemplazo}
            onOpenChange={(o) => !o && setConfirmarReemplazo(false)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRMAR_REEMPLAZO_COMPROBANTE.titulo}</AlertDialogTitle>
                <AlertDialogDescription>
                  {CONFIRMAR_REEMPLAZO_COMPROBANTE.descripcion}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="cursor-pointer"
                  onClick={() => {
                    setConfirmarReemplazo(false);
                    // En el MISMO gesto del clic: el navegador deja abrir el
                    // selector de archivos.
                    inputRef.current?.click();
                  }}
                >
                  {CONFIRMAR_REEMPLAZO_COMPROBANTE.boton}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
