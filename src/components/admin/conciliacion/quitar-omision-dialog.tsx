"use client";

/**
 * «¿Deshacer la omisión…?» (14-oct-2026, API 0.0.77, invariante 75 del API):
 * la confirmación de una acción que regresa movimientos a «Pendientes» (regla
 * permanente: toda acción destructiva confirma). La abren la barra de la
 * pestaña «Omitidos» (N) y el menú ⋯ de una fila omitida (1), con la lista
 * CONGELADA al abrir; `next/dynamic` sin SSR, montado solo al abrirse.
 *
 * Todo o nada en el API (`quitar-omision`): vuelven a Pendientes y de sus
 * notas se quita SOLO la línea «Omitido de la conciliación…». La acción corre
 * ÚNICAMENTE desde `AlertDialogAction` (con `preventDefault`: el diálogo no
 * se cierra antes de la respuesta). Éxito ⇒ toast, cerrar, el padre limpia la
 * selección y UN `router.refresh()`. 409 ⇒ el texto del API. Sin respuesta ⇒
 * «No se pudo confirmar si se deshizo…» + refresh. Textos en
 * `lib/admin/conciliacion-omision.ts`.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { quitarOmisionAction, type ActionResult } from "@/app/admin/conciliacion/actions";
import { BOTON_CANCELAR, MSG_SIN_CONEXION } from "@/lib/admin/conciliacion-lote";
import {
  BOTON_CONFIRMAR_QUITAR_OMISION,
  ETIQUETA_LISTA_QUITAR_OMISION,
  TEXTO_DESHACIENDO,
  TEXTO_QUITAR_OMISION,
  lineaListaOmitir,
  mensajeErrorOmision,
  textoMotivoFila,
  toastRestaurados,
  tituloQuitarOmision,
  type ErrorOmision,
} from "@/lib/admin/conciliacion-omision";
import { monedaDeMovimiento } from "@/lib/admin/conciliacion-seleccion";
import type { MovimientoBancario } from "@/types/conciliacion";

/** La server action ni siquiera salió: nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

export interface QuitarOmisionDialogProps {
  /** Copia CONGELADA al abrir: 1 (menú ⋯) o N (barra de «Omitidos»). */
  movimientos: MovimientoBancario[];
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras deshacer: el padre limpia la selección (el diálogo ya cerró y refresca). */
  onRestaurados?: (ids: string[]) => void;
}

export function QuitarOmisionDialog(p: QuitarOmisionDialogProps) {
  const router = useRouter();
  const [lista] = useState<MovimientoBancario[]>(() => p.movimientos);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorOmision | null>(null);
  const enviandoRef = useRef(false);
  const refrescarAlCerrarRef = useRef(false);

  const cambiarAbierto = (abierto: boolean) => {
    if (!abierto && enviandoRef.current) return;
    if (!abierto && refrescarAlCerrarRef.current) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    p.onOpenChange(abierto);
  };

  const deshacer = () => {
    // Solo con el diálogo abierto y una vez (un doble clic no corre dos veces).
    if (!p.open || enviandoRef.current) return;
    const ids = lista.map((m) => m.id);
    setError(null);
    enviandoRef.current = true;
    setEnviando(true);
    void quitarOmisionAction(ids)
      .catch(sinConexion)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        if (r.ok) {
          toast.success(toastRestaurados(r.data?.restaurados ?? ids.length));
          p.onRestaurados?.(ids);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        const e = mensajeErrorOmision(r, "deshacer");
        if (e.incierto) {
          toast.error(e.titulo);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        if (e.refrescar) refrescarAlCerrarRef.current = true;
        setError(e);
      });
  };

  return (
    <AlertDialog open={p.open} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{tituloQuitarOmision(lista.length)}</AlertDialogTitle>
          <AlertDialogDescription>{TEXTO_QUITAR_OMISION}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul
          className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          aria-label={ETIQUETA_LISTA_QUITAR_OMISION}
        >
          {lista.map((m) => (
            <li key={m.id}>
              <span className="block truncate" title={m.descripcion ?? undefined}>
                {lineaListaOmitir(m, p.aliasPorCuenta?.[m.cuenta_bancaria_id] ?? null, monedaDeMovimiento(m, p.monedaPorCuenta))}
              </span>
              <span className="block truncate text-[10px]">{textoMotivoFila(m.omision)}</span>
            </li>
          ))}
        </ul>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <p>{error.titulo}</p>
            {error.descripcion && <p>{error.descripcion}</p>}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={enviando}>
            {BOTON_CANCELAR}
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
            disabled={enviando}
            onClick={(e) => {
              e.preventDefault();
              void deshacer();
            }}
          >
            {enviando ? TEXTO_DESHACIENDO : BOTON_CONFIRMAR_QUITAR_OMISION}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
