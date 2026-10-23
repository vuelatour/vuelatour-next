/**
 * El hero de balances de `/admin/reportes` (12-oct-2026): la grilla de
 * aviones (`AircraftBalancePicker`, ya sin selector ni estado), los atajos de
 * periodo como enlaces puros, el texto plegable y el nombre accesible de
 * «Ver en pantalla». Marcado con `react-dom/server` (sin DOM) y cableado
 * leído del fuente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { descargaVistaBalance, hrefVistaBalance, textoPeriodoVista } from "@/lib/admin/balance-vista";
import {
  TEXTO_AVIONES_NO_CARGARON,
  TEXTO_SIN_AVIONES,
  TITULO_AVION_INACTIVO,
  type AvionBalanceItem,
} from "@/lib/admin/reportes-ui";
import type { MesCierre, MesCierreAvion } from "@/types/cierres";

/** Lo que recibe cada `ExcelExportButton` (testigo). */
interface PropsBotonExcel {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
  title?: string;
  "aria-label"?: string;
}
const botonesExcel: PropsBotonExcel[] = [];

// El botón real importa `@/lib/download` → `@/lib/env`, que lanza sin
// variables: aquí solo se registra con qué se pintó.
vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: (p: PropsBotonExcel) => {
    botonesExcel.push(p);
    return (
      <button data-descarga={p.filename} title={p.title} aria-label={p["aria-label"]}>
        {p.label}
      </button>
    );
  },
}));
// CIERRE POR AVIÓN (23-oct-2026): el tile monta `CierreAvionAcciones`
// (cliente) → las server actions del cierre (→ `@/lib/env`), sonner y el router.
vi.mock("@/app/admin/reportes/actions", () => ({
  previaCierreAction: async () => ({ ok: false }),
  cerrarMesAction: async () => ({ ok: false }),
  reabrirMesAction: async () => ({ ok: false }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { AircraftBalancePicker } = await import("../aircraft-balance-picker");
const { AtajosPeriodoReportes } = await import("../atajos-periodo-reportes");
const { VerEnPantallaLink } = await import("../ver-en-pantalla-link");
const { TextoPlegable } = await import("../../texto-plegable");

const UUID = (n: number) => `3f9a1c2e-0000-4000-8000-00000000000${n}`;
const DESDE = "2026-10-01";
const HASTA = "2026-10-12";

/** La flota real YA ordenada (activos A–Z, XB-IJP inactivo al final); N621TX sin color. */
const FLOTA: AvionBalanceItem[] = [
  { id: UUID(3), matricula: "N4142R", modelo: "Piper Seneca V", activa: true, color: "#F59E0B" },
  { id: UUID(4), matricula: "N58BT", modelo: "King Air", activa: true, color: "#8B5CF6" },
  { id: UUID(5), matricula: "N621TX", modelo: "Cessna Caravan", activa: true, color: null },
  { id: UUID(2), matricula: "XA-VGV", modelo: "Cessna 206", activa: true, color: "#22C55E" },
  { id: UUID(6), matricula: "XB-ANU", modelo: "Cessna 182", activa: true, color: "#8B5E3C" },
  { id: UUID(1), matricula: "XB-PEV", modelo: "Cessna 205", activa: true, color: "#3B82F6" },
  { id: UUID(7), matricula: "XB-IJP", modelo: "Cessna 210", activa: false, color: null },
];

function pintarGrilla(p: { aircraft?: AvionBalanceItem[]; disponibles?: boolean } = {}) {
  botonesExcel.length = 0;
  return renderToStaticMarkup(
    <AircraftBalancePicker aircraft={p.aircraft ?? FLOTA} disponibles={p.disponibles} desde={DESDE} hasta={HASTA} />,
  );
}

const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");

describe("AircraftBalancePicker: un tile por avión, en el orden recibido", () => {
  it("siete tiles con su matrícula, en el orden que manda la página", () => {
    const html = pintarGrilla();
    const tiles = [...html.matchAll(/<li[^>]*data-avion="([^"]+)"/g)].map((m) => m[1]);
    expect(tiles).toEqual(["N4142R", "N58BT", "N621TX", "XA-VGV", "XB-ANU", "XB-PEV", "XB-IJP"]);
    expect(html).toContain('aria-label="Aviones"');
    expect(html).toContain("Piper Seneca V");
    // Lista de verdad para VoiceOver (el preflight de Tailwind quita las viñetas).
    expect(html).toMatch(/<ul[^>]*role="list"[^>]*aria-label="Aviones"/);
    // 2 columnas desde sm, 3 desde xl y 4 desde 2xl: en lg/xl con 3/4 columnas
    // los dos botones del tile se partían en dos renglones.
    expect(html).toContain("sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4");
    expect(html).not.toContain("lg:grid-cols-3");
    // La matrícula va en mono; el Badge «Inactiva» no hereda la mono.
    expect(html).toContain('<span class="truncate font-mono">XB-PEV</span>');
    expect(html).not.toMatch(/<p class="[^"]*font-mono/);
  });

  it("«Ver en pantalla» de cada tile = `hrefVistaBalance` del avión, con su nombre accesible", () => {
    const html = pintarGrilla();
    for (const avion of FLOTA) {
      const href = hrefVistaBalance({ tipo: "avion", avionId: avion.id }, DESDE, HASTA).replace(/&/g, "&amp;");
      expect(href).toContain(`/admin/reportes/balance?avion=${avion.id}&amp;desde=${DESDE}&amp;hasta=${HASTA}`);
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`aria-label="Ver en pantalla · ${avion.matricula}"`);
    }
    expect((html.match(/>Ver en pantalla</g) ?? []).length).toBe(7);
  });

  it("el Excel de cada avión = `descargaVistaBalance` (misma ruta, archivo y query) + «Excel» con el nombre largo", () => {
    pintarGrilla();
    expect(botonesExcel).toHaveLength(7);
    for (const avion of FLOTA) {
      const esperado = descargaVistaBalance({ tipo: "avion", avionId: avion.id }, DESDE, HASTA, avion.matricula);
      expect(esperado).not.toBeNull();
      const boton = botonesExcel.find((b) => b.path === `/v1/aircraft/${avion.id}/balance.xlsx`);
      expect(boton).toEqual({
        path: `/v1/aircraft/${avion.id}/balance.xlsx`,
        filename: `balance-${avion.matricula}-${DESDE}-${HASTA}.xlsx`,
        query: { desde: DESDE, hasta: HASTA },
        label: "Excel",
        title: `Descargar el balance de ${avion.matricula} en Excel`,
        "aria-label": `Descargar el balance de ${avion.matricula} en Excel`,
      });
      expect({ path: boton!.path, filename: boton!.filename, query: boton!.query }).toEqual({
        path: esperado!.path,
        filename: esperado!.filename,
        query: esperado!.query,
      });
    }
  });

  it("el punto de color solo en los tiles con hex; «Inactiva» una sola vez (XB-IJP) con su tooltip; sin opacidad", () => {
    const html = pintarGrilla();
    const puntos = html.match(/style="background-color:#[0-9A-Fa-f]{6}"/g) ?? [];
    expect(puntos).toHaveLength(FLOTA.filter((a) => a.color).length);
    expect(html).toContain("background-color:#3B82F6");
    expect((html.match(/>Inactiva</g) ?? []).length).toBe(1);
    expect(html).toContain(`title="${TITULO_AVION_INACTIVO}"`);
    expect(html).toMatch(/data-avion="XB-IJP"[\s\S]*?>Inactiva</);
    // La explicación del `title` (solo ratón) también va como texto `sr-only`
    // (teclado, táctil y lector), una sola vez.
    expect((html.match(new RegExp(`<span class="sr-only">${TITULO_AVION_INACTIVO}</span>`, "g")) ?? []).length).toBe(1);
    // Ningún tile se atenúa (el único `opacity-` del marcado es el
    // `disabled:opacity-50` base de `buttonVariants`, que no es del tile).
    for (const li of html.match(/<li [^>]*>/g) ?? []) expect(li).not.toContain("opacity-");
    expect(html.replace(/disabled:opacity-50/g, "")).not.toContain("opacity-");
  });

  it("todo enlace lleva la manita", () => {
    const html = pintarGrilla();
    const enlaces = html.match(/<a [^>]*href=[^>]*>/g) ?? [];
    expect(enlaces).toHaveLength(7);
    for (const a of enlaces) expect(a).toContain("cursor-pointer");
  });

  it("los aviones NO cargaron ⇒ se dice (role=status), sin enlaces y sin «no hay aviones»", () => {
    const html = pintarGrilla({ aircraft: [], disponibles: false });
    expect(html).toContain(TEXTO_AVIONES_NO_CARGARON);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-aviones="no-cargaron"');
    expect(html).not.toContain("<a href");
    expect(html).not.toContain(TEXTO_SIN_AVIONES);
    expect(botonesExcel).toHaveLength(0);
  });

  it("carga OK y lista vacía ⇒ «No hay aviones dados de alta…»", () => {
    const html = pintarGrilla({ aircraft: [] });
    expect(html).toContain(TEXTO_SIN_AVIONES);
    expect(html).toContain('data-aviones="vacio"');
    expect(html).not.toContain(TEXTO_AVIONES_NO_CARGARON);
  });

  it("cableado por fuente: enlace y descarga del helper; ya no es un selector con estado", () => {
    const src = leer("components/admin/reportes/aircraft-balance-picker.tsx");
    expect(src).toContain('destino={{ tipo: "avion", avionId: avion.id }}');
    expect(src).toContain('descargaVistaBalance({ tipo: "avion", avionId: avion.id }, desde, hasta, avion.matricula)');
    expect(src).toContain("export function AircraftBalancePicker(");
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("useState");
    expect(src).not.toContain("SearchableSelect");
    expect(src).not.toContain("descargarDelApi");
    expect(src).not.toContain("Sin aeronaves");
    expect(src).not.toContain("opacity-");
  });
});

describe("CIERRE POR AVIÓN (23-oct-2026, API 0.0.104): chip y botón de cierre en cada tile", () => {
  const fila = (id: string, matricula: string, over: Partial<MesCierreAvion> = {}): MesCierreAvion => ({
    aeronave_id: id,
    matricula,
    modelo: null,
    activa: true,
    estado: "ABIERTO",
    cerrado_at: null,
    cerrado_por: null,
    reabierto_at: null,
    reabierto_por: null,
    reabierto_motivo: null,
    version: 0,
    puede_cerrar: true,
    motivo_no_cerrable: null,
    totales: null,
    ...over,
  });
  /** Septiembre PARCIAL: N58BT cerrado, los demás activos abiertos; XB-IJP (inactivo) sin fila. */
  const SEP: MesCierre = {
    periodo: "2026-09",
    estado: "PARCIAL",
    cerrado_at: null,
    cerrado_por: null,
    reabierto_at: null,
    reabierto_por: null,
    reabierto_motivo: null,
    version: 0,
    puede_cerrar: true,
    motivo_no_cerrable: null,
    totales: null,
    aviones_activos: 6,
    aviones_cerrados: 1,
    aviones: [
      fila(UUID(3), "N4142R"),
      fila(UUID(4), "N58BT", { estado: "CERRADO", cerrado_at: "2026-10-16T19:02:00Z", cerrado_por: { id: "u1", nombre: "Ale" }, puede_cerrar: false, motivo_no_cerrable: "YA_CERRADO" }),
      fila(UUID(5), "N621TX"),
      fila(UUID(2), "XA-VGV"),
      fila(UUID(6), "XB-ANU"),
      fila(UUID(1), "XB-PEV"),
    ],
  };
  const PERIODO = { mes: "2026-09", enCurso: false };
  const pintar = (p: { rol?: string | null; mesCierre?: MesCierre | null; periodo?: { mes: string; enCurso: boolean } | null; modoCierre?: "POR_AVION" | "GLOBAL" }) => {
    botonesExcel.length = 0;
    return renderToStaticMarkup(
      <AircraftBalancePicker
        aircraft={FLOTA}
        desde="2026-09-01"
        hasta="2026-09-30"
        rol={p.rol ?? null}
        mesCierre={p.mesCierre === undefined ? SEP : p.mesCierre}
        periodo={p.periodo === undefined ? PERIODO : p.periodo}
        modoCierre={p.modoCierre ?? "POR_AVION"}
      />,
    );
  };
  const tile = (html: string, matricula: string) => {
    const i = html.indexOf(`data-avion="${matricula}"`);
    const j = html.indexOf("<li ", i + 1);
    return html.slice(i, j === -1 ? undefined : j);
  };

  it("ADMIN: cada tile con su chip y «Cerrar septiembre 2026» (aria-label con la matrícula); el cerrado con «Reabrir»; sin fila (XB-IJP) nada; los enlaces del libro siguen", () => {
    const html = pintar({ rol: "ADMIN" });
    const n621 = tile(html, "N621TX");
    expect(n621).toContain('data-cierre-avion="N621TX"');
    expect(n621).toContain(">Abierto<");
    expect(n621).toContain('aria-label="Cerrar septiembre 2026 · N621TX"');
    expect(n621).toContain(">Ver en pantalla<");
    const n58 = tile(html, "N58BT");
    expect(n58).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(n58).toContain('aria-label="¿Reabrir septiembre 2026 · N58BT?"');
    expect(n58).not.toContain("Cerrar septiembre");
    expect(tile(html, "XB-IJP")).not.toContain("data-cierre-avion");
    expect((html.match(/aria-label="Cerrar septiembre 2026 · /g) ?? []).length).toBe(5);
    expect(botonesExcel).toHaveLength(7);
  });

  it("FACTURACION: tiles con matrícula, modelo, chip y botón, SIN «Ver en pantalla» ni «Excel»; no reabre", () => {
    const html = pintar({ rol: "FACTURACION" });
    expect(html).not.toContain("Ver en pantalla");
    expect(botonesExcel).toHaveLength(0);
    expect(html).not.toContain("<a ");
    expect(html).toContain("Cessna Caravan");
    expect((html.match(/aria-label="Cerrar septiembre 2026 · /g) ?? []).length).toBe(5);
    expect(tile(html, "N58BT")).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(html).not.toContain("Reabrir");
  });

  /** ¿Hay algún botón de cierre/reapertura? (los «Excel» del libro también son botones). */
  const conBotonesCierre = (html: string) => /data-cierre-acciones=|Cerrar septiembre|Reabrir/.test(html);

  it("ANALISTA: chips sin botones de cierre, con los enlaces del libro", () => {
    const html = pintar({ rol: "ANALISTA" });
    expect(conBotonesCierre(html)).toBe(false);
    expect((html.match(/data-estado-cierre="abierto"/g) ?? []).length).toBe(5);
    expect(html).toContain('data-estado-cierre="cerrado"');
    expect((html.match(/>Ver en pantalla</g) ?? []).length).toBe(7);
  });

  it("FALLBACK (`por_avion` false): el chip del mes GLOBAL en cada tile y ningún botón de cierre", () => {
    const global: MesCierre = { ...SEP, estado: "ABIERTO", aviones: undefined, aviones_activos: undefined, aviones_cerrados: undefined };
    const html = pintar({ rol: "ADMIN", mesCierre: global, modoCierre: "GLOBAL" });
    expect((html.match(/>Abierto</g) ?? []).length).toBe(7);
    expect(conBotonesCierre(html)).toBe(false);
  });

  it("«Este mes»: chip «En curso» y sin botones; rango que no es un mes o mes sin fila: ni chip ni botón", () => {
    const enCurso = pintar({ rol: "ADMIN", periodo: { mes: "2026-10", enCurso: true } });
    expect(enCurso).toContain("En curso (se cierra a partir del 1-nov)");
    expect(conBotonesCierre(enCurso)).toBe(false);
    const sinMes = pintar({ rol: "ADMIN", periodo: null });
    expect(sinMes).not.toContain("data-cierre-avion");
    expect(conBotonesCierre(sinMes)).toBe(false);
    const sinFila = pintar({ rol: "ADMIN", mesCierre: null });
    expect(sinFila).not.toContain("data-cierre-avion");
  });

  it("el picker sigue server-safe (sin hooks): el botón vive en el hijo cliente", () => {
    const src = leer("components/admin/reportes/aircraft-balance-picker.tsx");
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("useState");
    expect(src).toContain("<CierreAvionAcciones");
    expect(leer("components/admin/reportes/cierre-avion-acciones.tsx")).toMatch(/^"use client";/);
  });
});

describe("AtajosPeriodoReportes: enlaces puros «Este mes» / «Mes pasado»", () => {
  it("con el periodo por defecto, «Este mes» es el activo (aria-current) y los dos son enlaces con manita", () => {
    const html = renderToStaticMarkup(<AtajosPeriodoReportes hoy="2026-10-12" desde={DESDE} hasta={HASTA} />);
    const enlaces = html.match(/<a [^>]*>/g) ?? [];
    expect(enlaces).toHaveLength(2);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Atajos de periodo"');
    expect(html).toContain('href="/admin/reportes?desde=2026-10-01&amp;hasta=2026-10-12"');
    expect(html).toContain('href="/admin/reportes?desde=2026-09-01&amp;hasta=2026-09-30"');
    expect(html).toMatch(/<a [^>]*data-atajo="este-mes"[^>]*aria-current="true"/);
    expect(html).not.toMatch(/<a [^>]*data-atajo="mes-pasado"[^>]*aria-current/);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(html).toContain(`title="${textoPeriodoVista("2026-10-01", "2026-10-12")}"`);
    expect(html).toContain(`title="${textoPeriodoVista("2026-09-01", "2026-09-30")}"`);
    expect(html).toContain("Este mes · Octubre 2026");
    expect(html).toContain("Mes pasado · Septiembre 2026");
    for (const a of enlaces) expect(a).toContain("cursor-pointer");
  });

  it("con septiembre completo el activo es «Mes pasado»; con `hoy` inválido no pinta nada", () => {
    const sep = renderToStaticMarkup(
      <AtajosPeriodoReportes hoy="2026-10-12" desde="2026-09-01" hasta="2026-09-30" />,
    );
    expect(sep).toMatch(/<a [^>]*data-atajo="mes-pasado"[^>]*aria-current="true"/);
    expect(sep).not.toMatch(/<a [^>]*data-atajo="este-mes"[^>]*aria-current/);
    expect(renderToStaticMarkup(<AtajosPeriodoReportes hoy="nada" desde={DESDE} hasta={HASTA} />)).toBe("");
  });
});

describe("TextoPlegable: cerrado, con el contenido en el DOM", () => {
  it("un <details> sin `open`, el título en el <summary> con manita y los hijos impresos", () => {
    const html = renderToStaticMarkup(
      <TextoPlegable titulo="¿Qué trae cada libro?">
        <p>Balance mensual: el libro completo de siempre.</p>
      </TextoPlegable>,
    );
    expect(html).toMatch(/^<details[^>]*>/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toMatch(/<summary[^>]*cursor-pointer[^>]*>[\s\S]*¿Qué trae cada libro\?/);
    // Objetivo táctil de 24 px (WCAG 2.5.8): el summary no mide solo la línea de texto.
    expect(html).toMatch(/<summary[^>]*min-h-6/);
    expect(html).toContain("Balance mensual: el libro completo de siempre.");
  });
});

describe("VerEnPantallaLink: nombre accesible opcional", () => {
  it("con `aria-label` lo pinta; sin él no aparece el atributo", () => {
    const con = renderToStaticMarkup(
      <VerEnPantallaLink
        destino={{ tipo: "vuelatour", modo: "mensual" }}
        desde={DESDE}
        hasta={HASTA}
        aria-label="Ver en pantalla · Balance mensual"
      />,
    );
    expect(con).toContain('aria-label="Ver en pantalla · Balance mensual"');
    expect(con).toContain(">Ver en pantalla<");
    const sin = renderToStaticMarkup(
      <VerEnPantallaLink destino={{ tipo: "vuelatour", modo: "mensual" }} desde={DESDE} hasta={HASTA} />,
    );
    expect(sin).not.toContain("aria-label");
    expect(sin).toContain(">Ver en pantalla<");
  });
});

describe("FlightReportPicker: cuando los vuelos no cargaron lo dice", () => {
  it("el fuente acepta `fallo` y usa los textos del helper", () => {
    const src = leer("components/admin/flights/flight-report-picker.tsx");
    expect(src).toContain("fallo");
    expect(src).toContain("EMPTY_VUELOS_NO_CARGARON");
    expect(src).toContain("TEXTO_VUELOS_NO_CARGARON");
    expect(src).toContain('from "@/lib/admin/reportes-ui"');
  });
});
