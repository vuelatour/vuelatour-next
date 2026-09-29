"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/form-field";
import {
  actualizarSeguimientoAction,
  crearSeguimientoAction,
  eliminarSeguimientoAction,
} from "@/app/admin/flights/actions";
import {
  ANCLA_SEGUIMIENTO,
  AVISO_NOTA_INEXISTENTE,
  confirmacionEliminarSeguimiento,
  contarSeguimiento,
  DESCRIPCION_SEGUIMIENTO,
  esNotaInexistente,
  esResuelta,
  estadoSeguimientoUi,
  ETIQUETA_AFECTA_COTIZACION,
  ordenarSeguimiento,
  PLACEHOLDER_SEGUIMIENTO,
  puedeEditarSeguimiento,
  recortarTexto,
  RESOLUCION_MAX,
  TEXTO_NOTA_MAX,
  textoAutoria,
  textoContadorPendientes,
  TITULO_SEGUIMIENTO,
  validarResolucion,
  validarTextoNota,
} from "@/lib/admin/seguimiento";
import type { SeguimientoNota } from "@/types/seguimiento";

/**
 * «SEGUIMIENTO DE LA COTIZACIÓN» en el detalle del vuelo (29-sep-2026, API
 * 0.0.43). Pedido del cliente con la captura del #358, señalando la columna
 * derecha bajo «Pasajeros»: «un apartado para poner unas notas que se deben
 * agregar a la cotización. Ej. Pablo ya terminó el vuelito de hoy y los pax
 * pidieron un transporte que no está incluido en la cotización pero se
 * necesita cobrar».
 *
 * - Lista: PENDIENTES arriba (ámbar), luego RESUELTAS (verde, con quién,
 *   cuándo y cómo se resolvió). Orden y colores: `lib/admin/seguimiento.ts`.
 * - Formulario: texto + switch «Debe reflejarse en la cotización» (ON por
 *   defecto; las que afectan la cotización salen en el banner ámbar del
 *   cotizador y en el pre-cierre) + «Agregar nota».
 * - Acciones: «Marcar resuelta» (diálogo con «¿Cómo se resolvió?»
 *   opcional), «Reabrir» y eliminar CON CONFIRMACIÓN (regla del cliente).
 * - `notas === null` = la carga FALLÓ: se dice y se ofrece Reintentar; jamás
 *   «Sin notas» (sería mentir). La página no pinta la card con un API previo.
 * - SOCIO/ANALISTA leen sin formulario ni acciones (`puedeEditarSeguimiento`).
 */
