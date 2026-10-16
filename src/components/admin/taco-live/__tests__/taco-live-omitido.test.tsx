/**
 * Tacómetros en vivo con tacómetro OMITIDO (15-oct-2026, API 0.0.81): el API
 * manda la fila omitida con `estado: 'OK'` + `omitido: true` (nunca un
 * estado nuevo). Se custodia: la fila omitida (badge «Omitido», línea con
 * quién/cuándo/por qué, sin sugerencia ni «fin esperado», «Ajustar» sigue y
 * «Deshacer» para oficina), «Omitir tacómetro» en una fila VENCIDA solo con
 * `puedeOmitir`, y que un estado desconocido no revienta.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TacoLiveEscala, TacoLiveVuelo } from "../taco-live-board";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  confirmTacoAction: async () => ({ ok: true }),
  tacoObsAction: async () => ({ ok: true }),
  clearTacoAction: async () => ({ ok: true }),
  omitirTacoAction: async () => ({ ok: true }),
  deshacerOmisionTacoAction: async () => ({ ok: true }),
  iniciarYCompletarVueloAction: async () => ({ ok: true }),
  completeFlightAction: async () => ({ ok: true }),
}));
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div>{children}</div> : null,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Pasa,
    AlertDialogCancel: Pasa,
  };
});

const { TacoLiveBoard } = await import("../taco-live-board");

const AT = "2026-10-15T15:40:00Z";
const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function escala(p: Partial<TacoLiveEscala>): TacoLiveEscala {
  return {
    escala_id: "e1",
    orden: 1,
    origen_iata: "CET",
    destino_iata: "CUN",
    es_ferry: true,
    fecha_salida_plan: "2026-09-12T20:00:00Z",
    esperado_fin: "2026-09-12T21:00:00Z",
    estado: "VENCIDA",
    taco_salida: null,
    taco_salida_origen: null,
    taco_llegada: null,
    taco_llegada_origen: null,
    valor_ia_propuesto: null,
    revision_requerida: false,
    revision_motivo: null,
    capturado_por_nombre: null,
    corregido_por_nombre: null,
    corregido_at: null,
    nota_correccion: null,
    foto_salida_url: null,
    foto_llegada_url: null,
    llegada_estimada: 4455.3,
    minutos_promedio: 50,
    ...p,
  };
}

const vuelo = (escalas: TacoLiveEscala[], estado = "EN_VUELO"): TacoLiveVuelo => ({
  vuelo_id: "v300",
  folio: 300,
  estado,
  fecha_vuelo: "2026-09-12T20:00:00Z",
  matricula: "N4142R",
  piloto_nombre: "Juan Pérez",
  escalas,
});

const OMITIDA = escala({
  estado: "OK",
  omitido: true,
  taco_omitido_at: AT,
  taco_omitido_motivo: "Falló el tacómetro",
  taco_omitido_por_nombre: "Itzi",
  llegada_estimada: null,
});

const tablero = (v: TacoLiveVuelo[], puedeOmitir = true) =>
  renderToStaticMarkup(<TacoLiveBoard vuelos={v} fecha="2026-09-12" puedeOmitir={puedeOmitir} />);

const BOTON_OMITIR = ">Omitir tacómetro</button>";

describe("Tacómetros en vivo: fila con tacómetro omitido", () => {
  const html = tablero([vuelo([OMITIDA])]);

  it("badge «Omitido» (no «OK»), borde slate y la línea con quién, cuándo y por qué", () => {
    expect(html).toContain(">Omitido<");
    expect(html).not.toContain(">OK<");
    expect(html).toContain("border-slate-400/50");
    expect(html).toContain(
      esc(
        "Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro. No pide lectura y aporta 0 h. Si al final hay lectura, captúrala con «Corregir» y la omisión se retira sola.",
      ),
    );
  });

  it("sin sugerencia ni «fin esperado»; «Ajustar» sigue, sin «Comprobar», con «Deshacer»", () => {
    expect(html).not.toContain("Sugerencia:");
    expect(html).not.toContain("fin esperado");
    expect(html).toContain("Ajustar");
    expect(html).not.toContain("Comprobar");
    expect(html).toContain("Deshacer</button>");
    expect(html).not.toContain(BOTON_OMITIR);
  });

  it("sin permiso de oficina no hay «Deshacer»", () => {
    expect(tablero([vuelo([OMITIDA])], false)).not.toContain("Deshacer</button>");
  });

  it("la omisión por fecha (sin la llave `omitido`) también cuenta", () => {
    expect(tablero([vuelo([{ ...OMITIDA, omitido: undefined }])])).toContain(">Omitido<");
  });
});

describe("Tacómetros en vivo: «Omitir tacómetro»", () => {
  it("en una fila VENCIDA sin llegada con puedeOmitir, con cursor-pointer", () => {
    const html = tablero([vuelo([escala({})])]);
    const i = html.indexOf(BOTON_OMITIR);
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("cursor-pointer");
    expect(html).toContain("Sugerencia:");
  });

  it("también EN_CURSO; nunca ESPERANDO, con llegada, sin permiso ni en un vuelo COMPLETADO", () => {
    expect(tablero([vuelo([escala({ estado: "EN_CURSO" })])])).toContain(BOTON_OMITIR);
    expect(tablero([vuelo([escala({ estado: "ESPERANDO" })])])).not.toContain(BOTON_OMITIR);
    expect(tablero([vuelo([escala({ taco_llegada: 4455.3 })])])).not.toContain(BOTON_OMITIR);
    expect(tablero([vuelo([escala({})])], false)).not.toContain(BOTON_OMITIR);
    expect(tablero([vuelo([escala({})], "COMPLETADO")])).not.toContain(BOTON_OMITIR);
  });
});

describe("Tacómetros en vivo: estado desconocido", () => {
  it("no revienta (se pinta como «Esperando»)", () => {
    const rara = escala({ estado: "NUEVO_ESTADO" as unknown as TacoLiveEscala["estado"] });
    const html = tablero([vuelo([rara])]);
    expect(html).toContain(">Esperando<");
  });
});
