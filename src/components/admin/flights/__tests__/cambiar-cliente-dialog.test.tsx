/**
 * Diálogo «Cambiar cliente» de un vuelo / cotización que ya existe
 * (27-nov-2026, pedido de la oficina).
 *
 * Qué se custodia:
 *  1. El BOTÓN solo lo ve quien guarda cotizaciones; con un motivo se pinta
 *     deshabilitado y lo dice.
 *  2. El CONTENIDO en cada estado: cargando, carga fallida (Reintentar),
 *     lista SIN el cliente actual, «De A a B», botón de confirmar solo con un
 *     cliente elegido, rechazo del API a la vista, hijo de grupo sin botón.
 *  3. CABLEADO: el detalle del vuelo y la página de la cotización montan el
 *     botón junto al nombre del cliente; la cotización lo deshabilita con
 *     cambios sin guardar; la HOJA (papel) no lo importa.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ETIQUETA_CAMBIAR_CLIENTE,
  EXPLICACION_CAMBIAR_CLIENTE,
  TEXTO_CARGANDO_CLIENTES,
  TEXTO_CLIENTES_NO_CARGARON,
  TEXTO_SIN_OTROS_CLIENTES,
  TITULO_BOTON_CAMBIAR_CLIENTE,
  TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS,
} from "@/lib/admin/cambio-cliente";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    warning: () => {},
    info: () => {},
  }),
}));
// Las server actions (red, sesión) no son parte de este test.
vi.mock("@/app/admin/flights/actions", () => ({
  cambiarClienteVueloAction: vi.fn(),
  clientesParaCambioAction: vi.fn(),
}));
// El Dialog de Base UI se monta en un portal (no existe en el render del
// server): aquí se pinta en línea.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: ({ children }: { children?: ReactNode }) => (
      <div data-pie="1">{children}</div>
    ),
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});
// El selector (Combobox de Base UI) se pinta como lista plana de opciones.
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    options,
    value,
    placeholder,
    disabled,
  }: {
    options: { value: string; label: string; description?: string }[];
    value?: string | null;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <ul data-selector="1" data-valor={value ?? ""} data-disabled={disabled ? "1" : "0"}>
      <li data-placeholder="1">{placeholder}</li>
      {options.map((o) => (
        <li key={o.value} data-opcion={o.value}>
          {o.label}
          {o.description ? ` (${o.description})` : ""}
        </li>
      ))}
    </ul>
  ),
}));

const { CambiarClienteBoton, CambiarClienteContenido } = await import(
  "../cambiar-cliente-dialog"
);
type Carga = Parameters<typeof CambiarClienteContenido>[0]["carga"];

const VUELO = "a1b2c3d4-2222-4a7b-8c9d-0e1f2a3b4c5d";
const C_VIEJO = "c0000000-0000-4000-8000-000000000001";
const C_NUEVO = "c0000000-0000-4000-8000-000000000002";

const CLIENTES = [
  { id: C_VIEJO, nombre: "Beh Kay" },
  { id: C_NUEVO, nombre: "January Davila" },
  { id: "c0000000-0000-4000-8000-000000000003", nombre: "Riviera Jets", es_broker: true },
];

const nada = () => {};

function contenido(
  extra: Partial<Parameters<typeof CambiarClienteContenido>[0]> = {},
): string {
  return renderToStaticMarkup(
    <CambiarClienteContenido
      vueloId={VUELO}
      folio={501}
      clienteId={C_VIEJO}
      clienteNombre="Beh Kay"
      carga={{ estado: "lista", clientes: CLIENTES } as Carga}
      elegidoId=""
      error={null}
      guardando={false}
      onElegir={nada}
      onReintentarCarga={nada}
      onConfirmar={nada}
      onCerrar={nada}
      {...extra}
    />,
  );
}

/** El botón de confirmar del pie (no el del título). */
const botonConfirmar = (html: string): string | null =>
  html.match(/<button[^>]*>(?:Cambiando…|Cambiar cliente)<\/button>/)?.[0] ?? null;

/**
 * ¿El HTML trae el ATRIBUTO `disabled`? (No basta buscar «disabled»: las
 * clases de Tailwind `disabled:opacity-50` lo contienen siempre.)
 */
const deshabilitado = (html: string | null): boolean => / disabled=""/.test(html ?? "");

describe("CambiarClienteBoton", () => {
  const boton = (rol: string | null, deshabilitadoPor: string | null = null) =>
    renderToStaticMarkup(
      <CambiarClienteBoton
        rol={rol}
        vueloId={VUELO}
        folio={501}
        clienteId={C_VIEJO}
        clienteNombre="Beh Kay"
        deshabilitadoPor={deshabilitadoPor}
      />,
    );

  it.each(["ADMIN", "COORDINADOR", "DIRECCION"])("%s lo ve, habilitado y con su ayuda", (rol) => {
    const html = boton(rol);
    expect(html).toContain(ETIQUETA_CAMBIAR_CLIENTE);
    expect(html).toContain(`title="${TITULO_BOTON_CAMBIAR_CLIENTE}"`);
    expect(deshabilitado(html)).toBe(false);
    expect(html).toContain("cursor-pointer");
    // Cerrado no monta el diálogo (ni pide clientes).
    expect(html).not.toContain("data-dialogo");
  });

  it.each(["FACTURACION", "ANALISTA", "SOCIO", null])("%s no ve nada", (rol) => {
    expect(boton(rol)).toBe("");
  });

  it("con cambios sin guardar se pinta deshabilitado y dice por qué", () => {
    const html = boton("ADMIN", TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS);
    expect(deshabilitado(html)).toBe(true);
    expect(html).toContain(`title="${TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS}"`);
  });
});

