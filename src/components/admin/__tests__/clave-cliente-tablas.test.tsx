import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlightsTable, type FlightRow } from "../flights/flights-table";
import { QuotesTable, type QuoteListRow } from "../quotes/quotes-table";
import { AircraftFlightsTable } from "../aircraft/aircraft-flights-table";
import { coincideBusqueda } from "@/lib/admin/busqueda";
import {
  ENCABEZADO_FOLIO_ID,
  PLACEHOLDER_BUSCAR_COTIZACIONES,
  PLACEHOLDER_BUSCAR_VUELOS,
  PLACEHOLDER_BUSCAR_VUELOS_AVION,
  TITULO_CLAVE_CLIENTE,
} from "@/lib/admin/clave-cliente";
import type { FlightListItem } from "@/types/flights";

/**
 * ID de vuelo por cliente BAJO el folio en las tres listas (13-oct-2026, API
 * 0.0.75): Vuelos, Cotizaciones y la tarjeta «Vuelos» del avión. Con clave se
 * ve «#376» y debajo «january02-211026»; SIN clave (API previo) la celda del
 * folio es BYTE A BYTE la de antes (marcado congelado el 13-oct-2026 con el
 * código previo) y el folio nunca se quita. (DataTable, next/link y los
 * badges no usan next/navigation: no hace falta mockearlo.)
 */

const CLAVE = "january02-211026";

const filaVuelo = (extra: Partial<FlightRow> = {}): FlightRow => ({
  id: "v376",
  folio: 376,
  cliente_nombre: "January Davila",
  es_externo: false,
  operador_externo: null,
  ruta: "CUN → MID → CUN",
  matricula: "XA-VGV",
  piloto_nombre: "Piloto Uno",
  fecha_vuelo: "2026-10-21T14:00:00Z",
  fecha_solicitud: null,
  monto_total_usd: "1000",
  estado: "CONFIRMADO",
  falta_taco: false,
  en_cotizacion: false,
  cobrado: false,
  es_interno: false,
  cotizacion_abierta: false,
  total_cobrado_usd: 0,
  sin_tc_count: 0,
  ...extra,
});

const filaCotizacion = (extra: Partial<QuoteListRow> = {}): QuoteListRow => ({
  id: "v376",
  href: "/admin/quotes/v376",
  folio: 376,
  clienteNombre: "January Davila",
  esExterno: false,
  operadorExterno: null,
  ruta: "CUN → MID → CUN",
  avionMatricula: "XA-VGV",
  avionModelo: "C206",
  avionesExtra: 0,
  fechaVuelo: "2026-10-21T14:00:00Z",
  fechaSolicitud: null,
  montoTotalUsd: "1000",
  version: 1,
  estado: "CONFIRMADO",
  sinAsignar: false,
  faltaPiloto: false,
  cobrado: false,
  esInterno: false,
  cotizacionAbierta: false,
  totalCobradoUsd: 0,
  sinTcCount: 0,
  ...extra,
});

const vueloAvion = (extra: Partial<FlightListItem> = {}): FlightListItem =>
  ({
    id: "v376",
    folio: 376,
    origen_iata: "CUN",
    destino_iata: "MID",
    ruta_iatas: ["CUN", "MID", "CUN"],
    fecha_vuelo: "2026-10-21T14:00:00Z",
    pasajeros: 2,
    monto_total_usd: "1000",
    estado: "CONFIRMADO",
    ...extra,
  }) as FlightListItem;

/** La primera celda de datos (columna «Folio / ID») de la fila `id`. */
const celdaFolio = (html: string, id: string) => {
  const desde = html.indexOf(`data-fila="${id}"`);
  expect(desde).toBeGreaterThan(-1);
  const m = html.slice(desde).match(/<td[^>]*>([\s\S]*?)<\/td>/);
  return m?.[1] ?? "";
};

