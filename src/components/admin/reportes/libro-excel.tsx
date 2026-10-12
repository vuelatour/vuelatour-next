"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import type { LibroExcel as LibroExcelJson } from "@/types/libro-excel";
import {
  ALTO_LETRAS_PX,
  ANCHO_NUMERACION_PX,
  ETIQUETA_PANTALLA_COMPLETA,
  ETIQUETA_SALIR_PANTALLA_COMPLETA,
  NOMBRE_SALIR_PANTALLA_COMPLETA,
  TITULO_PANTALLA_COMPLETA,
  TITULO_SALIR_PANTALLA_COMPLETA,
  contenidoBarraFormulas,
  cuadriculaHoja,
  desplazarSeleccion,
  esTeclaFlecha,
  estiloCeldaCss,
  referenciaCelda,
  textoHojas,
  tituloCelda,
} from "@/lib/admin/libro-excel";
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
 * Botón «Pantalla completa» (sus textos, en `lib/admin/libro-excel.ts`). Bajo
 * `sm` no se pinta: en un teléfono la barra de fórmulas ya va justa de ancho
 * y el iPhone no tiene pantalla completa de elementos.
 */
const CLASE_BOTON_PANTALLA_COMPLETA = "hidden sm:inline-flex cursor-pointer gap-1.5";

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
 * selección. El botón de descarga baja EXACTAMENTE este libro.
 */
export function LibroExcel({
  libro,
  descarga,
  className,
  pantalla = false,
}: {
  libro: LibroExcelJson;
  descarga?: DescargaLibro | null;
  className?: string;
  /** Vista «pantalla» (12-oct-2026, tarde): el marco ocupa casi toda la
   *  ventana (`.xl-libro--pantalla` en styles/libro-excel.css, con la cuenta
   *  del offset) y la barra gana el botón «Pantalla completa» (Fullscreen
   *  API sobre este contenedor). Sin la prop, el libro de siempre. */
  pantalla?: boolean;
}) {
  const [hojaIdx, setHojaIdx] = useState(0);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const hoja = libro.hojas[hojaIdx] ?? libro.hojas[0] ?? null;
  const vista = useMemo(() => (hoja ? cuadriculaHoja(hoja, libro) : null), [hoja, libro]);

  const celdaSeleccionada = useMemo(() => {
    if (!hoja || !seleccion) return null;
    return hoja.celdas.find((x) => x.r === seleccion.r && x.c === seleccion.c) ?? null;
  }, [hoja, seleccion]);

  // Pantalla completa (solo con `pantalla`): el navegador es quien sabe si
  // está activa (Esc, F11 o el botón la quitan) y lo avisa con
  // `fullscreenchange`; aquí solo se LEE si el que está a pantalla completa
  // es este libro.
  const raiz = useRef<HTMLDivElement>(null);
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
    setHojaIdx(i);
    setSeleccion(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!vista || !esTeclaFlecha(e.key)) return;
    e.preventDefault();
    setSeleccion((sel) =>
      desplazarSeleccion(vista, sel ?? { r: vista.filas[0].r, c: vista.columnas[0].c }, e.key as never),
    );
  };

  // `zona-clara`: el libro es una isla BLANCA dentro del admin oscuro; sin
  // re-escopar los tokens (globals.css, `.dark .zona-clara`) los controles de
  // la barra —Button outline, «N hojas»— heredan los colores del dark mode
  // sobre #fafafa (texto casi blanco al pasar el ratón, ~2.5:1). La
  // cuadrícula no cambia: usa sus propios `--xl-*` y colores fijos.
  return (
    <div
      ref={raiz}
      className={cn("xl-libro zona-clara", pantalla && "xl-libro--pantalla", className)}
      data-libro={libro.titulo}
    >
      <div className="xl-barra">
        <div className="xl-nombre" title="Celda seleccionada">
          {seleccion ? referenciaCelda(seleccion.r, seleccion.c) : "—"}
        </div>
        <span className="xl-fx" aria-hidden>
          fx
        </span>
        <div className="xl-formula" title="Barra de fórmulas: la fórmula o el valor de la celda seleccionada">
          {contenidoBarraFormulas(celdaSeleccionada)}
        </div>
        <div className="xl-barra-acciones">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {textoHojas(libro.hojas.length)}
          </span>
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
          className={cn("xl-marco", hoja.cuadricula ? "xl-cuadricula" : "xl-sin-cuadricula")}
          tabIndex={0}
          role="grid"
          aria-label={`Hoja ${hoja.nombre}`}
          onKeyDown={onKeyDown}
          data-hoja={hoja.nombre}
        >
          <table className="xl-tabla" style={{ width: vista.anchoTablaPx }}>
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
                  >
                    {col.letra}
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
                        onClick={() => setSeleccion({ r: cv.r, c: cv.c })}
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
