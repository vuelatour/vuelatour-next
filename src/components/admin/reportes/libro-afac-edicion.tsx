"use client";

/**
 * AFAC POR VUELO EDITABLE EN EL LIBRO EN PANTALLA (16-oct-2026, API 0.0.89,
 * invariante 90 del API). Las piezas con estado y efectos de la captura del
 * COSTO REAL AFAC en la celda EGRESO de «otros movimientos» del Balance
 * general; `LibroExcel` las monta solo en la vista «pantalla» y con
 * `edicionAfac`. Las reglas (qué celda, qué se teclea, qué se guarda, qué
 * texto) son PURAS en `lib/admin/libro-afac.ts`.
 *
 *  - `useEdicionAfac`: los cambios locales por vuelo (el número tecleado
 *    mientras llega el libro nuevo; se descartan solos al llegar uno que ya
 *    lo trae, `depurarCambiosAfac`), el cuadro abierto, la confirmación de
 *    «quitar», el último aviso y la señal del refresco diferido. Guarda con
 *    `guardarCostoRealAfacAction` / `quitarCostoRealAfacAction` (PUT/DELETE
 *    `/v1/flights/:id/afac-real`, SIN revalidar).
 *  - `EditorCeldaAfac`: el cuadro de texto ENCIMA de la celda (hijo absoluto
 *    del marco: se desplaza con las celdas). Enter guarda y baja (Mayús+Enter
 *    sube), Tab guarda y avanza, Esc cancela, clic fuera guarda.
 *  - `ConfirmarQuitarAfacDialog`: vaciar una celda con valor ⇒ «¿Quitar…?»
 *    (regla del cliente: lo destructivo confirma).
 *  - `RefrescoDiferidoAfac`: UN `router.refresh()` 15 s después del ÚLTIMO
 *    guardado (decisión D10: el general tarda decenas de segundos).
 *  - `EstadoAfacBarra`: el estado de la captura a la derecha de la barra de
 *    fórmulas (en pantalla completa el toast no se ve; la barra sí).
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XMarkIcon } from "@heroicons/react/24/outline";
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
import { toastMesCerradoSiAplica } from "@/components/admin/aviso-mes-cerrado";
import {
  guardarCostoRealAfacAction,
  quitarCostoRealAfacAction,
  type ActionResult,
} from "@/app/admin/reportes/actions";
import {
  BOTON_CANCELAR_AFAC,
  BOTON_QUITAR_AFAC,
  ETIQUETA_QUITAR_AVISO_AFAC,
  MSG_AFAC_SIN_RESPUESTA,
  RETRASO_REFRESCO_AFAC_MS,
  SIN_CAMBIOS_AFAC,
  TITULO_QUITAR_AFAC,
  costoRealDeRespuesta,
  decidirGuardadoAfac,
  depurarCambiosAfac,
  falloAfacIncierto,
  mensajeErrorAfac,
  nombreVueloAfac,
  restaurarCambioAfac,
  textoQuitarAfac,
  toastGuardadoAfac,
  toastQuitadoAfac,
  type CajaEditorAfac,
  type CambiosAfac,
  type EstadoBarraAfac,
} from "@/lib/admin/libro-afac";
import type { RespuestaAfacReal } from "@/types/afac";
import type { LibroExcel as LibroExcelJson, VinculoAfacReal } from "@/types/libro-excel";

/** El cuadro abierto: en qué celda, de qué vuelo, lo tecleado y dónde se pinta. */
export interface EditorAfac {
  r: number;
  c: number;
  vinculo: VinculoAfacReal;
  texto: string;
  /** true = abre con todo seleccionado (Enter, F2, doble clic); false =
   *  empezó a teclear: el cursor al final. */
  seleccionarTodo: boolean;
  caja: CajaEditorAfac;
}

/** Cómo terminó la edición. `atras` = con Mayús (Enter sube, Tab retrocede). */
export type FinEdicionAfac =
  | { tipo: "enter" | "tab"; texto: string; atras: boolean }
  | { tipo: "blur"; texto: string }
  | { tipo: "cancelar" };