const primerEncabezado = (html: string) =>
  html.match(/<th\s[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "";

describe("Vuelos (FlightsTable)", () => {
  const html = renderToStaticMarkup(
    <FlightsTable
      rows={[filaVuelo({ clave_cliente: CLAVE }), filaVuelo({ id: "v375", folio: 375, clave_cliente: null })]}
    />,
  );

  it("con clave: «#376» y debajo el ID dentro de [data-clave-cliente], en el link del folio", () => {
    const celda = celdaFolio(html, "v376");
    expect(celda).toContain("#376");
    expect(celda).toContain(`data-clave-cliente="${CLAVE}"`);
    expect(celda).toContain(`title="${TITULO_CLAVE_CLIENTE}"`);
    expect(celda).toMatch(
      new RegExp(`<a [^>]*href="/admin/flights/v376">#376<span[^>]*data-clave-cliente="${CLAVE}"[^>]*>${CLAVE}</span></a>`),
    );
  });

  it("sin clave: la celda del folio es la de SIEMPRE (sin [data-clave-cliente])", () => {
    expect(celdaFolio(html, "v375")).toBe(
      '<span class="inline-flex flex-col items-start gap-1"><a class="block hover:underline underline-offset-2" href="/admin/flights/v375">#375</a></span>',
    );
  });

  it("con grupo, el ID va ANTES del badge del grupo", () => {
    const conGrupo = renderToStaticMarkup(
      <FlightsTable
        rows={[
          filaVuelo({
            clave_cliente: CLAVE,
            grupo: { id: "g1", folio: 12, nombre: "Grupo", posicion: 1, total: null },
          }),
        ]}
      />,
    );
    const celda = celdaFolio(conGrupo, "v376");
    expect(celda.indexOf(CLAVE)).toBeLessThan(celda.indexOf("/admin/quotes/grupo/g1"));
  });

  it("encabezado «Folio / ID» y el placeholder nuevo", () => {
    expect(primerEncabezado(html)).toBe(ENCABEZADO_FOLIO_ID);
    expect(html).toContain(`placeholder="${PLACEHOLDER_BUSCAR_VUELOS}"`);
  });
});

describe("Cotizaciones (QuotesTable)", () => {
  const html = renderToStaticMarkup(
    <QuotesTable
      quotes={[
        filaCotizacion({ claveCliente: CLAVE }),
        filaCotizacion({ id: "v375", href: "/admin/quotes/v375", folio: 375 }),
      ]}
    />,
  );

  it("con clave: «#376» y el ID dentro de [data-clave-cliente]", () => {
    const celda = celdaFolio(html, "v376");
    expect(celda).toContain("#376");
    expect(celda).toMatch(
      new RegExp(`<a [^>]*href="/admin/quotes/v376">#376<span[^>]*data-clave-cliente="${CLAVE}"[^>]*>${CLAVE}</span></a>`),
    );
  });

  it("sin clave (llave ausente): la celda del folio es la de SIEMPRE", () => {
    expect(celdaFolio(html, "v375")).toBe(
      '<span class="inline-flex flex-col items-start gap-1"><a class="block hover:underline underline-offset-2" href="/admin/quotes/v375">#375</a></span>',
    );
  });

  it("encabezado «Folio / ID» y el placeholder nuevo", () => {
    expect(primerEncabezado(html)).toBe(ENCABEZADO_FOLIO_ID);
    expect(html).toContain(`placeholder="${PLACEHOLDER_BUSCAR_COTIZACIONES}"`);
  });
});

describe("«Vuelos» del avión (AircraftFlightsTable)", () => {
  const html = renderToStaticMarkup(
    <AircraftFlightsTable
      flights={[vueloAvion({ clave_cliente: CLAVE }), vueloAvion({ id: "v375", folio: 375 })]}
    />,
  );

  it("con clave: «#376» y debajo el ID", () => {
    expect(celdaFolio(html, "v376")).toBe(
      `<span class="inline-flex flex-col items-start"><span>#376</span><span data-clave-cliente="${CLAVE}" title="${TITULO_CLAVE_CLIENTE}" class="block whitespace-nowrap font-mono text-[11px] leading-tight text-muted-foreground">${CLAVE}</span></span>`,
    );
  });

  it("sin clave: solo «#375», como siempre", () => {
    expect(celdaFolio(html, "v375")).toBe("#375");
  });

  it("encabezado «Folio / ID» y el placeholder nuevo", () => {
    expect(primerEncabezado(html)).toBe(ENCABEZADO_FOLIO_ID);
    expect(html).toContain(`placeholder="${PLACEHOLDER_BUSCAR_VUELOS_AVION}"`);
  });
});

describe("se puede buscar por el ID (búsqueda rápida de las tablas)", () => {
  // Mismo texto que arma `searchText` (el cableado lo vigila
  // clave-cliente-cableado.test.ts): el «-» NO separa palabras.
  const texto = `#376 January Davila  CUN → MID → CUN XA-VGV Piloto Uno  ${CLAVE}`;

  it("«january02» empata por inicio de palabra; el ID completo y en mayúsculas también", () => {
    expect(coincideBusqueda(texto, "january02")).toBe(true);
    expect(coincideBusqueda(texto, CLAVE)).toBe(true);
    expect(coincideBusqueda(texto, "JANUARY02-211026")).toBe(true);
  });

  it("otro número del mismo cliente NO empata", () => {
    expect(coincideBusqueda(texto, "january03")).toBe(false);
  });
});