describe("CambiarClienteContenido", () => {
  it("título y explicación: vuelo o cotización, y el precio NO cambia", () => {
    expect(contenido()).toContain("Cambiar el cliente del vuelo #501");
    const cot = contenido({ esCotizacion: true });
    expect(cot).toContain("Cambiar el cliente de la cotización #501");
    expect(cot).toContain(EXPLICACION_CAMBIAR_CLIENTE);
  });

  it("cargando: lo dice y no ofrece confirmar", () => {
    const html = contenido({ carga: { estado: "cargando" } });
    expect(html).toContain(TEXTO_CARGANDO_CLIENTES);
    expect(html).not.toContain("data-selector");
    expect(deshabilitado(botonConfirmar(html))).toBe(true);
  });

  it("la carga falló: se dice y se ofrece Reintentar (nunca una lista vacía)", () => {
    const html = contenido({ carga: { estado: "error" } });
    expect(html).toContain(TEXTO_CLIENTES_NO_CARGARON);
    expect(html).toContain("Reintentar");
    expect(html).not.toContain(TEXTO_SIN_OTROS_CLIENTES);
  });

  it("lista: ofrece los clientes SIN el actual, con la marca de broker", () => {
    const html = contenido();
    expect(html).toContain(`data-opcion="${C_NUEVO}"`);
    expect(html).not.toContain(`data-opcion="${C_VIEJO}"`);
    expect(html).toContain("Riviera Jets (Broker)");
  });

  it("sin otro cliente que elegir: lo dice", () => {
    const html = contenido({
      carga: { estado: "lista", clientes: [{ id: C_VIEJO, nombre: "Beh Kay" }] },
    });
    expect(html).toContain(TEXTO_SIN_OTROS_CLIENTES);
    expect(html).not.toContain("data-selector");
  });

  it("sin elegir: «De Beh Kay a …» y el botón deshabilitado", () => {
    const html = contenido();
    expect(html).toContain("Beh Kay");
    expect(html).toContain("elige el cliente nuevo");
    expect(botonConfirmar(html)).not.toBeNull();
    expect(deshabilitado(botonConfirmar(html))).toBe(true);
  });

  it("con cliente elegido: «De Beh Kay a January Davila» y el botón habilitado", () => {
    const html = contenido({ elegidoId: C_NUEVO });
    const resumen = html.slice(html.indexOf('data-cambio-cliente="resumen"'));
    expect(resumen).toContain("Beh Kay");
    expect(resumen).toContain("January Davila");
    expect(html).not.toContain("elige el cliente nuevo");
    expect(botonConfirmar(html)).not.toBeNull();
    expect(deshabilitado(botonConfirmar(html))).toBe(false);
  });

  it("guardando: botones deshabilitados y «Cambiando…»", () => {
    const html = contenido({ elegidoId: C_NUEVO, guardando: true });
    expect(html).toContain("Cambiando…");
    expect(deshabilitado(botonConfirmar(html))).toBe(true);
    expect(html).toContain('data-disabled="1"');
  });

  it("el rechazo del API queda a la vista (role=alert) con su texto", () => {
    const html = contenido({
      elegidoId: C_NUEVO,
      error:
        "El vuelo #501 tiene la factura A-0440 registrada a nombre de su cliente: cancélala o desliga el vuelo en Facturas emitidas antes de cambiar el cliente.",
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("A-0440");
  });

  it("hijo de GRUPO: se explica, sin selector y sin botón de cambiar", () => {
    const html = contenido({ esDeGrupo: true, grupoFolio: 12 });
    expect(html).toContain("cotización de grupo G-12");
    expect(html).not.toContain("data-selector");
    expect(botonConfirmar(html)).toBeNull();
    expect(html).toContain("Entendido");
  });
});

describe("cableado", () => {
  const leer = (rel: string) =>
    readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

  it("el detalle del vuelo monta el botón junto al cliente, con rol y grupo", () => {
    const src = leer("app/admin/flights/[id]/page.tsx");
    expect(src).toContain(
      'import { CambiarClienteBoton } from "@/components/admin/flights/cambiar-cliente-dialog";',
    );
    const uso = src.slice(src.indexOf("<CambiarClienteBoton"));
    expect(uso).toContain("rol={me?.rol ?? null}");
    expect(uso).toContain("vueloId={snapshot.id}");
    expect(uso).toContain("esDeGrupo={!!grupoHijo}");
  });

  it("la cotización lo monta y lo deshabilita con cambios sin guardar o guardando", () => {
    const src = leer("components/admin/quotes/quote-workspace.tsx");
    const uso = src.slice(src.indexOf("<CambiarClienteBoton"), src.indexOf("rutaComercial.join", src.indexOf("<CambiarClienteBoton")));
    expect(uso).toContain("esCotizacion");
    expect(uso).toContain("sucio || edicion?.saving === true");
    expect(uso).toContain("TITULO_CAMBIAR_CLIENTE_CON_CAMBIOS");
  });

  it("la HOJA (papel) y el cotizador no importan el diálogo: sus fixtures no se tocan", () => {
    for (const f of [
      "components/admin/quotes/quote-sheet.tsx",
      "components/admin/quotes/quote-sheet-interna.tsx",
      "components/admin/quotes/quote-calculator.tsx",
    ]) {
      expect(leer(f)).not.toContain("cambiar-cliente-dialog");
    }
  });
});
