/**
 * Configuración → Créditos de IA → «Modelo de IA» (2-oct-2026, API 0.0.51).
 *
 * Se congela que la tarjeta PINTA lo que dice la fuente única
 * (`lib/admin/ia-modelo.ts`, con su propia prueba):
 *  - API previo / sin permiso ⇒ no se monta; carga fallida ⇒ lo DICE;
 *  - hoy (sin elección) ⇒ «Claude Opus 4.8 (claude-opus-4-8)» · default del
 *    servidor, sin «Volver al del servidor» y «Guardar» apagado;
 *  - con elección ⇒ quién la hizo y «Volver al del servidor»;
 *  - un id fuera del catálogo ⇒ «Otro» con su id y el aviso ámbar;
 *  - y el CABLEADO: el PUT solo sale de la confirmación; la tarjeta vive
 *    dentro de «Créditos de IA», arriba del consumo; la página la monta por
 *    STREAMING (en `<Suspense>`, fuera del `Promise.all`) para que un
 *    pyservices lento no frene el resto de Configuración.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LecturaModeloIa, ModeloIa } from "@/types/ia-modelo";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/configuracion",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, warning: () => {} }),
}));
const setModeloIaAction = vi.fn();
vi.mock("@/app/admin/configuracion/actions", () => ({
  setModeloIaAction: (...a: unknown[]) => setModeloIaAction(...a),
  capturarIaSaldoAction: async () => ({ ok: false, error: "mock" }),
}));

const { ModeloIaCard, ModeloIaCardCargando } = await import("../modelo-ia-card");
const { IaCreditosSection } = await import("../ia-creditos-section");
const {
  ETIQUETA_DEFAULT_SERVIDOR,
  ETIQUETA_ELEGIDO_AQUI,
  ETIQUETA_VOLVER_SERVIDOR_IA,
  TEXTO_FUERA_DE_CATALOGO_IA,
  TEXTO_MODELO_IA_NO_CARGO,
  TEXTO_SERVIDOR_SIN_CONFIRMAR,
  TEXTO_SIN_TARIFA_IA,
} = await import("@/lib/admin/ia-modelo");

const HOY: ModeloIa = {
  configurado: null,
  default_servidor: "claude-opus-4-8",
  efectivo: "claude-opus-4-8",
  catalogo: [],
  actualizado_at: null,
  actualizado_por_nombre: null,
  aviso: null,
};

const ok = (d: Partial<ModeloIa> = {}): LecturaModeloIa => ({ estado: "ok", datos: { ...HOY, ...d } });
const pintar = (l: LecturaModeloIa) => renderToStaticMarkup(<ModeloIaCard lectura={l} />);

/** `<button …>texto</button>` de un botón por su texto visible. */
function boton(html: string, texto: string): string | null {
  const m = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${texto}(?:(?!</button>).)*</button>`));
  return m ? m[0] : null;
}

/** El texto con las entidades HTML que escapa React. */
const html = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("estados de carga", () => {
  it("mientras llega la lectura: esqueleto con el título y sin controles", () => {
    const h = renderToStaticMarkup(<ModeloIaCardCargando />);
    expect(h).toContain('data-modelo-ia="cargando"');
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain("Modelo de IA");
    expect(h).not.toContain("<button");
  });

  it("API previo o sin permiso: la tarjeta no se monta", () => {
    expect(pintar({ estado: "no-disponible" })).toBe("");
  });

  it("carga fallida: lo dice (nunca se esconde) y no ofrece controles", () => {
    const h = pintar({ estado: "fallo" });
    expect(h).toContain("Modelo de IA");
    expect(h).toContain(TEXTO_MODELO_IA_NO_CARGO);
    expect(h).not.toContain("<button");
  });
});

describe("tarjeta con datos", () => {
  it("hoy, sin elección: el del servidor, su tarifa, «Guardar» apagado y sin «Volver al del servidor»", () => {
    const h = pintar(ok());
    expect(h).toContain("Modelo en uso:");
    expect(h).toContain("Claude Opus 4.8 (claude-opus-4-8)");
    expect(h).toContain(ETIQUETA_DEFAULT_SERVIDOR);
    expect(h).toMatch(/data-nota-modelo="en-uso" data-tono="neutro"[^>]*>Tarifa: \$5 \/ \$25 por millón de tokens/);
    // El selector arranca en el modelo en uso.
    expect(h).toMatch(/<button[^>]*>.*Claude Opus 4\.8.*<\/button>/);
    const guardar = boton(h, "Guardar");
    expect(guardar).toMatch(/disabled=""/);
    expect(guardar).toContain("cursor-pointer");
    expect(h).not.toContain(ETIQUETA_VOLVER_SERVIDOR_IA);
    // Nada de «Elegido por…» si nunca se ha guardado.
    expect(h).not.toContain("Elegido");
    // La confirmación no se pinta sin pedirla.
    expect(h).not.toContain("¿Cambiar el modelo de IA?");
  });

  it("con elección: la marca, quién la hizo y «Volver al del servidor» habilitado", () => {
    const h = pintar(
      ok({
        configurado: "claude-sonnet-4-6",
        efectivo: "claude-sonnet-4-6",
        actualizado_at: "2026-10-02T15:15:00Z",
        actualizado_por_nombre: "Mari",
      }),
    );
    expect(h).toContain("Claude Sonnet 4.6 (claude-sonnet-4-6)");
    expect(h).toContain(ETIQUETA_ELEGIDO_AQUI);
    expect(h).toMatch(/Elegido por Mari el [^<]*2026[^<]*\./);
    expect(h).not.toContain(".."); // «10:15 a.m.» ya cierra con punto
    const volver = boton(h, ETIQUETA_VOLVER_SERVIDOR_IA);
    expect(volver).not.toBeNull();
    expect(volver).not.toMatch(/disabled=""/);
    expect(volver).toContain("cursor-pointer");
  });

  it("id fuera del catálogo: «Otro» con su id en el campo y el aviso ÁMBAR del API", () => {
    const aviso = `${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}`;
    const h = pintar(ok({ configurado: "claude-mythos-1", efectivo: "claude-mythos-1", aviso }));
    expect(h).toContain("Otro (escribir id)");
    expect(h).toMatch(/<input[^>]*value="claude-mythos-1"/);
    expect(h).toContain("Id del modelo");
    expect(h).toMatch(/data-nota-modelo="en-uso" data-tono="ambar"/);
    expect(h).toContain(html(aviso));
  });

  it("elección guardada pero el servidor de IA no contestó: se avisa que puede no aplicar aún", () => {
    const h = pintar(ok({ configurado: "claude-sonnet-4-6", default_servidor: null, efectivo: "claude-sonnet-4-6" }));
    expect(h).toContain(TEXTO_SERVIDOR_SIN_CONFIRMAR);
  });

  it("sin saber el del servidor ni elección: no inventa un modelo; el selector pide elegir", () => {
    const h = pintar(ok({ default_servidor: null, efectivo: null }));
    expect(h).toContain("no se pudo consultar cuál es");
    expect(h).toContain("Elige un modelo");
  });

  it("el selector y el campo tienen su etiqueta ligada", () => {
    const h = pintar(ok({ configurado: "claude-mythos-1", efectivo: "claude-mythos-1" }));
    for (const m of h.matchAll(/<label[^>]*for="([^"]+)"/g)) {
      expect(h).toContain(`id="${m[1]}"`);
    }
  });
});

describe("dentro de «Créditos de IA»", () => {
  const resumen = {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    total: { llamadas: 1, input_tokens: 10, output_tokens: 1, costo_usd: 0.1 },
    por_categoria: [],
    por_modelo: [],
    por_dia: [],
    checkpoint: null,
    saldo_estimado: null,
  };

  const tarjeta = <ModeloIaCard lectura={ok()} />;

  it("va ARRIBA del saldo y del consumo", () => {
    const h = renderToStaticMarkup(
      <IaCreditosSection resumen={resumen} mes="2026-10" mesActual="2026-10" tarjetaModelo={tarjeta} />,
    );
    const iModelo = h.indexOf('data-modelo-ia="ok"');
    expect(iModelo).toBeGreaterThan(h.indexOf("Créditos de IA (Anthropic)"));
    expect(iModelo).toBeLessThan(h.indexOf("Saldo estimado"));
    expect(iModelo).toBeLessThan(h.indexOf("Consumo de"));
  });

  it("también sin consumo registrado (estado vacío)", () => {
    const h = renderToStaticMarkup(
      <IaCreditosSection resumen={null} mes="2026-10" mesActual="2026-10" tarjetaModelo={tarjeta} />,
    );
    expect(h.indexOf('data-modelo-ia="ok"')).toBeGreaterThan(-1);
    expect(h.indexOf('data-modelo-ia="ok"')).toBeLessThan(h.indexOf("Aún sin datos"));
  });

  it("sin la prop (o API previo): la sección queda como antes", () => {
    const h = renderToStaticMarkup(<IaCreditosSection resumen={resumen} mes="2026-10" mesActual="2026-10" />);
    expect(h).not.toContain("data-modelo-ia");
  });
});

describe("cableado", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const card = leer("../modelo-ia-card.tsx");

  it("el PUT sale UNA sola vez y solo desde la confirmación", () => {
    expect(card.match(/setModeloIaAction\(/g)?.length).toBe(1);
    expect(card).toMatch(/const confirmar = \(\) => \{[\s\S]*?setModeloIaAction\(modelo\)/);
    // `confirmar()` solo lo llama el botón de la confirmación.
    expect(card.match(/confirmar\(\);/g)?.length).toBe(1);
    expect(card).toMatch(/<AlertDialogAction[\s\S]{0,200}confirmar\(\);/);
    // «Guardar» y «Volver al del servidor» solo ABREN la confirmación.
    expect(card).toContain('pedirConfirmacion({ tipo: "guardar", modelo: elegido })');
    expect(card).toContain('pedirConfirmacion({ tipo: "servidor" })');
    // Título, texto, aviso y botón del diálogo salen de la fuente única.
    expect(card).toContain("textosConfirmacionModeloIa(confirmacion, datos)");
    expect(card).not.toMatch(/¿Cambiar|¿Volver|Sí, cambiar|Sí, usar/);
  });

  it("un id fuera del catálogo repite su aviso ÁMBAR dentro de la descripción del diálogo", () => {
    expect(card).toMatch(
      /<AlertDialogDescription>[\s\S]*?\{textos\.texto\}[\s\S]*?\{textos\.aviso && \([\s\S]*?data-aviso-confirmacion[\s\S]*?<\/AlertDialogDescription>/,
    );
  });

  it("el diálogo no cambia de texto al cerrarse: «abierto» va aparte de la última confirmación", () => {
    expect(card).toContain("<AlertDialog open={abierto}");
    // Cerrar solo apaga `abierto`; la confirmación (y sus textos) se quedan
    // para la animación de salida y solo se sustituyen al pedir otra.
    expect(card).toMatch(/onOpenChange=\{\(o\) => !o && !pendiente && setAbierto\(false\)\}/);
    expect(card).not.toContain("setConfirmacion(null)");
    expect(card.match(/setConfirmacion\(/g)?.length).toBe(1);
  });

  it("el campo «Otro» marca su error solo después de salir de él", () => {
    expect(card).toContain("errorCampoOtroModeloIa(validacion, otroTocado)");
    expect(card).toContain("onBlur={() => setOtroTocado(true)}");
    expect(card).toContain('<Field label="Id del modelo" error={errorOtro ?? undefined}>');
  });

  it("la tarjeta se remonta cuando cambia el modelo guardado", () => {
    expect(card).toContain('key={lectura.datos.configurado ?? ""}');
  });

  it("la página la pide en paralelo pero NO la espera: va por streaming en su <Suspense>", () => {
    const pagina = leer("../../../../app/admin/configuracion/page.tsx");
    // Arranca ANTES del Promise.all y fuera de él (un pyservices lento ya no
    // frena las banderas ni el consumo).
    const iLectura = pagina.indexOf("const lecturaModeloIa = getModeloIa();");
    expect(iLectura).toBeGreaterThan(-1);
    expect(iLectura).toBeLessThan(pagina.indexOf("await Promise.all(["));
    const promiseAll = pagina.match(/await Promise\.all\(\[[\s\S]*?\n {2}\]\);/)?.[0] ?? "";
    expect(promiseAll).not.toBe("");
    expect(promiseAll).not.toContain("getModeloIa");
    // Solo la tarjeta espera, con su esqueleto, y el límite es nuevo por mes.
    expect(pagina).toMatch(
      /tarjetaModelo=\{[\s\S]*?<Suspense key=\{mes\} fallback=\{<ModeloIaCardCargando \/>\}>\s*<TarjetaModeloIa lectura=\{lecturaModeloIa\} \/>\s*<\/Suspense>/,
    );
    expect(pagina).toContain("return <ModeloIaCard lectura={await lectura} />;");
  });

  it("la clave no se pinta como switch en las banderas", () => {
    const cliente = leer("../configuracion-client.tsx");
    expect(cliente).toMatch(/CLAVES_CON_SECCION_PROPIA[\s\S]*CLAVE_CONFIG_MODELO_IA/);
  });
});