/** La server action ni siquiera salió (red, deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<RespuestaAfacReal> => ({
  ok: false,
  code: "SIN_CONEXION",
  error: MSG_AFAC_SIN_RESPUESTA,
});

export function useEdicionAfac(libro: LibroExcelJson) {
  // Al llegar un libro NUEVO (refresco diferido, «Actualizar datos»,
  // RefreshOnFocus) se descartan los cambios locales que ya trae. Ajuste de
  // estado durante el render (patrón de React; nada de efectos).
  const [libroVisto, setLibroVisto] = useState(libro);
  const [cambios, setCambios] = useState<CambiosAfac>(SIN_CAMBIOS_AFAC);
  if (libro !== libroVisto) {
    setLibroVisto(libro);
    setCambios((prev) => depurarCambiosAfac(prev, libro));
  }
  const [editor, setEditor] = useState<EditorAfac | null>(null);
  const [porQuitar, setPorQuitar] = useState<VinculoAfacReal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Sube con cada guardado (y con un fallo incierto): `RefrescoDiferidoAfac`
  // reprograma su único refresco.
  const [marcaRefresco, setMarcaRefresco] = useState(0);

  const enviar = (v: VinculoAfacReal, monto: number | null) => {
    const id = v.vuelo_id;
    const anterior = cambios[id];
    setAviso(null);
    setCambios((prev) => ({ ...prev, [id]: { valor: monto, estado: "guardando", guardadoEn: null } }));
    const llamada =
      monto === null
        ? quitarCostoRealAfacAction({ vueloId: id })
        : guardarCostoRealAfacAction({ vueloId: id, monto });
    void llamada.catch(sinConexion).then((r) => {
      if (r.ok) {
        const valor = costoRealDeRespuesta(r.data, monto);
        setCambios((prev) => ({ ...prev, [id]: { valor, estado: "guardado", guardadoEn: Date.now() } }));
        toast.success(valor === null ? toastQuitadoAfac(r.data?.folio, v) : toastGuardadoAfac(r.data?.folio, v));
        setMarcaRefresco((n) => n + 1);
        return;
      }
      // La celda vuelve a lo de antes; el texto del API tal cual (409
      // `MES_CERRADO` con «Ir a Reportes»).
      setCambios((prev) => restaurarCambioAfac(prev, id, anterior));
      const texto = mensajeErrorAfac(r);
      setAviso(texto);
      if (!toastMesCerradoSiAplica(r)) toast.error(texto);
      // Sin respuesta pudo haberse guardado: el libro se vuelve a leer.
      if (falloAfacIncierto(r)) setMarcaRefresco((n) => n + 1);
    });
  };

  const abrir = (e: EditorAfac) => {
    setAviso(null);
    setEditor(e);
  };

  const cambiarTexto = (texto: string) => setEditor((ed) => (ed ? { ...ed, texto } : ed));

  /** Termina la edición; true = el cuadro se cerró (un error con Enter o Tab
   *  lo deja abierto para corregir; al salir con clic, se cierra igual). */
  const terminar = (fin: FinEdicionAfac): boolean => {
    const ed = editor;
    if (!ed) return true;
    if (fin.tipo === "cancelar") {
      setEditor(null);
      return true;
    }
    const d = decidirGuardadoAfac(fin.texto, ed.vinculo.valor);
    if (d.accion === "error") {
      setAviso(d.mensaje);
      toast.error(d.mensaje);
      if (fin.tipo !== "blur") return false;
      setEditor(null);
      return true;
    }
    setEditor(null);
    if (d.accion === "guardar") enviar(ed.vinculo, d.monto);
    else if (d.accion === "quitar") setPorQuitar(ed.vinculo);
    return true;
  };

  return {
    cambios,
    editor,
    porQuitar,
    aviso,
    marcaRefresco,
    abrir,
    cambiarTexto,
    terminar,
    /** Supr / Retroceso sobre una celda con valor: directo a la confirmación. */
    pedirQuitar: (v: VinculoAfacReal) => {
      setAviso(null);
      setPorQuitar(v);
    },
    confirmarQuitar: () => {
      const v = porQuitar;
      setPorQuitar(null);
      if (v) enviar(v, null);
    },
    cancelarQuitar: () => setPorQuitar(null),
    quitarAviso: () => setAviso(null),
  };
}

/**
 * El cuadro de edición ENCIMA de la celda. Su texto vive en el estado del
 * libro (la barra de fórmulas enseña lo que se teclea). Ninguna tecla sube al
 * marco: las flechas mueven el cursor del texto, no la selección.
 */
