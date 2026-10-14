"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowPathIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import type { LibroExcel as LibroExcelJson } from "@/types/libro-excel";
import {
  ALTO_LETRAS_PX,
  ANCHO_NUMERACION_PX,
  ETIQUETA_ACTUALIZANDO_LIBRO,
  ETIQUETA_ACTUALIZAR_LIBRO,
  ETIQUETA_PANTALLA_COMPLETA,
  ETIQUETA_SALIR_PANTALLA_COMPLETA,
  NOMBRE_SALIR_PANTALLA_COMPLETA,
  TITULO_ACTUALIZAR_LIBRO,
  TITULO_MANIJA_COLUMNA,
  TITULO_PANTALLA_COMPLETA,
  TITULO_SALIR_PANTALLA_COMPLETA,
  TOAST_LIBRO_ACTUALIZADO,
  anchoArrastrePx,
  anchoAutoajustePx,
  aplicarAnchos,
  cajaHorizontalPx,
  celdasParaAutoajuste,
  claveAnchosHoja,
  conAnchoColumna,
  contenidoBarraFormulas,
  cuadriculaHoja,
  desplazarSeleccion,
  esTeclaNavegacionHoja,
  estiloCeldaCss,
  filasPorPagina,
  fuenteCanvas,
  nombreManijaColumna,
  referenciaCelda,
  resolverHojaIdx,
  scrollParaVerCelda,
  textoHojas,
  tituloCelda,
  type AnchosColumnas,
  type ColumnaVista,
} from "@/lib/admin/libro-excel";
import {
  ETIQUETA_QUITAR_FRANJA_GASTO,
  franjaDeLlegada,
  llegadaAGasto,
  type FranjaGasto,
} from "@/lib/admin/libro-vinculos";
import "@/styles/libro-excel.css";

export interface DescargaLibro {
  path: string;
  filename: string;
  query?: Record<string, string | undefined>;
  label: string;
}

interface Seleccion {
  r: number;
  c: number;
}

/**
 * Un arrastre de manija en curso (14-oct-2026). Vive en una ref y no en
 * estado: moverse solo anota la x del puntero y el ancho nuevo se aplica UNA
 * vez por cuadro (`requestAnimationFrame`).
 */
interface ArrastreColumna {
  c: number;
  pointerId: number;
  xInicial: number;
  anchoInicialPx: number;
  /** La última x del puntero (la aplica el siguiente cuadro). */
  x: number;
  /** El ancho ya aplicado: si el cuadro da el mismo, no se re-pinta. */
  aplicadoPx: number;
  cuadro: number | null;
}

/**
 * Botón «Pantalla completa» (sus textos, en `lib/admin/libro-excel.ts`). Bajo
 * `sm` no se pinta: en un teléfono la barra de fórmulas ya va justa de ancho
 * y el iPhone no tiene pantalla completa de elementos.
 */
const CLASE_BOTON_PANTALLA_COMPLETA = "hidden sm:inline-flex cursor-pointer gap-1.5";

/**
 * «Actualizar datos» (14-oct-2026): vuelve a pedir el libro al servidor SIN
 * recargar la página. `router.refresh()` vuelve a correr la página del
 * servidor y React conserva el estado de este componente (hoja, celda
 * seleccionada, franja) y el scroll del marco: la `key` que pone la página
 * (gasto · título · archivo) no cambia con un refresh. Va en un componente
 * aparte para que `useRouter` solo viva con la vista «pantalla». Mientras
 * llega el libro nuevo el botón gira y no se deja pulsar dos veces; al
 * terminar avisa con un toast (un refresh de RefreshOnFocus no pasa por aquí
 * y no avisa). Bajo `sm` queda solo el ícono, con su nombre accesible.
 */