export function FlightSeguimientoCard({
  flightId,
  flightFolio,
  notas,
  rol,
}: {
  flightId: string;
  flightFolio: number;
  /** Lista del API; null = la carga falló. */
  notas: SeguimientoNota[] | null;
  rol: string | null;
}) {
  const router = useRouter();
  const puedeEditar = puedeEditarSeguimiento(rol);
  const ordenadas = notas ? ordenarSeguimiento(notas) : null;
  const conteo = notas ? contarSeguimiento(notas) : null;

  const [resolviendo, setResolviendo] = useState<SeguimientoNota | null>(null);
  const [borrando, setBorrando] = useState<SeguimientoNota | null>(null);
  const [pendingFila, startFila] = useTransition();
  const [pendingBorrar, startBorrar] = useTransition();
  const [refrescando, startRefresh] = useTransition();

  const reabrir = (nota: SeguimientoNota) => {
    startFila(async () => {
      const res = await actualizarSeguimientoAction(flightId, nota.id, { estado: "PENDIENTE" });
      if (res.ok) toast.success("Nota reabierta: vuelve a quedar pendiente");
      else if (esNotaInexistente(res)) {
        // Otra persona la eliminó: la lista estaba vieja.
        toast.info(AVISO_NOTA_INEXISTENTE);
        router.refresh();
      } else toast.error(res.error ?? "No se pudo reabrir la nota");
    });
  };

  // Solo el botón «Eliminar» del diálogo llega aquí: el bote de basura de
  // cada nota únicamente abre la confirmación (`setBorrando`).
  const confirmarEliminar = () => {
    if (!borrando) return;
    const id = borrando.id;
    startBorrar(async () => {
      const res = await eliminarSeguimientoAction(flightId, id);
      if (res.ok) {
        toast.success("Nota eliminada");
        setBorrando(null);
      } else if (esNotaInexistente(res)) {
        // Ya la había eliminado alguien más: lo pedido ya ocurrió. Se cierra
        // el diálogo y se refresca (sin revalidar, la lista seguía vieja).
        toast.info(AVISO_NOTA_INEXISTENTE);
        setBorrando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo eliminar la nota");
      }
    });
  };

  const confirmacion = borrando ? confirmacionEliminarSeguimiento(borrando) : null;

  return (
    <Card id={ANCLA_SEGUIMIENTO} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          <ClipboardDocumentCheckIcon className="h-4 w-4 text-muted-foreground" />
          {TITULO_SEGUIMIENTO}
          {conteo && conteo.pendientes > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
              data-seguimiento-contador
            >
              {textoContadorPendientes(conteo.pendientes)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">{DESCRIPCION_SEGUIMIENTO}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordenadas === null ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
          >
            <span className="text-destructive">
              No se pudieron cargar las notas de seguimiento.
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={refrescando}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <ArrowPathIcon className={refrescando ? "animate-spin" : undefined} />
              {refrescando ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        ) : ordenadas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin notas de seguimiento en el vuelo #{flightFolio}.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Notas de seguimiento">
            {ordenadas.map((n) => (
              <NotaItem
                key={n.id}
                nota={n}
                puedeEditar={puedeEditar}
                ocupado={pendingFila}
                onResolver={() => setResolviendo(n)}
                onReabrir={() => reabrir(n)}
                onEliminar={() => setBorrando(n)}
              />
            ))}
          </ul>
        )}

        {puedeEditar && <NuevaNotaForm flightId={flightId} />}
      </CardContent>

      {resolviendo && (
        <ResolverNotaDialog
          key={resolviendo.id}
          flightId={flightId}
          nota={resolviendo}
          onClose={() => setResolviendo(null)}
        />
      )}

      <AlertDialog open={!!borrando} onOpenChange={(v) => !v && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacion?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmacion?.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingBorrar}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarEliminar();
              }}
              disabled={pendingBorrar}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pendingBorrar ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Una nota de la lista (exportada para las pruebas de estructura). */
