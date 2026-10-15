"use client";

import { useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import {
  ATRIBUTO_FILA,
  ATRIBUTO_FILA_HREF,
  SELECTOR_CONTROL,
  SELECTOR_DESPLEGABLE,
  SELECTOR_FILA,
  SELECTOR_FILA_HIJA,
  SELECTOR_MARCO_TABLA,
  accionDeTeclaFila,
  crearEstadoFilaActiva,
  indiceEnlaceDeFila,
  indiceFilaSiguiente,
  scrollParaVerFila,
  type ContextoTeclaFila,
  type EstadoFilaActiva,
} from "@/lib/admin/filas-activas";

/**
 * Fila ACTIVA + teclado ↑/↓/Home/End/Enter/Esc de una tabla (13-oct-2026).
 * Las reglas PURAS viven en `lib/admin/filas-activas.ts` (ahí están la
 * decisión ARIA, la del CSS y el ESTADO de la activa); aquí solo el cableado
 * DOM, que el runner sin navegador vigila por regex.
 *
 * Uso: `<TableBody {...f.propsCuerpo}>` + `<FilaNavegable filas={f}
 * clave={…} href={…}>` (`components/admin/fila-navegable.tsx`) en cada fila
 * NAVEGABLE (hija directa del <tbody>); un renglón pegado no navegable lleva
 * `data-fila-hija=""` y cuenta para la fila anterior; nunca en thead/tfoot ni
 * en la fila «Sin resultados».
 *
 * La activa NO es estado de React de la tabla (revisión 13-oct-2026): con un
 * `useState` aquí, cada ↓, clic o foco repintaba la tabla ENTERA (Gastos:
 * 100 filas × 13 columnas con menús de Base UI). Vive en
 * `crearEstadoFilaActiva` (un ref, uno por tabla) y cada `FilaNavegable` se
 * suscribe POR FILA: solo se repintan las dos filas que cambian.
 *
 * Toda la escucha es DELEGADA en el <tbody> (nunca window/document) y el
 * PRIMER chequeo de los tres handlers es `currentTarget.contains(target)`:
 * los menús y diálogos de Base UI viven en portales y React les burbujea los
 * eventos por el árbol de componentes; sin ese guard, Esc dentro de un
 * diálogo abierto desde una fila soltaría la activa, ↓ dentro de un menú
 * movería filas y un clic en el fondo de un diálogo le robaría el foco.
 *
 * Sin `useEffect`: la fila destino ya existe en el DOM cuando se pulsa la
 * tecla, así que foco y scroll se hacen dentro del handler. No persiste (ni
 * URL ni almacenamiento del navegador); en el borde no cambia de página;
 * Enter abre SOLO `data-fila-href`. `inicial` existe SOLO para el arnés de
 * pruebas con `renderToStaticMarkup`: las tablas no lo pasan.
 */
export interface PropsCuerpoFilas {
  "data-filas-activas": "";
  onKeyDown: (e: KeyboardEvent<HTMLTableSectionElement>) => void;
  onClick: (e: MouseEvent<HTMLTableSectionElement>) => void;
  onFocus: (e: FocusEvent<HTMLTableSectionElement>) => void;
}

export interface FilasActivas {
  /** El estado de la activa (fuera de React): `FilaNavegable` se suscribe por fila. */
  estado: EstadoFilaActiva;
  /** Las filas PINTADAS, en orden (de ellas sale la fila de entrada del Tab). */
  claves: readonly string[];
  soltar: () => void;
  propsCuerpo: PropsCuerpoFilas;
}

type Cuerpo = HTMLTableSectionElement;
type Fila = HTMLTableRowElement;

/**
 * La fila NAVEGABLE a la que pertenece el objetivo: el <tr data-fila> que lo
 * contiene o, si cayó en un renglón pegado (`tr[data-fila-hija]`), el <tr
 * data-fila> inmediatamente ANTERIOR. Solo si son hijos directos de este
 * <tbody>. `renglon` es el <tr> que de verdad contiene al objetivo (la fila o
 * su hija): ahí se miran rol, desplegable y control.
 */
function filaDe(cuerpo: Cuerpo, objetivo: Element): { fila: Fila; renglon: Fila } | null {
  const fila = objetivo.closest<Fila>(SELECTOR_FILA);
  if (fila !== null) return fila.parentElement === cuerpo ? { fila, renglon: fila } : null;
  const hija = objetivo.closest<Fila>(SELECTOR_FILA_HIJA);
  if (hija === null || hija.parentElement !== cuerpo) return null;
  const padre = hija.previousElementSibling;
  return padre !== null && padre.matches(SELECTOR_FILA)
    ? { fila: padre as Fila, renglon: hija }
    : null;
}

/** Las filas navegables de este cuerpo, en orden DOM (sub-filas incluidas). */
function filasNavegables(cuerpo: Cuerpo): Fila[] {
  return Array.from(cuerpo.querySelectorAll<Fila>(`:scope > ${SELECTOR_FILA}`));
}

function dentroDe(renglon: Element, el: Element | null): el is Element {
  return el !== null && renglon.contains(el);
}

/** El `role` del objetivo o de su contenedor con rol, solo si vive dentro del renglón. */
function rolDentroDe(objetivo: Element, renglon: Element): string | null {
  const conRol = objetivo.closest("[role]");
  return dentroDe(renglon, conRol) ? conRol.getAttribute("role") : null;
}

function contextoDeTecla(
  objetivo: Element,
  r: { fila: Fila; renglon: Fila },
  hayActiva: boolean,
): ContextoTeclaFila {
  return {
    esFila: objetivo === r.fila,
    etiqueta: objetivo.tagName,
    editable: (objetivo as HTMLElement).isContentEditable === true,
    // La casilla de la selección (Conciliación, 14-oct-2026) no es un campo.
    tipoEntrada: objetivo instanceof HTMLInputElement ? objetivo.type : null,
    rol: rolDentroDe(objetivo, r.renglon),
    conDesplegable: dentroDe(r.renglon, objetivo.closest(SELECTOR_DESPLEGABLE)),
    hayActiva,
  };
}

/** El clic cayó en un control del renglón (enlace, botón, campo…): no se le roba el foco. */
function enControlDe(objetivo: Element, renglon: Element): boolean {
  const control = objetivo.closest(SELECTOR_CONTROL);
  return control !== null && control !== renglon && renglon.contains(control);
}

/** Enter: el MISMO clic del mouse sobre el enlace cuyo href es `data-fila-href`. */
function abrirFila(fila: Fila): void {
  const href = fila.getAttribute(ATRIBUTO_FILA_HREF);
  if (!href) return;
  const enlaces = Array.from(fila.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const i = indiceEnlaceDeFila(
    enlaces.map((a) => a.getAttribute("href")),
    href,
  );
  if (i !== null) enlaces[i].click();
}

/**
 * Scroll INSTANTÁNEO del marco de la tabla (descontando el <thead> sticky,
 * geometría relativa al marco con getBoundingClientRect) y después la
 * ventana (`html` lleva desplazamiento suave por CSS, por eso se pide
 * "instant"; con la fila ya completa en el marco, `nearest` solo mueve la
 * página si hace falta).
 */
function llevarALaVista(fila: Fila): void {
  const marco = fila.closest<HTMLElement>(SELECTOR_MARCO_TABLA);
  if (marco) {
    const rm = marco.getBoundingClientRect();
    const rf = fila.getBoundingClientRect();
    const cabecera = fila.closest("table")?.tHead?.getBoundingClientRect().height ?? 0;
    const nuevo = scrollParaVerFila(
      { scrollTop: marco.scrollTop, altoVisible: marco.clientHeight, altoFijoArriba: cabecera },
      { top: rf.top - rm.top + marco.scrollTop, alto: rf.height },
    );
    if (nuevo !== null) marco.scrollTop = nuevo;
  }
  fila.scrollIntoView({ block: "nearest", behavior: "instant" });
}

export function useFilasActivas(
  claves: readonly string[],
  opciones?: { inicial?: string | null },
): FilasActivas {
  // Un estado por tabla, creado UNA vez (inicializador perezoso) y nunca
  // re-asignado: la instancia es estable y React no vuelve a renderizar la
  // tabla por él (lo que cambia vive DENTRO, y lo leen las filas suscritas).
  // No es un ref a propósito: leer `ref.current` en render lo prohíbe el
  // lint de React (`react-hooks/refs`).
  const [estado] = useState<EstadoFilaActiva>(() =>
    crearEstadoFilaActiva(opciones?.inicial ?? null),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const r = filaDe(cuerpo, objetivo);
    if (!r) return;
    const accion = accionDeTeclaFila(e, contextoDeTecla(objetivo, r, estado.leer() !== null));
    if (!accion) return;
    e.preventDefault();
    if (accion === "soltar") {
      estado.escribir(null);
      return;
    }
    if (accion === "abrir") {
      abrirFila(r.fila);
      return;
    }
    const filas = filasNavegables(cuerpo);
    const i = indiceFilaSiguiente(filas.indexOf(r.fila), accion, filas.length);
    if (i === null) return;
    const destino = filas[i];
    const clave = destino.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) estado.escribir(clave);
    destino.focus({ preventScroll: true });
    llevarALaVista(destino);
  };

  const onClick = (e: MouseEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const r = filaDe(cuerpo, objetivo);
    if (!r) return;
    const clave = r.fila.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) estado.escribir(clave);
    // Un clic en un enlace/botón/campo (de la fila O de su renglón pegado) NO
    // roba el foco (en el ⋯ de Base UI cerraría el menú); en el resto de la
    // celda, el <tr> navegable lo recibe para que Enter funcione de inmediato.
    if (!enControlDe(objetivo, r.renglon) && r.fila.ownerDocument.activeElement !== r.fila) {
      r.fila.focus({ preventScroll: true });
    }
  };

  const onFocus = (e: FocusEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const r = filaDe(cuerpo, objetivo);
    if (!r) return;
    const clave = r.fila.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) estado.escribir(clave);
  };

  return {
    estado,
    claves,
    soltar: () => estado.escribir(null),
    propsCuerpo: { "data-filas-activas": "", onKeyDown, onClick, onFocus },
  };
}
