/**
 * Lo que el OPERADOR ve cuando una pantalla no cargó (21-sep-2026). Los
 * textos puros se prueban en `lib/admin/__tests__/pantalla-error.test.ts`;
 * aquí se cuida el MARCADO, que es lo que de verdad llega a la pantalla:
 *  - el mensaje en inglés de Next NUNCA se pinta (fue el síntoma reportado);
 *  - el código (digest), la hora de Cancún y la ruta SÍ, porque son lo único
 *    que sistemas puede buscar en los logs;
 *  - la pantalla del layout (API caído ⇒ ninguna página llega a su boundary)
 *    lleva los MISMOS datos y ofrece Reintentar antes que cerrar sesión.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Fuera del App Router no hay router: `TarjetaErrorCarga` («Reintentar» =
// router.refresh) solo necesita existir para este render de estructura.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

// `UnknownErrorScreen` arrastra la acción de cerrar sesión (cliente de
// Supabase), y `@/lib/env` valida al importarse: hay que poner las variables
// antes de importar los componentes.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://ejemplo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-de-prueba";
process.env.NEXT_PUBLIC_API_URL ??= "https://api.ejemplo.test";

const { PantallaError } = await import("../pantalla-error");
const { UnknownErrorScreen } = await import("../unknown-error-screen");
const { MENSAJE_ERROR, TITULO_ERROR } = await import("@/lib/admin/pantalla-error");

/** El texto que Next pone en producción y que el cliente vio en pantalla. */
const INGLES = "An error occurred in the Server Components render. The specific message is omitted";

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&quot;|&amp;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("PantallaError (error boundary del panel)", () => {
  const error = Object.assign(new Error(INGLES), { digest: "2880198520" });
  const html = renderToStaticMarkup(<PantallaError error={error} reintentar={() => {}} />);
  const t = texto(html);

  it("habla en es-MX y NO pinta el mensaje en inglés de Next", () => {
    expect(t).toContain(TITULO_ERROR);
    expect(t).toContain(MENSAJE_ERROR);
    expect(t).not.toContain("An error occurred");
    expect(t).not.toContain("Server Components render");
  });

  it("muestra código, hora de Cancún y pantalla (lo que pide sistemas)", () => {
    expect(t).toContain("Código");
    expect(t).toContain("2880198520");
    expect(t).toContain("Hora (Cancún)");
    expect(t).toContain("Pantalla");
  });

  it("ofrece Reintentar y Volver al inicio", () => {
    expect(t).toContain("Reintentar");
    expect(t).toContain("Volver al inicio");
  });
});

describe("UnknownErrorScreen (falla /v1/me: el layout no carga)", () => {
  // Lo que responde Railway mientras el API se reinicia.
  const html = renderToStaticMarkup(
    <UnknownErrorScreen message="Application failed to respond" />,
  );
  const t = texto(html);

  it("es la pantalla que se ve con el API caído y trae los datos de soporte", () => {
    expect(t).toContain("No pudimos cargar el panel");
    expect(t).toContain("Detalle");
    expect(t).toContain("Application failed to respond");
    expect(t).toContain("Hora (Cancún)");
    expect(t).toContain("Pantalla");
  });

  it("la salida principal es Reintentar, no cerrar sesión", () => {
    expect(t.indexOf("Reintentar")).toBeGreaterThan(-1);
    expect(t.indexOf("Reintentar")).toBeLessThan(t.indexOf("Cerrar sesión"));
  });
});