export function NotaItem({
  nota,
  puedeEditar,
  ocupado = false,
  onResolver,
  onReabrir,
  onEliminar,
}: {
  nota: SeguimientoNota;
  puedeEditar: boolean;
  ocupado?: boolean;
  onResolver: () => void;
  onReabrir: () => void;
  onEliminar: () => void;
}) {
  const resuelta = esResuelta(nota);
  const estado = estadoSeguimientoUi(nota.estado);
  return (
    <li
      data-seguimiento-estado={resuelta ? "RESUELTA" : "PENDIENTE"}
      className={`space-y-1.5 rounded-lg border p-3 ${
        resuelta ? "border-border bg-muted/20" : "border-amber-500/40 bg-amber-500/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`min-w-0 text-sm whitespace-pre-wrap break-words ${
            resuelta ? "text-muted-foreground" : ""
          }`}
        >
          {nota.texto}
        </p>
        <Badge variant="outline" className={`shrink-0 text-[10px] ${estado.cls}`}>
          {estado.label}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {textoAutoria(nota.creado_por, nota.created_at)}
        {nota.afecta_cotizacion === false && (
          <span title="No se refleja en la cotización: no sale en el aviso del cotizador ni en el pre-cierre.">
            {" "}
            · Solo seguimiento
          </span>
        )}
      </p>
      {resuelta && (
        <p className="text-[11px] text-green-700 dark:text-green-400">
          Resuelta por {textoAutoria(nota.resuelta_por, nota.resuelta_at)}
        </p>
      )}
      {resuelta && nota.resolucion && (
        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
          ↳ {nota.resolucion}
        </p>
      )}
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {resuelta ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={ocupado}
              onClick={onReabrir}
              title="Vuelve a dejarla pendiente"
            >
              <ArrowUturnLeftIcon />
              Reabrir
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={ocupado}
              onClick={onResolver}
              title="Ya se agregó a la cotización o ya se cobró"
            >
              <CheckCircleIcon />
              Marcar resuelta
            </Button>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={ocupado}
            onClick={onEliminar}
            title="Eliminar nota"
            aria-label="Eliminar nota"
          >
            <TrashIcon />
          </Button>
        </div>
      )}
    </li>
  );
}

/** Formulario de alta (exportado para las pruebas de estructura). */
export function NuevaNotaForm({ flightId }: { flightId: string }) {
  const switchId = useId();
  const [texto, setTexto] = useState("");
  const [afecta, setAfecta] = useState(true);
  const [pending, startTransition] = useTransition();
  const vacio = texto.trim().length === 0;

  const agregar = () => {
    const invalido = validarTextoNota(texto);
    if (invalido) {
      toast.error(invalido);
      return;
    }
    startTransition(async () => {
      const res = await crearSeguimientoAction(flightId, {
        texto: texto.trim(),
        afecta_cotizacion: afecta,
      });
      if (res.ok) {
        toast.success(
          afecta
            ? "Nota agregada: queda pendiente en la cotización hasta marcarla resuelta"
            : "Nota agregada",
        );
        setTexto("");
        setAfecta(true);
      } else {
        toast.error(res.error ?? "No se pudo agregar la nota");
      }
    });
  };

  return (
    <form
      className="space-y-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        agregar();
      }}
    >
      <Textarea
        rows={2}
        value={texto}
        maxLength={TEXTO_NOTA_MAX}
        placeholder={PLACEHOLDER_SEGUIMIENTO}
        aria-label="Nueva nota de seguimiento"
        disabled={pending}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter agrega (Enter solo = salto de línea).
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            agregar();
          }
        }}
      />
      {texto.length > TEXTO_NOTA_MAX - 100 && (
        <p className="text-right text-[10px] text-muted-foreground">
          {texto.length}/{TEXTO_NOTA_MAX}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={afecta}
            onCheckedChange={(c) => setAfecta(c)}
            disabled={pending}
          />
          <Label htmlFor={switchId} className="text-xs font-normal">
            {ETIQUETA_AFECTA_COTIZACION}
          </Label>
        </div>
        <Button type="submit" size="sm" disabled={pending || vacio}>
          <PlusIcon />
          {pending ? "Agregando…" : "Agregar nota"}
        </Button>
      </div>
    </form>
  );
}

/** «Marcar resuelta» con «¿Cómo se resolvió?» opcional. */
function ResolverNotaDialog({
  flightId,
  nota,
  onClose,
}: {
  flightId: string;
  nota: SeguimientoNota;
  onClose: () => void;
}) {
  const router = useRouter();
  const [resolucion, setResolucion] = useState("");
  const [pending, startTransition] = useTransition();
  const error = validarResolucion(resolucion);

  const guardar = () => {
    if (error) return;
    startTransition(async () => {
      const res = await actualizarSeguimientoAction(flightId, nota.id, {
        estado: "RESUELTA",
        resolucion: resolucion.trim() || null,
      });
      if (res.ok) {
        toast.success("Nota marcada como resuelta");
        onClose();
      } else if (esNotaInexistente(res)) {
        toast.info(AVISO_NOTA_INEXISTENTE);
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo marcar como resuelta");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como resuelta</DialogTitle>
          <DialogDescription>«{recortarTexto(nota.texto, 160)}»</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <Field
            label="¿Cómo se resolvió? (opcional)"
            error={error ?? undefined}
            hint={`${resolucion.length}/${RESOLUCION_MAX}`}
          >
            <Textarea
              rows={3}
              value={resolucion}
              maxLength={RESOLUCION_MAX}
              placeholder="Ej. Se agregó el transporte como extra en la v3 de la cotización."
              disabled={pending}
              onChange={(e) => setResolucion(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !!error}>
              <CheckCircleIcon />
              {pending ? "Guardando…" : "Marcar resuelta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
