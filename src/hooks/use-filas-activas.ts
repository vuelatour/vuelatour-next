"use client";

import { useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import {
  ATRIBUTO_FILA,
  ATRIBUTO_FILA_HREF,
  SELECTOR_CONTROL,
  SELECTOR_DESPLEGABLE,
  SELECTOR_FILA,
  SELECTOR_MARCO_TABLA,
  accionDeTeclaFila,
  atributosFila,
  filaDeEntrada,
  indiceEnlaceDeFila,
  indiceFilaSiguiente,
  scrollParaVerFila,
  type AtributosFila,
  type ContextoTeclaFila,
} from "@/lib/admin/filas-activas";

/**
 * Fila ACTIVA + teclado ↑/↓/Home/End/Enter/Esc de una tabla (13-oct-2026).
 * Las reglas PURAS viven en `lib/admin/filas-activas.ts` (ahí está la decisión
 * ARIA y la del CSS); aquí solo el cableado DOM, que el runner sin navegador
 * vigila por regex.
 *
 * Uso: `<TableBody {...f.propsCuerpo}>` + `<TableRow {...f.propsFila(clave,
 * href?)}>` en cada fila NAVEGABLE (hija directa del <tbody>); un renglón
 * pegado no navegable lleva `data-fila-hija=""`; nunca en thead/tfoot ni en
 * la fila «Sin resultados».
 *
 * Toda la escucha es DELEGADA en el <tbody> (nunca window/document) y el
 * PRIMER chequeo de los tres handlers es `currentTarget.contains(target)`:
 * los menús y diálogos de Base UI viven en portales y React les burbujea los
 * eventos por el árbol de componentes; sin ese guard, Esc dentro de un
 * diálogo abierto desde una fila soltaría la activa, ↓ dentro de un menú
 * movería filas y un clic en el fondo de un diálogo le robaría el foco.
 *
 * Sin `useEffect` ni `useRef`: la fila destino ya existe en el DOM cuando se
 * pulsa la tecla, así que foco y scroll se hacen dentro del handler. No
 * persiste (ni URL ni almacenamiento del navegador); en el borde no cambia
 * de página; Enter
 * abre SOLO `data-fila-href`. `inicial` existe SOLO para el arnés de pruebas
 * con `renderToStaticMarkup`: las tablas no lo pasan.
 */
export interface PropsCuerpoFilas {
  "data-filas-activas": "";
  onKeyDown: (e: KeyboardEvent<HTMLTableSectionElement>) => void;
  onClick: (e: MouseEvent<HTMLTableSectionElement>) => void;
  onFocus: (e: FocusEvent<HTMLTableSectionElement>) => void;
}

export interface FilasActivas {
  activa: string | null;
  soltar: () => void;
  propsCuerpo: PropsCuerpoFilas;
  propsFila: (clave: string, href?: string | null) => AtributosFila;
}

type Cuerpo = HTMLTableSectionElement;

/** El <tr data-fila> que contiene al objetivo, SOLO si es hijo directo de este <tbody>. */
function filaDe(cuerpo: Cuerpo, objetivo: Element): HTMLTableRowElement | null {
  const fila = objetivo.closest<HTMLTableRowElement>(SELECTOR_FILA);
  return fila !== null && fila.parentElement === cuerpo ? fila : null;
}

/** Las filas navegables de este cuerpo, en orden DOM (sub-filas incluidas). */
function filasNavegables(cuerpo: Cuerpo): HTMLTableRowElement[] {
  return Array.from(cuerpo.querySelectorAll<HTMLTableRowElement>(`:scope > ${SELECTOR_FILA}`));
}

function dentroDeFila(fila: Element, el: Element | null): el is Element {
  return el !== null && fila.contains(el);
}

/** El `role` del objetivo o de su contenedor con rol, solo si vive dentro de la fila. */
function rolDentroDeFila(objetivo: Element, fila: Element): string | null {
  const conRol = objetivo.closest("[role]");
  return dentroDeFila(fila, conRol) ? conRol.getAttribute("role") : null;
}

function contextoDeTecla(objetivo: Element, fila: Element, hayActiva: boolean): ContextoTeclaFila {
  return {
    esFila: objetivo === fila,
    etiqueta: objetivo.tagName,
    editable: (objetivo as HTMLElement).isContentEditable === true,
    rol: rolDentroDeFila(objetivo, fila),
    conDesplegable: dentroDeFila(fila, objetivo.closest(SELECTOR_DESPLEGABLE)),
    hayActiva,
  };
}

/** El clic cayó en un control de la fila (enlace, botón, campo…): no se le roba el foco. */
function enControlDeFila(objetivo: Element, fila: Element): boolean {
  const control = objetivo.closest(SELECTOR_CONTROL);
  return control !== null && control !== fila && fila.contains(control);
}

/** Enter: el MISMO clic del mouse sobre el enlace cuyo href es `data-fila-href`. */
function abrirFila(fila: HTMLTableRowElement): void {
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
function llevarALaVista(fila: HTMLTableRowElement): void {
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
  const [activa, setActiva] = useState<string | null>(opciones?.inicial ?? null);
  const entrada = filaDeEntrada(claves, activa);

  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const fila = filaDe(cuerpo, objetivo);
    if (!fila) return;
    const accion = accionDeTeclaFila(e, contextoDeTecla(objetivo, fila, activa !== null));
    if (!accion) return;
    e.preventDefault();
    if (accion === "soltar") {
      setActiva(null);
      return;
    }
    if (accion === "abrir") {
      abrirFila(fila);
      return;
    }
    const filas = filasNavegables(cuerpo);
    const i = indiceFilaSiguiente(filas.indexOf(fila), accion, filas.length);
    if (i === null) return;
    const destino = filas[i];
    const clave = destino.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) setActiva(clave);
    destino.focus({ preventScroll: true });
    llevarALaVista(destino);
  };

  const onClick = (e: MouseEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const fila = filaDe(cuerpo, objetivo);
    if (!fila) return;
    const clave = fila.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) setActiva(clave);
    // Un clic en un enlace/botón/campo NO roba el foco (en el ⋯ de Base UI
    // cerraría el menú); en el resto de la celda, el <tr> lo recibe para que
    // Enter funcione de inmediato.
    if (!enControlDeFila(objetivo, fila) && fila.ownerDocument.activeElement !== fila) {
      fila.focus({ preventScroll: true });
    }
  };

  const onFocus = (e: FocusEvent<HTMLTableSectionElement>) => {
    const cuerpo = e.currentTarget;
    const objetivo = e.target as Element;
    if (!cuerpo.contains(objetivo)) return;
    const fila = filaDe(cuerpo, objetivo);
    if (!fila) return;
    const clave = fila.getAttribute(ATRIBUTO_FILA);
    if (clave !== null) setActiva(clave);
  };

  return {
    activa,
    soltar: () => setActiva(null),
    propsCuerpo: { "data-filas-activas": "", onKeyDown, onClick, onFocus },
    propsFila: (clave, href) => atributosFila(clave, activa, entrada, href),
  };
}
