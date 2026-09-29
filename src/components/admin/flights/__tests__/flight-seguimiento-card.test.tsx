/**
 * «SEGUIMIENTO DE LA COTIZACIÓN» en el detalle del vuelo (29-sep-2026).
 *
 * Pedido del cliente con la captura del #358 (columna derecha, bajo
 * «Pasajeros»): «un apartado para poner unas notas que se deben agregar a la
 * cotización. Ej. Pablo ya terminó el vuelito de hoy y los pax pidieron un
 * transporte el cual no está incluido en la cotización pero se necesita
 * cobrar».
 *
 * Qué se custodia aquí:
 *  1. la lista: PENDIENTES arriba (ámbar), RESUELTAS abajo (verde, con quién,
 *     cuándo y cómo se resolvió) y el contador en el título;
 *  2. el formulario (texto + «Debe reflejarse en la cotización» encendido +
 *     «Agregar nota») solo para quien escribe; SOCIO/ANALISTA leen;
 *  3. una carga FALLIDA nunca se pinta como «Sin notas»;
 *  4. el CABLEADO de la confirmación de borrado: el bote de basura solo abre
 *     el diálogo; el DELETE sale únicamente de «Eliminar» del diálogo;
 *  5. la card vive en la columna derecha, bajo «Pasajeros»; la cabecera del
 *     vuelo y el pre-cierre llevan a su ancla.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SeguimientoNota } from "@/types/seguimiento";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  crearSeguimientoAction: async () => ({ ok: true }),
  actualizarSeguimientoAction: async () => ({ ok: true }),
  eliminarSeguimientoAction: async () => ({ ok: true }),
}));

const { FlightSeguimientoCard, NotaItem } = await import("../flight-seguimiento-card");

const VUELO = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";

const TRANSPORTE: SeguimientoNota = {
  id: "11111111-1111-4111-8111-111111111111",
  texto: "Pablo ya terminó el vuelito de hoy y los pax pidieron un transporte; no está en la cotización, hay que cobrarlo.",
  afecta_cotizacion: true,
  estado: "PENDIENTE",
  created_at: "2026-09-29T19:05:00Z",
  creado_por: { id: "u-itzi", nombre: "Itzi" },
  resuelta_at: null,
  resuelta_por: null,
  resolucion: null,
};
const HIELERA: SeguimientoNota = {
  ...TRANSPORTE,
  id: "22222222-2222-4222-8222-222222222222",
  texto: "Confirmar con el cliente si la hielera va por su cuenta.",
  afecta_cotizacion: false,
  created_at: "2026-09-28T15:00:00Z",
};
const CATERING: SeguimientoNota = {
  ...TRANSPORTE,
  id: "33333333-3333-4333-8333-333333333333",
  texto: "Catering extra para 4 pax.",
  estado: "RESUELTA",
  created_at: "2026-09-29T21:00:00Z",
  resuelta_at: "2026-09-29T22:30:00Z",
  resuelta_por: { id: "u-mari", nombre: "Mari" },
  resolucion: "Se agregó como extra en la v3.",
};

function card(notas: SeguimientoNota[] | null, rol: string | null = "ADMIN"): string {
  return renderToStaticMarkup(
    <FlightSeguimientoCard flightId={VUELO} flightFolio={358} notas={notas} rol={rol} />,
  );
}

/** Posición de un texto en el marcado (para comprobar el orden). */
const pos = (html: string, texto: string) => {
  const i = html.indexOf(texto);
  expect(i, `no aparece «${texto}»`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("lista: orden, badges y autoría", () => {
  const html = card([CATERING, HIELERA, TRANSPORTE]);

  it("título, descripción y ancla de la card", () => {
    expect(html).toContain("Seguimiento de la cotización");
    expect(html).toContain(
      "Ajustes que se deben cobrar o agregar a la cotización (transporte, extras, cambios) y su seguimiento.",
    );
    expect(html).toContain('id="seguimiento-cotizacion"');
  });

  it("PENDIENTES primero (la más reciente arriba) y la RESUELTA al final", () => {
    const transporte = pos(html, "Pablo ya terminó el vuelito");
    const hielera = pos(html, "Confirmar con el cliente");
    const catering = pos(html, "Catering extra para 4 pax.");
    expect(transporte).toBeLessThan(hielera);
    expect(hielera).toBeLessThan(catering);
  });

  it("contador de pendientes en el título", () => {
    expect(html).toMatch(/data-seguimiento-contador[^>]*>2 pendientes</);
  });

  it("badge PENDIENTE ámbar y RESUELTA verde con quién, cuándo y cómo", () => {
    const pendientes = html.match(/data-seguimiento-estado="PENDIENTE"/g) ?? [];
    const resueltas = html.match(/data-seguimiento-estado="RESUELTA"/g) ?? [];
    expect(pendientes).toHaveLength(2);
    expect(resueltas).toHaveLength(1);
    expect(html).toMatch(/amber[^"]*"[^>]*>Pendiente</);
    expect(html).toMatch(/green[^"]*"[^>]*>Resuelta</);
    expect(html).toMatch(/Resuelta por Mari · 29 sept?\.? 2026/);
    expect(html).toContain("↳ Se agregó como extra en la v3.");
  });

  it("quién anotó y cuándo (hora Cancún)", () => {
    // 19:05 UTC = 14:05 en Cancún.
    expect(html).toMatch(/Itzi · 29 sept?\.? 2026, 2:05/);
  });

  it("una nota que no cambia la cotización se marca «Solo seguimiento»", () => {
    const hielera = renderToStaticMarkup(
      <NotaItem
        nota={HIELERA}
        puedeEditar
        onResolver={() => {}}
        onReabrir={() => {}}
        onEliminar={() => {}}
      />,
    );
    expect(hielera).toContain("Solo seguimiento");
    const transporte = renderToStaticMarkup(
      <NotaItem
        nota={TRANSPORTE}
        puedeEditar
        onResolver={() => {}}
        onReabrir={() => {}}
        onEliminar={() => {}}
      />,
    );
    expect(transporte).not.toContain("Solo seguimiento");
  });

  it("sin pendientes no hay contador", () => {
    expect(card([CATERING])).not.toContain("data-seguimiento-contador");
  });
});

describe("acciones y formulario por rol", () => {
  it("ADMIN/COORDINADOR/FACTURACION: formulario con el ejemplo, switch ENCENDIDO y botón", () => {
    for (const rol of ["ADMIN", "COORDINADOR", "FACTURACION"]) {
      const html = card([TRANSPORTE, CATERING], rol);
      expect(html, rol).toContain(
        'placeholder="Ej. Los pax pidieron transporte terrestre; no está en la cotización, hay que cobrarlo."',
      );
      expect(html, rol).toContain("Debe reflejarse en la cotización");
      expect(html, rol).toMatch(/role="switch"[^>]*aria-checked="true"/);
      expect(html, rol).toContain("Agregar nota");
      expect(html, rol).toContain("Marcar resuelta");
      expect(html, rol).toContain("Reabrir");
      expect(html, rol).toContain('aria-label="Eliminar nota"');
    }
  });

  it("«Agregar nota» va deshabilitado mientras no hay texto", () => {
    const html = card([], "ADMIN");
    const boton = html.match(/<button(?:(?!<button)[\s\S])*?Agregar nota<\/button>/)?.[0];
    expect(boton).toBeDefined();
    expect(boton).toMatch(/\sdisabled=""/);
  });

  it("SOCIO y ANALISTA leen: sin formulario ni acciones", () => {
    for (const rol of ["SOCIO", "ANALISTA"]) {
      const html = card([TRANSPORTE, CATERING], rol);
      expect(html, rol).toContain("Pablo ya terminó el vuelito");
      expect(html, rol).not.toContain("Agregar nota");
      expect(html, rol).not.toContain("Marcar resuelta");
      expect(html, rol).not.toContain("Reabrir");
      expect(html, rol).not.toContain("Eliminar nota");
    }
  });

  it("todo botón lleva cursor-pointer (regla del cliente)", () => {
    const html = card([TRANSPORTE, CATERING], "ADMIN");
    const botones = html.match(/<button[^>]*>/g) ?? [];
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) expect(b, b).toContain("cursor-pointer");
    // El switch y su etiqueta ligada también.
    expect(html).toMatch(/role="switch"[^>]*class="[^"]*cursor-pointer/);
    expect(html).toMatch(/<label[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*>Debe reflejarse/);
  });
});

describe("carga: vacío vs fallo (jamás «sin notas» cuando la carga falló)", () => {
  it("lista vacía = «Sin notas de seguimiento» + formulario", () => {
    const html = card([]);
    expect(html).toContain("Sin notas de seguimiento en el vuelo #358.");
    expect(html).toContain("Agregar nota");
  });

  it("carga fallida = aviso + Reintentar, sin «Sin notas»", () => {
    const html = card(null);
    expect(html).toContain("No se pudieron cargar las notas de seguimiento.");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("Sin notas de seguimiento");
  });
});

// ---------- Cableado (el diálogo vive en un portal: se lee el código) ----------

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const cardSrc = leer("../flight-seguimiento-card.tsx");
const pagina = leer("../../../../app/admin/flights/[id]/page.tsx");
const precierre = leer("../../reportes/pre-cierre-card.tsx");

describe("cableado — borrar siempre CONFIRMA", () => {
  it("el bote de basura solo abre la confirmación", () => {
    expect(cardSrc).toContain("onEliminar={() => setBorrando(n)}");
    // La única llamada al DELETE vive en confirmarEliminar…
    const llamadas = cardSrc.match(/eliminarSeguimientoAction\(/g) ?? [];
    expect(llamadas).toHaveLength(1);
    expect(cardSrc).toMatch(
      /const confirmarEliminar = \(\) => \{\s*if \(!borrando\) return;[\s\S]*?await eliminarSeguimientoAction\(flightId, id\)/,
    );
    // …y confirmarEliminar solo lo dispara «Eliminar» del AlertDialog.
    expect(cardSrc).toMatch(
      /<AlertDialogAction[\s\S]*?confirmarEliminar\(\);[\s\S]*?\{pendingBorrar \? "Eliminando…" : "Eliminar"\}/,
    );
    expect(cardSrc).toContain("<AlertDialog open={!!borrando}");
    expect(cardSrc).toContain("confirmacionEliminarSeguimiento(borrando)");
  });

  it("«Marcar resuelta» abre el diálogo de «¿Cómo se resolvió?»; «Reabrir» va directo", () => {
    expect(cardSrc).toContain("onResolver={() => setResolviendo(n)}");
    expect(cardSrc).toContain("¿Cómo se resolvió? (opcional)");
    expect(cardSrc).toMatch(/estado: "RESUELTA",\s*resolucion: resolucion\.trim\(\) \|\| null/);
    expect(cardSrc).toMatch(/actualizarSeguimientoAction\(flightId, nota\.id, \{ estado: "PENDIENTE" \}\)/);
  });
});

describe("cableado — la nota ya la eliminó alguien más (404)", () => {
  it("borrar, resolver y reabrir cierran, avisan y refrescan en vez de repetir el error", () => {
    const usos = cardSrc.match(/esNotaInexistente\(res\)/g) ?? [];
    expect(usos).toHaveLength(3);
    // Borrar: el diálogo se cierra y la lista se refresca.
    expect(cardSrc).toMatch(
      /esNotaInexistente\(res\)\) \{[\s\S]*?toast\.info\(AVISO_NOTA_INEXISTENTE\);\s*setBorrando\(null\);\s*router\.refresh\(\);/,
    );
    // Resolver: el diálogo se cierra y la lista se refresca.
    expect(cardSrc).toMatch(
      /esNotaInexistente\(res\)\) \{\s*toast\.info\(AVISO_NOTA_INEXISTENTE\);\s*onClose\(\);\s*router\.refresh\(\);/,
    );
  });
});

describe("cableado — dónde vive y quién lleva a ella", () => {
  it("columna derecha del detalle, DEBAJO de «Pasajeros» y antes de «Notas»", () => {
    const pasajeros = pagina.indexOf("{/* Pasajeros (manifiesto) */}");
    const seguimiento = pagina.indexOf("<FlightSeguimientoCard");
    const notas = pagina.indexOf("(snapshot.notas || snapshot.notas_internas) && (");
    expect(pasajeros).toBeGreaterThan(0);
    expect(seguimiento).toBeGreaterThan(pasajeros);
    expect(notas).toBeGreaterThan(seguimiento);
    // Con un API previo (404) o sin permiso la card no se pinta.
    expect(pagina).toContain('seguimientoCarga.estado !== "no-disponible"');
  });

  it("la cabecera del vuelo lleva a la card cuando hay ajustes por cotizar", () => {
    expect(pagina).toMatch(/conteoSeguimiento\.cotizacion > 0 &&[\s\S]*?href=\{`#\$\{ANCLA_SEGUIMIENTO\}`\}/);
    expect(pagina).toContain("textoBadgeCabecera(conteoSeguimiento.cotizacion)");
  });

  it("los chips del pre-cierre de ajustes pendientes llevan DIRECTO a la card", () => {
    expect(precierre).toMatch(
      /item\.clave === CLAVE_PRECIERRE_SEGUIMIENTO\s*\?\s*hrefSeguimientoVuelo\(v\.id\)/,
    );
    expect(precierre).toContain("textoAjustesPrecierre(v.notas)");
  });
});
