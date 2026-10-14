/**
 * Alias del cliente en Clientes (ID de vuelo por cliente, 13-oct-2026, API
 * 0.0.75): la tabla pinta el alias bajo el nombre y «Alias repetido» cuando
 * el API dice que OTROS clientes lo usan (`alias_compartido_con`, sobre TODO
 * el catálogo); el formulario y el alta rápida quedan cableados a la fuente
 * única `lib/admin/clave-cliente.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Client } from "@/types/clients";
import {
  LABEL_ALIAS,
  PLACEHOLDER_BUSCAR_CLIENTES,
  TEXTO_ALIAS_REPETIDO,
  tituloAliasRepetido,
} from "@/lib/admin/clave-cliente";

// El menú por fila (diálogos, server actions) no es parte de este test.
vi.mock("@/components/admin/clients/client-actions", () => ({
  ClientActions: () => null,
}));

const { ClientsTable } = await import("../clients-table");

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

const cliente = (id: string, nombre: string, extra: Partial<Client> = {}): Client => ({
  id,
  nombre,
  telefono: null,
  email: null,
  razon_social_default: null,
  rfc: null,
  regimen_fiscal_receptor: null,
  uso_cfdi: null,
  codigo_postal: null,
  domicilio_fiscal: null,
  pais_residencia: null,
  canal_origen: null,
  es_broker: false,
  notas: null,
  activo: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...extra,
});

/** La celda «Nombre» (primera <td>) de la fila `id`. */
const celdaNombre = (html: string, id: string) => {
  const desde = html.indexOf(`data-fila="${id}"`);
  expect(desde).toBeGreaterThan(-1);
  return html.slice(desde).match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";
};

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

describe("ClientsTable: alias y «Alias repetido»", () => {
  const html = renderToStaticMarkup(
    <ClientsTable
      clients={[
        cliente("c1", "Juan Chacon", { alias: "juan", alias_compartido_con: ["Juan Satin"] }),
        cliente("c2", "Juan Satin", { alias: "juan", alias_compartido_con: ["Juan Chacon"] }),
        cliente("c3", "Diego Ramírez", { alias: "diego", alias_compartido_con: [] }),
        cliente("c4", "Cliente sin migración"),
        cliente("c5", "No se pudo saber", { alias: "nose", alias_compartido_con: null }),
      ]}
    />,
  );

  it("dos «Alias repetido», cada uno con el title de los OTROS nombres", () => {
    expect(html.split(`>${TEXTO_ALIAS_REPETIDO}<`).length - 1).toBe(2);
    expect(celdaNombre(html, "c1")).toContain(
      `title="${escHtml(tituloAliasRepetido(["Juan Satin"]))}"`,
    );
    expect(celdaNombre(html, "c2")).toContain(
      `title="${escHtml(tituloAliasRepetido(["Juan Chacon"]))}"`,
    );
  });

  it("diego ([]) y el que no se pudo saber (null) van sin marca", () => {
    expect(celdaNombre(html, "c3")).not.toContain(TEXTO_ALIAS_REPETIDO);
    expect(celdaNombre(html, "c5")).not.toContain(TEXTO_ALIAS_REPETIDO);
  });

  it("el alias va BAJO el nombre, en mono y con su title", () => {
    const c3 = celdaNombre(html, "c3");
    expect(c3).toContain(
      `<span class="block font-mono text-[11px] font-normal text-muted-foreground" title="${LABEL_ALIAS}">diego</span>`,
    );
    expect(c3.indexOf("Diego Ramírez")).toBeLessThan(c3.indexOf(">diego<"));
  });

  it("una fila SIN la llave alias (API previo) no pinta línea de alias", () => {
    const c4 = celdaNombre(html, "c4");
    expect(c4).toContain("Cliente sin migración");
    expect(c4).not.toContain("font-mono");
    expect(c4).not.toContain(LABEL_ALIAS);
  });

  it("placeholder nuevo y el alias entra a la búsqueda rápida", () => {
    expect(html).toContain(`placeholder="${PLACEHOLDER_BUSCAR_CLIENTES}"`);
    expect(leer("../clients-table.tsx")).toMatch(/searchText=\{\(c\) =>[\s\S]*?\$\{c\.alias \?\? ""\}`/);
  });
});

describe("formulario de cliente: cableado del alias", () => {
  const dialogo = leer("../client-form-dialog.tsx");

  it("usa la fuente única: aliasEnUsoAction, aliasSugerido y normalizarAliasCaptura en onBlur", () => {
    expect(dialogo).toContain("aliasEnUsoAction(");
    expect(dialogo).toContain("aliasSugerido(");
    expect(dialogo).toMatch(/onBlur=\{\(\) => setAlias\(\(v\) => normalizarAliasCaptura\(v\)\)\}/);
  });

  it("el campo aparece solo si el API lo habilita (edición: la fila trae alias; alta: alias_disponible)", () => {
    expect(dialogo).toContain('typeof initialClient?.alias === "string"');
    expect(dialogo).toContain("aliasDisponible === true");
    expect(dialogo).toMatch(/\{puedeAlias && \(/);
  });

  it("el aviso «ya lo usa» es en vivo con debounce y no consulta con el formulario vacío", () => {
    expect(dialogo).toMatch(/if \(!open \|\| !puedeAlias \|\| !revisarEnUso \|\| !esAliasValido\(aliasEfectivo\)\) return;/);
    expect(dialogo).toMatch(/\}, 400\);/);
    expect(dialogo).toContain("avisoEnUso.alias === aliasEfectivo");
  });

  it("el alias SOLO viaja si se tocó; vacío ⇒ null; el sugerido nunca se manda", () => {
    expect(dialogo).toMatch(/if \(puedeAlias && aliasTocado\) \{/);
    expect(dialogo).toContain('alias.trim() === "" ? null');
    expect(dialogo).toContain("...(aliasPayload !== undefined ? { alias: aliasPayload } : {})");
    // El sugerido es solo el placeholder.
    expect(dialogo).toContain("placeholder={sugerido}");
    expect(dialogo).not.toMatch(/alias:\s*sugerido/);
  });

  it("«Usar el sugerido» es un botón con cursor-pointer", () => {
    expect(dialogo).toMatch(
      /<button\s+type="button"\s+className="cursor-pointer text-brand-600 hover:underline"[\s\S]*?\{textoUsarSugerido\(sugerido\)\}/,
    );
  });

  it("la página pasa aliasDisponible desde alias_disponible y el botón lo baja al diálogo", () => {
    const pagina = leer("../../../../app/admin/clients/page.tsx");
    expect(pagina).toContain("aliasDisponible = res.alias_disponible === true");
    expect(pagina).toContain("<ClientCreateButton aliasDisponible={aliasDisponible} />");
    const boton = leer("../client-create-button.tsx");
    expect(boton).toContain("aliasDisponible={aliasDisponible}");
  });

  it("el alta rápida avisa con textoClienteRapidoCreado y el aviso de alias compartido", () => {
    const rapido = leer("../quick-client-dialog.tsx");
    expect(rapido).toContain("toast.success(textoClienteRapidoCreado(res.data.nombre, res.data.alias))");
    expect(rapido).toContain("avisoAliasCompartido(res.data.alias, res.data.alias_compartido_con)");
    // Sigue pidiendo SOLO el nombre.
    expect(rapido).toContain("createClientAction({ nombre: n, es_broker: false })");
  });
});