function BotonActualizarLibro() {
  const router = useRouter();
  const [actualizando, iniciar] = useTransition();
  const pidioActualizar = useRef(false);
  useEffect(() => {
    if (actualizando || !pidioActualizar.current) return;
    pidioActualizar.current = false;
    toast.success(TOAST_LIBRO_ACTUALIZADO);
  }, [actualizando]);
  const actualizar = () => {
    if (actualizando) return;
    pidioActualizar.current = true;
    iniciar(() => {
      router.refresh();
    });
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer gap-1.5"
      aria-label={actualizando ? ETIQUETA_ACTUALIZANDO_LIBRO : ETIQUETA_ACTUALIZAR_LIBRO}
      aria-busy={actualizando || undefined}
      title={TITULO_ACTUALIZAR_LIBRO}
      disabled={actualizando}
      data-actualizar-libro={actualizando ? "actualizando" : "listo"}
      onClick={actualizar}
    >
      <ArrowPathIcon className={cn("h-4 w-4", actualizando && "animate-spin")} aria-hidden />
      <span className="hidden sm:inline">
        {actualizando ? ETIQUETA_ACTUALIZANDO_LIBRO : ETIQUETA_ACTUALIZAR_LIBRO}
      </span>
    </Button>
  );
}

/** El soporte de la Fullscreen API no cambia mientras la página vive: no hay a qué suscribirse. */
const SIN_SUSCRIPCION = () => () => {};
const soportaFullscreen = () =>
  typeof document !== "undefined" && document.fullscreenEnabled === true;
/**
 * En el servidor se ASUME soporte (todo navegador de escritorio lo tiene)
 * para que el botón salga en el HTML y no brinque al hidratar; donde no
 * existe (iPhone) React lo retira al hidratar con el snapshot del navegador.
 */
const soportaFullscreenServidor = () => true;

/**
 * Un libro de Excel EN PANTALLA (12-oct-2026): barra de fórmulas (cuadro de
 * nombres + fx), la cuadrícula con letras de columna y números de fila,
 * paneles inmovilizados, combinadas, notas y el estilo de cada celda tal
 * como viene del libro, y las pestañas de hojas abajo. Todo el modelo lo
 * arma `lib/admin/libro-excel.ts` (puro); aquí solo se pinta y se mueve la
 * selección. El botón de descarga baja EXACTAMENTE este libro. Desde el
 * 14-oct-2026 cada letra de columna lleva su manija para ajustar el ancho
 * (doble clic: al contenido; arrastre: a mano), solo en pantalla.
 */
