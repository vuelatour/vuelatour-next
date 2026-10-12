"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import type { LibroExcel as LibroExcelJson } from "@/types/libro-excel";
import {
  ALTO_LETRAS_PX,
  ANCHO_NUMERACION_PX,
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
}: {
  libro: LibroExcelJson;
  descarga?: DescargaLibro | null;
  className?: string;
}) {
  const [hojaIdx, setHojaIdx] = useState(0);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const hoja = libro.hojas[hojaIdx] ?? libro.hojas[0] ?? null;
  const vista = useMemo(() => (hoja ? cuadriculaHoja(hoja, libro) : null), [hoja, libro]);

  const celdaSeleccionada = useMemo(() => {
    if (!hoja || !seleccion) return null;
    return hoja.celdas.find((x) => x.r === seleccion.r && x.c === seleccion.c) ?? null;
  }, [hoja, seleccion]);

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

  return (
    <div className={cn("xl-libro", className)} data-libro={libro.titulo}>
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
