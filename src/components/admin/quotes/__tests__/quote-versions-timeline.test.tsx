/**
 * HISTORIAL DE VERSIONES — quién hizo cada versión (9-nov-2026, API 0.0.132).
 *
 * Pedido de la oficina con la captura del historial (v1 «Versión inicial»,
 * v2 «Corrección»): «pueden poner quién hace cada versión». El API manda
 * `creado_por_nombre` por versión; la línea de tiempo lo pinta junto a la
 * fecha como «· por <nombre>». Sin nombre (usuario que ya no existe, API
 * anterior) no se pinta nada; nunca un uuid.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteVersionsTimeline, textoAutorVersion } from "../quote-versions-timeline";
import type { CotizacionVersion } from "@/types/quotes-persisted";

const VUELO = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";

function version(n: number, extra: Partial<CotizacionVersion> = {}): CotizacionVersion {
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`,
    vuelo_id: VUELO,
    version: n,
    aeronave_id: null,
    ruta_id: null,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_one_way: null,
    es_redondo_auto: null,
    num_aterrizajes: null,
    pasajeros: 2,
    pase_abordar: null,
    tiempo_cobrable_hr: "1.5",
    tarifa_tipo: "BROKER",
    tarifa_hora_usd: "1000",
    subtotal_vuelo_usd: "2090",
    tuas_usd: null,
    iva_pct: null,
    iva_usd: null,
    monto_total_usd: "2424.40",
    tc_usd_mxn: null,
    metodo_cobro: null,
    calculo_snapshot: null,
    motivo: n === 1 ? "Versión inicial" : "Corrección",
    created_at: "2026-11-07T18:42:00Z",
    created_by: "uuuuuuuu-0000-4000-8000-0000000000it",
    ...extra,
  } as CotizacionVersion;
}

const html = (versions: CotizacionVersion[]) =>
  renderToStaticMarkup(<QuoteVersionsTimeline versions={versions} currentVersion={2} />);

describe("textoAutorVersion", () => {
  it("«por <nombre>» con el nombre del API, sin espacios de más", () => {
    expect(textoAutorVersion({ creado_por_nombre: "  Itzi   Canales " })).toBe("por Itzi Canales");
  });

  it("sin nombre (null, vacío, ausente) o si llegara un uuid: null, no se pinta nada", () => {
    expect(textoAutorVersion({ creado_por_nombre: null })).toBeNull();
    expect(textoAutorVersion({ creado_por_nombre: "   " })).toBeNull();
    expect(textoAutorVersion({})).toBeNull();
    expect(textoAutorVersion(null)).toBeNull();
    expect(textoAutorVersion({ creado_por_nombre: "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7" })).toBeNull();
  });
});

describe("QuoteVersionsTimeline — autor de cada versión", () => {
  it("cada versión dice quién la hizo junto a su fecha", () => {
    const out = html([
      version(2, { creado_por_nombre: "Mary López" }),
      version(1, { creado_por_nombre: "Itzi Canales" }),
    ]);
    expect(out.match(/data-autor-version/g)).toHaveLength(2);
    // v2 (la actual) va primero.
    expect(out.indexOf("por Mary López")).toBeGreaterThan(-1);
    expect(out.indexOf("por Mary López")).toBeLessThan(out.indexOf("por Itzi Canales"));
  });

  it("una versión sin nombre no pinta autor y el resto del renglón queda igual (API anterior: ninguna lo pinta)", () => {
    const mixto = html([version(2, { creado_por_nombre: null }), version(1, { creado_por_nombre: "Itzi" })]);
    expect(mixto.match(/data-autor-version/g)).toHaveLength(1);
    const viejo = html([version(2), version(1)]);
    expect(viejo).not.toContain("data-autor-version");
    expect(viejo).not.toContain(" · por ");
    expect(viejo).toContain("Corrección");
    expect(viejo).toContain("Versión inicial");
    // Jamás el uuid de `created_by`.
    expect(viejo).not.toContain("uuuuuuuu-0000-4000-8000-0000000000it");
  });
});