export function LibroExcel({
  libro,
  descarga,
  className,
  pantalla = false,
  gastoInicial = null,
  claveAnchos = "",
}: {
  libro: LibroExcelJson;
  descarga?: DescargaLibro | null;
  className?: string;
  /** Vista «pantalla» (12-oct-2026, tarde): el marco ocupa casi toda la
   *  ventana (`.xl-libro--pantalla` en styles/libro-excel.css, con la cuenta
   *  del offset) y la barra gana el botón «Pantalla completa» (Fullscreen
   *  API sobre este contenedor). Sin la prop, el libro de siempre. */
  pantalla?: boolean;
  /** Llegada desde Conciliación (`?gasto=`, 13-oct-2026, punto 5): abre el
   *  libro en la hoja y la celda de ese gasto, con la franja que lo explica.
   *  Sin la prop, el libro de siempre. */
  gastoInicial?: string | null;
  /** TIPO de libro para los anchos de columna que ajusta el operador
   *  (14-oct-2026; la página de balance pasa `claveAnchosVistaBalance`):
   *  un ancho del «balance» del general no se aplica al «balance» de un
   *  avión aunque las hojas se llamen igual. Sin la prop, clave vacía. */
  claveAnchos?: string;
}) {
  // Dónde vive el gasto en ESTE libro (puro, `lib/admin/libro-vinculos.ts`).
  // UNA vez por montaje y también en el servidor: el HTML ya trae la pestaña,
  // la celda, el cuadro de nombres y la franja. La página remonta el libro con
  // `key` (gasto · título · archivo) al cambiar de gasto, de periodo o de
  // libro; un router.refresh() conserva la key y no vuelve a calcular ni a saltar.
  const [llegada] = useState(() => (gastoInicial ? llegadaAGasto(libro, gastoInicial) : null));
  // La hoja se recuerda por posición Y por nombre (14-oct-2026): al actualizar
  // los datos el libro puede ganar o perder una hoja y se sigue enseñando la
  // MISMA (`resolverHojaIdx`, puro).
  const [hojaSel, setHojaSel] = useState(() => {
    const idx = llegada?.hallazgo?.hojaIdx ?? 0;
    return { idx, nombre: libro.hojas[idx]?.nombre ?? null };
  });
  const hojaIdx = resolverHojaIdx(libro.hojas, hojaSel);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(() =>
    llegada?.hallazgo ? { r: llegada.hallazgo.r, c: llegada.hallazgo.c } : null,
  );
  const [franja, setFranja] = useState<FranjaGasto | null>(() =>
    llegada ? franjaDeLlegada(llegada) : null,
  );
  const hoja = libro.hojas[hojaIdx] ?? null;
  // Anchos que el operador ajustó con la manija (14-oct-2026), por TIPO de
  // libro (`claveAnchos`) y hoja (`claveAnchosHoja`, puro). Estado del
  // componente: sobreviven a «Actualizar datos» (router.refresh() conserva el
  // estado) y al cambio de hoja; se pierden al recargar. Sin localStorage a
  // propósito: un ancho guardado caería en la columna equivocada el día que
  // pyservices cambie las columnas del libro.
  const [anchosManuales, setAnchosManuales] = useState<
    Readonly<Partial<Record<string, AnchosColumnas>>>
  >({});
  const claveHoja = claveAnchosHoja(claveAnchos, hoja?.nombre ?? "");
  const anchosHoja = anchosManuales[claveHoja];
  // La parte CARA (celdas, combinadas, desbordes) solo se arma con la hoja o
  // el libro; la BARATA (anchos, `leftPx` de lo inmovilizado, ancho de la
  // tabla) sale de los anchos manuales REUSANDO las filas: arrastrar una
  // manija no reconstruye las celdas.
  const vistaBase = useMemo(() => (hoja ? cuadriculaHoja(hoja, libro) : null), [hoja, libro]);
  const vista = useMemo(
    () => (vistaBase ? aplicarAnchos(vistaBase, anchosHoja) : null),
    [vistaBase, anchosHoja],
  );

  const celdaSeleccionada = useMemo(() => {
    if (!hoja || !seleccion) return null;
    return hoja.celdas.find((x) => x.r === seleccion.r && x.c === seleccion.c) ?? null;
  }, [hoja, seleccion]);

  // Pantalla completa (solo con `pantalla`): el navegador es quien sabe si
  // está activa (Esc, F11 o el botón la quitan) y lo avisa con
  // `fullscreenchange`; aquí solo se LEE si el que está a pantalla completa
  // es este libro.
  const raiz = useRef<HTMLDivElement>(null);
  // El `div.xl-marco`: ES el contenedor con scroll (`raiz` es `.xl-libro` y
  // no desplaza nada). Lo usa `seleccionar` para que el marco siga a la celda.
  const marco = useRef<HTMLDivElement>(null);
  const soportaPantallaCompleta = useSyncExternalStore(
    SIN_SUSCRIPCION,
    soportaFullscreen,
    soportaFullscreenServidor,
  );
  const [enPantallaCompleta, setEnPantallaCompleta] = useState(false);
  useEffect(() => {
    if (!pantalla) return;
    const onCambio = () => setEnPantallaCompleta(document.fullscreenElement === raiz.current);
    document.addEventListener("fullscreenchange", onCambio);
    return () => document.removeEventListener("fullscreenchange", onCambio);
  }, [pantalla]);

  const alternarPantallaCompleta = () => {
    const el = raiz.current;
    if (!el) return;
    const promesa =
      document.fullscreenElement === el ? document.exitFullscreen() : el.requestFullscreen();
    // La promesa puede rechazar (sin gesto del usuario, permiso negado):
    // nada de eso tumba la página; el botón simplemente no cambia.
    void Promise.resolve(promesa).catch(() => undefined);
  };

  const cambiarHoja = (i: number) => {
    setHojaSel({ idx: i, nombre: libro.hojas[i]?.nombre ?? null });
    setSeleccion(null);
  };

  // Teclado y clic pasan por AQUÍ (13-oct-2026): la selección cambia y, si la
  // celda quedó fuera de la zona visible (descontando numeración/letras y
  // paneles inmovilizados), el marco se desplaza JUSTO lo necesario
  // (`scrollParaVerCelda`, puro: la geometría sale de la vista, no del DOM).
  // Asignación directa de scrollLeft/scrollTop = scroll INSTANTÁNEO, estilo
  // Excel: `.xl-marco` declara `scroll-behavior: auto` y el `smooth` de
  // globals.css es de `html` (no se hereda). Nada de pedirle al navegador que
  // «enseñe» la celda (movería también la página e ignora lo sticky) ni de
  // animación suave. Va en el manejador y NO en un efecto a propósito: un
  // `router.refresh()` (RefreshOnFocus al volver a la pestaña) recrea
  // `libro`/`vista` y un efecto con esas deps volvería a saltar a la celda
  // activa aunque el operador hubiera hecho scroll con la rueda — Excel nunca
  // hace eso. `desplazarMarcoA` es la ÚNICA llamada a `scrollParaVerCelda`:
  // la usan `seleccionar` y la llegada desde Conciliación (abajo).
  const desplazarMarcoA = (sel: Seleccion) => {
    const el = marco.current;
    if (!el || !vista) return;
    const destino = scrollParaVerCelda(vista, sel, el);
    if (!destino) return;
    el.scrollLeft = destino.scrollLeft;
    el.scrollTop = destino.scrollTop;
  };
  const seleccionar = (sel: Seleccion) => {
    setSeleccion(sel);
    desplazarMarcoA(sel);
  };

  // Efecto de LLEGADA (13-oct-2026, punto 5; la ÚNICA excepción documentada a
  // «el scroll va en el manejador»): al montar, el marco va a la celda del
  // gasto. NO toca estado —la hoja, la celda y la franja nacieron en los
  // inicializadores; `react-hooks/set-state-in-effect` es error en
  // eslint-plugin-react-hooks 7— y no depende de `vista` ni de `libro`
  // (`useEffectEvent` lee los de ese render): un router.refresh() no vuelve a
  // saltar.
  const alLlegar = useEffectEvent(() => {
    const h = llegada?.hallazgo;
    if (h) desplazarMarcoA({ r: h.r, c: h.c });
  });
  useEffect(() => {
    alLlegar();
  }, []);

  // Flechas, PageUp/PageDown y Home/End mueven la SELECCIÓN (y el marco la
  // sigue por `seleccionar`). PageUp/PageDown saltan las filas que caben en la
  // zona libre del marco (`filasPorPagina`, con las medidas del `div.xl-marco`
  // de hoy): antes eran scroll nativo sin mover la selección y la siguiente
  // flecha devolvía el marco de golpe a la celda activa. Con Ctrl/⌘, Home/End
  // van a A1 / la última celda, como en Excel.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!vista || !esTeclaNavegacionHoja(e.key)) return;
    e.preventDefault();
    // `seleccion` del render y no el updater funcional: keydown es un evento
    // discreto y React lo procesa síncrono, así cada pulsación (también con la
    // tecla mantenida) ve el estado que dejó la anterior.
    const actual = seleccion ?? { r: vista.filas[0].r, c: vista.columnas[0].c };
    seleccionar(
      desplazarSeleccion(vista, actual, e.key, {
        filasPorPagina: marco.current
          ? filasPorPagina(vista, marco.current, actual.r, e.key === "PageUp" ? "arriba" : "abajo")
          : 1,
        conControl: e.ctrlKey || e.metaKey,
      }),
    );
  };

  // Ajustar el ancho de las columnas como en Excel (14-oct-2026): la manija
  // del borde derecho de cada letra. Doble clic ⇒ al contenido; arrastre ⇒
  // sigue al puntero. Todo en MANEJADORES, ningún efecto: el marco no se
  // mueve solo y un router.refresh() no toca los anchos.
  const fijarAncho = (c: number, px: number | null) => {
    setAnchosManuales((prev) => ({ ...prev, [claveHoja]: conAnchoColumna(prev[claveHoja], c, px) }));
  };

  // Medición = el texto que SE VE (`celda.t`) con la fuente REAL de cada
  // celda (su estilo calculado: familia, tamaño, negrita, cursiva) en UN solo
  // canvas reutilizado, más su relleno y borde reales. Qué celdas cuentan y la
  // regla de px son puras (`celdasParaAutoajuste`, `anchoAutoajustePx`); aquí
  // solo se lee el DOM.
  const tabla = useRef<HTMLTableElement>(null);
  const lienzo = useRef<CanvasRenderingContext2D | null>(null);
  const autoajustarColumna = (c: number) => {
    const cuerpo = tabla.current?.tBodies[0];
    if (!vista || !cuerpo) return;
    lienzo.current ??= document.createElement("canvas").getContext("2d");
    const ctx = lienzo.current;
    if (!ctx) return;
    const medidas = celdasParaAutoajuste(vista, c).flatMap((x) => {
      // El <tr> y el <td> por posición (la vista ES lo que se pintó; el <th>
      // de la numeración va primero), cotejando su `data-ref`.
      const td = cuerpo.rows[x.iFila]?.cells[x.iCelda + 1];
      if (!td || td.dataset.ref !== x.ref) return [];
      const estilo = getComputedStyle(td);
      ctx.font = fuenteCanvas(estilo);
      return [{ renglonesPx: x.renglones.map((r) => ctx.measureText(r).width), cajaPx: cajaHorizontalPx(estilo) }];
    });
    // Sin contenido ⇒ null ⇒ la columna vuelve al ancho original del libro.
    fijarAncho(c, anchoAutoajustePx(medidas));
  };

  // Arrastre: pointer capture (el puntero puede salir de la manija y del
  // marco) y UN ancho por cuadro de animación. No selecciona texto (el
  // `onMouseDown` de la manija y `.xl-libro--redimensionando`) ni la celda:
  // la manija vive en las letras, nunca en un <td>.
  const arrastre = useRef<ArrastreColumna | null>(null);
  const [redimensionando, setRedimensionando] = useState(false);
  const aplicarArrastre = () => {
    const a = arrastre.current;
    if (!a) return;
    a.cuadro = null;
    const px = anchoArrastrePx(a.anchoInicialPx, a.xInicial, a.x);
    if (px === a.aplicadoPx) return;
    a.aplicadoPx = px;
    setRedimensionando(true);
    fijarAncho(a.c, px);
  };
  const empezarArrastre = (e: PointerEvent<HTMLButtonElement>, col: ColumnaVista) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = {
      c: col.c,
      pointerId: e.pointerId,
      xInicial: e.clientX,
      anchoInicialPx: col.anchoPx,
      x: e.clientX,
      aplicadoPx: col.anchoPx,
      cuadro: null,
    };
  };
  const moverArrastre = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a || a.pointerId !== e.pointerId) return;
    a.x = e.clientX;
    a.cuadro ??= requestAnimationFrame(aplicarArrastre);
  };
  const terminarArrastre = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a || a.pointerId !== e.pointerId) return;
    if (a.cuadro !== null) cancelAnimationFrame(a.cuadro);
    // El último movimiento no se pierde aunque su cuadro no haya llegado.
    aplicarArrastre();
    arrastre.current = null;
    setRedimensionando(false);
  };

  // `zona-clara`: el libro es una isla BLANCA dentro del admin oscuro; sin
  // re-escopar los tokens (globals.css, `.dark .zona-clara`) los controles de
  // la barra —Button outline, «N hojas»— heredan los colores del dark mode
  // sobre #fafafa (texto casi blanco al pasar el ratón, ~2.5:1). La
  // cuadrícula no cambia: usa sus propios `--xl-*` y colores fijos.
  return (
    <div
      ref={raiz}
      className={cn(
        "xl-libro zona-clara",
        pantalla && "xl-libro--pantalla",
        redimensionando && "xl-libro--redimensionando",
        className,
      )}
      data-libro={libro.titulo}
    >
      {/* Franja del gasto (13-oct-2026, punto 5): ANTES de la barra y solo con
          la llegada desde Conciliación. 28 px exactos (`ALTO_FRANJA_PX`); el
          marco se los cede por CSS (`:has`) mientras existe. `role="status"`
          ya es región viva: sin `aria-live` explícito. */}
      {franja ? (
        <div className="xl-franja" data-tono={franja.tono} role="status" title={franja.titulo}>
          <span className="xl-franja-texto">{franja.texto}</span>
          <button
            type="button"
            className="xl-franja-cerrar cursor-pointer"
            aria-label={ETIQUETA_QUITAR_FRANJA_GASTO}
            title={ETIQUETA_QUITAR_FRANJA_GASTO}
            onClick={() => setFranja(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="xl-barra">
        {/* Regiones VIVAS (revisión 13-oct-2026): al moverse con el teclado la
            selección solo era un contorno verde y el lector de pantalla no
            anunciaba nada; el cuadro de nombres («B7») y la barra de fórmulas
            (su valor) ya cambian con cada movimiento, así que se anuncian. */}
        <div className="xl-nombre" title="Celda seleccionada" aria-live="polite" aria-atomic="true">
          {seleccion ? referenciaCelda(seleccion.r, seleccion.c) : "—"}
        </div>
        <span className="xl-fx" aria-hidden>
          fx
        </span>
        <div
          className="xl-formula"
          title="Barra de fórmulas: la fórmula o el valor de la celda seleccionada"
          aria-live="polite"
          aria-atomic="true"
        >
          {contenidoBarraFormulas(celdaSeleccionada)}
        </div>
        <div className="xl-barra-acciones">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {textoHojas(libro.hojas.length)}
          </span>
          {pantalla ? <BotonActualizarLibro /> : null}
          {pantalla && soportaPantallaCompleta ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={CLASE_BOTON_PANTALLA_COMPLETA}
              aria-label={
                enPantallaCompleta ? NOMBRE_SALIR_PANTALLA_COMPLETA : ETIQUETA_PANTALLA_COMPLETA
              }
              title={enPantallaCompleta ? TITULO_SALIR_PANTALLA_COMPLETA : TITULO_PANTALLA_COMPLETA}
              data-pantalla-completa={enPantallaCompleta ? "activa" : "inactiva"}
              onClick={alternarPantallaCompleta}
            >
              {enPantallaCompleta ? (
                <ArrowsPointingInIcon className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowsPointingOutIcon className="h-4 w-4" aria-hidden />
              )}
              <span>
                {enPantallaCompleta ? ETIQUETA_SALIR_PANTALLA_COMPLETA : ETIQUETA_PANTALLA_COMPLETA}
              </span>
            </Button>
          ) : null}
          {descarga ? (
            <ExcelExportButton
              path={descarga.path}
              filename={descarga.filename}
              query={descarga.query}
              label={descarga.label}
            />
          ) : null}
        </div>
      </div>

      {hoja && vista ? (
        <div
          ref={marco}
          className={cn("xl-marco", hoja.cuadricula ? "xl-cuadricula" : "xl-sin-cuadricula")}
          tabIndex={0}
          role="grid"
          aria-label={`Hoja ${hoja.nombre}`}
          onKeyDown={onKeyDown}
          data-hoja={hoja.nombre}
        >
          <table ref={tabla} className="xl-tabla" style={{ width: vista.anchoTablaPx }}>
            <colgroup>
              <col style={{ width: ANCHO_NUMERACION_PX }} />
              {vista.columnas.map((col) => (
                <col key={col.c} style={{ width: col.anchoPx }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ height: ALTO_LETRAS_PX }}>
                <th className="xl-esquina" aria-hidden />
                {vista.columnas.map((col) => (
                  <th
                    key={col.c}
                    scope="col"
                    className={cn(col.fija && "xl-fija-col")}
                    style={col.fija ? { left: col.leftPx ?? undefined } : undefined}
                    // El nombre de la letra es la letra: sin esto el lector le
                    // sumaría el de su manija («F Ajustar el ancho…»).
                    aria-label={col.letra}
                  >
                    {col.letra}
                    {/* La manija (14-oct-2026), en el borde derecho de la letra
                        y DENTRO del <th> sticky (ya es su bloque contenedor; el
                        <th> siguiente taparía lo que se saliera). Sin tab stop:
                        son decenas de columnas. Cursor col-resize, no
                        cursor-pointer: esa es su promesa, y se cumple con el
                        doble clic y con el arrastre. */}
                    <button
                      type="button"
                      tabIndex={-1}
                      className="xl-manija"
                      aria-label={nombreManijaColumna(col.letra)}
                      title={TITULO_MANIJA_COLUMNA}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => empezarArrastre(e, col)}
                      onPointerMove={moverArrastre}
                      onPointerUp={terminarArrastre}
                      onPointerCancel={terminarArrastre}
                      onLostPointerCapture={terminarArrastre}
                      onDoubleClick={() => autoajustarColumna(col.c)}
                      onClick={(e) => {
                        // Activada con teclado o lector de pantalla (detail 0)
                        // ajusta como el doble clic; un clic de ratón suelto no
                        // hace nada (es el inicio de un arrastre).
                        if (e.detail === 0) autoajustarColumna(col.c);
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vista.filas.map((fila) => (
                <tr key={fila.r} style={{ height: fila.altoPx }}>
                  <th
                    scope="row"
                    className={cn(fila.fija && "xl-fija-fila")}
                    style={fila.fija ? { top: fila.topPx ?? undefined } : undefined}
                  >
                    {fila.r}
                  </th>
                  {fila.celdas.map((cv) => {
                    const col = vista.columnas.find((x) => x.c === cv.c);
                    const sel = seleccion?.r === cv.r && seleccion?.c === cv.c;
                    const fijaCol = col?.fija ?? false;
                    return (
                      <td
                        key={cv.c}
                        colSpan={cv.colSpan > 1 ? cv.colSpan : undefined}
                        rowSpan={cv.rowSpan > 1 ? cv.rowSpan : undefined}
                        className={cn(
                          "xl-celda",
                          fila.fija && "xl-fija-fila",
                          fijaCol && "xl-fija-col",
                          sel && "xl-seleccionada",
                          cv.celda?.n && "xl-con-nota",
                        )}
                        style={{
                          ...estiloCeldaCss(cv.celda, cv.estilo, { desborda: cv.desborda }),
                          ...(fila.fija ? { top: fila.topPx ?? undefined } : null),
                          ...(fijaCol ? { left: col?.leftPx ?? undefined } : null),
                        }}
                        title={tituloCelda(cv.celda)}
                        data-ref={referenciaCelda(cv.r, cv.c)}
                        data-formula={cv.celda?.f}
                        onClick={() => seleccionar({ r: cv.r, c: cv.c })}
                      >
                        {cv.celda?.t ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="xl-vacio">Este libro no tiene hojas.</div>
      )}

      <div className="xl-pestanas" role="tablist" aria-label="Hojas del libro">
        {libro.hojas.map((h, i) => (
          <button
            key={`${h.nombre}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === hojaIdx}
            className="xl-pestana cursor-pointer"
            onClick={() => cambiarHoja(i)}
          >
            {h.nombre}
            {h.pestana ? (
              <span className="xl-pestana-color" style={{ background: `#${h.pestana}` }} aria-hidden />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