export function EditorCeldaAfac({
  editor,
  onCambio,
  onTerminar,
}: {
  editor: EditorAfac;
  onCambio: (texto: string) => void;
  onTerminar: (fin: FinEdicionAfac) => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Un solo final por cuadro (Enter cierra y el blur que le sigue no repite).
  const terminado = useRef(false);
  const [seleccionarTodo] = useState(editor.seleccionarTodo);
  // El foco ANTES de pintar (layout): la siguiente tecla ya cae en el cuadro y
  // no en el marco (que lo volvería a abrir con esa tecla). Solo existe en el
  // navegador: el cuadro nunca se pinta en el servidor.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (seleccionarTodo) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [seleccionarTodo]);

  const fin = (f: FinEdicionAfac) => {
    if (terminado.current) return;
    terminado.current = true;
    if (!onTerminar(f)) terminado.current = false;
  };

  return (
    <input
      ref={input}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className="xl-editor-afac"
      style={{ left: editor.caja.left, top: editor.caja.top, width: editor.caja.width, height: editor.caja.height }}
      aria-label={`Costo real AFAC de ${nombreVueloAfac(editor.vinculo)} (pesos)`}
      data-editor-afac={editor.vinculo.vuelo_id}
      value={editor.texto}
      onChange={(e) => onCambio(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          fin({ tipo: e.key === "Enter" ? "enter" : "tab", texto: e.currentTarget.value, atras: e.shiftKey });
        } else if (e.key === "Escape") {
          e.preventDefault();
          fin({ tipo: "cancelar" });
        }
      }}
      onBlur={(e) => {
        // Cambiar de ventana NO guarda: al volver, el cuadro sigue abierto.
        if (typeof document !== "undefined" && !document.hasFocus()) return;
        fin({ tipo: "blur", texto: e.currentTarget.value });
      }}
    />
  );
}

/**
 * «¿Quitar el costo real AFAC?» (vaciar una celda con valor o Supr). En
 * pantalla completa se monta DENTRO del libro (`contenedor`): el navegador
 * solo enseña ese subárbol.
 */
export function ConfirmarQuitarAfacDialog({
  vinculo,
  contenedor,
  onConfirmar,
  onCancelar,
}: {
  vinculo: VinculoAfacReal | null;
  /** El libro (a pantalla completa) o null = `<body>`, como siempre. */
  contenedor: RefObject<HTMLElement | null> | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // El texto se conserva mientras el diálogo se cierra (animación).
  const [visto, setVisto] = useState(vinculo);
  if (vinculo && vinculo !== visto) setVisto(vinculo);
  const v = vinculo ?? visto;
  return (
    <AlertDialog
      open={vinculo !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <AlertDialogContent portalContainer={contenedor ?? undefined} data-confirmar-quitar-afac="">
        <AlertDialogHeader>
          <AlertDialogTitle>{TITULO_QUITAR_AFAC}</AlertDialogTitle>
          <AlertDialogDescription>{v ? textoQuitarAfac(v) : null}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">{BOTON_CANCELAR_AFAC}</AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
            onClick={onConfirmar}
          >
            {BOTON_QUITAR_AFAC}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * UN refresco del libro `RETRASO_REFRESCO_AFAC_MS` después del ÚLTIMO
 * guardado: cada guardado nuevo reprograma el temporizador; desmontar lo
 * cancela. No pinta nada.
 */
export function RefrescoDiferidoAfac({ marca }: { marca: number }) {
  const router = useRouter();
  useEffect(() => {
    if (marca === 0) return;
    const t = window.setTimeout(() => router.refresh(), RETRASO_REFRESCO_AFAC_MS);
    return () => window.clearTimeout(t);
  }, [marca, router]);
  return null;
}

/** El estado de la captura dentro de la barra de fórmulas, a la derecha
 *  (texto de `estadoBarraAfac`; la barra ya es región viva y lo anuncia). Un
 *  error se puede quitar con ×. Bajo `md` no se pinta (la barra va justa):
 *  ahí el toast sí se ve. */
export function EstadoAfacBarra({
  estado,
  onQuitarAviso,
}: {
  estado: EstadoBarraAfac;
  onQuitarAviso: () => void;
}) {
  return (
    <span className="xl-afac-estado hidden md:inline-flex" data-tono={estado.tono} title={estado.texto}>
      <span className="xl-afac-estado-texto">{estado.texto}</span>
      {estado.tono === "error" ? (
        <button
          type="button"
          className="xl-afac-estado-cerrar cursor-pointer"
          aria-label={ETIQUETA_QUITAR_AVISO_AFAC}
          title={ETIQUETA_QUITAR_AVISO_AFAC}
          onClick={onQuitarAviso}
        >
          <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
