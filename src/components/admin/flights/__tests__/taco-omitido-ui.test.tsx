/**
 * Tacómetro OMITIDO por tramo en el panel (15-oct-2026, API 0.0.81).
 *
 * Caso real #300 (N4142R, CET → CUN, 12-sep): falló el tacómetro y no había
 * forma de registrar la llegada. Qué se custodia aquí (sin DOM:
 * `renderToStaticMarkup` con los diálogos pintados EN LÍNEA cuando están
 * abiertos):
 *  1. «Tacómetros por tramo» (`EscalasCard`): el omitido pinta badge, la
 *     línea «Omitido por …» + nota y «Deshacer»; «Corregir» SIGUE (camino de
 *     la lectura real); «Omitir tacómetro» solo con `puedeOmitir` y tramo
 *     vivo sin llegada de un vuelo propio no cerrado;
 *  2. el cuerpo del diálogo: 3 chips con `cursor-pointer`, contador y el
 *     botón deshabilitado con 9 caracteres;
 *  3. `FlightActionsBar`: «Completar vuelo» / «Iniciar y completar» según
 *     `omision`;
 *  4. `FlightsTable`: icono slate con `taco_omitido`.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FlightEscala, FlightListItem } from "@/types/flights";
import type { FlightRow } from "../flights-table";

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
  fillTacoGapsAction: async () => ({ ok: true }),
  getUltimoTacoAction: async () => ({ ok: true }),
  clearTacoAction: async () => ({ ok: true }),
  omitirTacoAction: async () => ({ ok: true }),
  deshacerOmisionTacoAction: async () => ({ ok: true }),
  iniciarYCompletarVueloAction: async () => ({ ok: true }),
  completeFlightAction: async () => ({ ok: true }),
  startFlightAction: async () => ({ ok: true }),
  updatePermisoAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/storage/taco-fotos", () => ({ uploadTacoFoto: async () => "" }));
// La barra arrastra hojas y diálogos que no son de este test.
vi.mock("../flight-assign-sheet", () => ({ FlightAssignSheet: () => null }));
vi.mock("../flight-meta-sheet", () => ({ FlightMetaSheet: () => null }));
vi.mock("../cubrir-externo-dialog", () => ({ CubrirExternoDialog: () => null }));
vi.mock("../combinar-vuelos-dialog", () => ({ CombinarVuelosDialog: () => null }));
vi.mock("../flight-danger-actions", () => ({ FlightDangerActions: () => null }));
// Diálogos pintados EN LÍNEA (solo abiertos); los botones conservan
// `disabled` y `className` para poder comprobarlos.
vi.mock("@/components/ui/alert-dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Boton = ({
    children,
    className,
    disabled,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
  }) => (
    <button type="button" className={className} disabled={disabled} data-boton-dialogo="">
      {children}
    </button>
  );
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="">{children}</div> : null,
    AlertDialogContent: Pasa,
    AlertDialogHeader: Pasa,
    AlertDialogFooter: Pasa,
    AlertDialogTitle: Pasa,
    AlertDialogDescription: Pasa,
    AlertDialogAction: Boton,
    AlertDialogCancel: Boton,
  };
});

const { EscalasCard } = await import("../escalas-card");
const { FormularioOmitirTaco } = await import("../taco-omitir-dialog");
const { FlightActionsBar } = await import("../flight-actions-bar");
const { FlightsTable } = await import("../flights-table");

const VUELO = "6c0e3f7a-1b2d-4e5f-8a9b-0c1d2e3f4a5b";
const AT = "2026-10-15T15:40:00Z";
const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const veces = (html: string, t: string) => html.split(t).length - 1;

function escala(p: Partial<FlightEscala> & Pick<FlightEscala, "orden">): FlightEscala {
  return {
    id: `esc-${p.orden}`,
    vuelo_id: VUELO,
    origen_iata: "CET",
    destino_iata: "CUN",
    aeronave_id: null,
    piloto_id: null,
    estado_permiso: "no_aplica",
    fecha_salida_plan: null,
    foto_plan_vuelo_url: null,
    google_calendar_id: null,
    pasajeros: 0,
    pasajeros_nombres: [],
    es_ferry: true,
    requiere_pernocta: false,
    pernocta_costo_usd: null,
    tipo_parada: "NORMAL",
    servicio_notas: null,
    solo_operativa: false,
    taco_salida: null,
    taco_llegada: null,
    foto_taco_salida_url: null,
    foto_taco_llegada_url: null,
    cancelada_at: null,
    valor_ia_propuesto: null,
    revision_requerida: false,
    revision_motivo: null,
    hora_salida: null,
    hora_llegada: null,
    capturado_offline: false,
    sincronizado_at: null,
    capturado_por: null,
    corregido_por: null,
    nota_correccion: null,
    corregido_at: null,
    notas: null,
    created_at: "2026-09-12T18:00:00Z",
    updated_at: "2026-10-15T15:40:00Z",
    ...p,
  };
}

const OMITIDO = escala({
  orden: 1,
  taco_omitido_at: AT,
  taco_omitido_por: "u-itzi",
  taco_omitido_motivo: "Falló el tacómetro",
  taco_omitido_por_nombre: "Itzi",
});
const SIN_LLEGADA = escala({ orden: 2, origen_iata: "CUN", destino_iata: "CZM" });
const CON_LLEGADA = escala({
  orden: 3,
  origen_iata: "CZM",
  destino_iata: "CUN",
  taco_salida: "4455.30",
  taco_llegada: "4456.10",
});
const CANCELADO = escala({
  orden: 4,
  origen_iata: "CUN",
  destino_iata: "MID",
  cancelada_at: AT,
  cancelada_motivo: "No voló",
});

const card = (escalas: FlightEscala[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <EscalasCard
      flightId={VUELO}
      escalas={escalas}
      puedeOmitir
      vueloEstado="EN_VUELO"
      vueloEsExterno={false}
      vueloFolio={300}
      {...extra}
    />,
  );

const BOTON_OMITIR = ">Omitir tacómetro</button>";

describe("EscalasCard: tramo con tacómetro omitido", () => {
  const html = card([OMITIDO]);

  it("pinta el badge (con el motivo en el title), la línea «Omitido por …» y la nota", () => {
    expect(html).toContain(">Tacómetro omitido<");
    expect(html).toContain(
      `title="${esc("Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro")}"`,
    );
    expect(html).toContain(
      esc(
        "Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro. No pide lectura y aporta 0 h. Si al final hay lectura, captúrala con «Corregir» y la omisión se retira sola.",
      ),
    );
    expect(html).toContain("border-slate-400/50");
    expect(html).not.toContain(">Sin tacómetros<");
  });

  it("«Deshacer» con cursor-pointer, «Corregir» se conserva y NO ofrece omitir otra vez", () => {
    const i = html.indexOf("Deshacer</button>");
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("cursor-pointer");
    expect(html).toContain("Corregir");
    expect(html).not.toContain(BOTON_OMITIR);
  });

  it("sin el botón «Propagar lecturas» cuando lo único sin lectura está omitido", () => {
    expect(html).not.toContain("Propagar lecturas");
    expect(card([OMITIDO, SIN_LLEGADA])).toContain("Propagar lecturas");
  });

  it("con salida copiada: «4,455.10 → omitido»", () => {
    expect(card([{ ...OMITIDO, taco_salida: "4455.10" }])).toContain("4,455.10 → omitido");
  });

  it("«Deshacer» solo para oficina y nunca en un vuelo CANCELADO; sí en COMPLETADO", () => {
    expect(card([OMITIDO], { puedeOmitir: false })).not.toContain("Deshacer</button>");
    expect(card([OMITIDO], { vueloEstado: "CANCELADO" })).not.toContain("Deshacer</button>");
    expect(card([OMITIDO], { vueloEstado: "COMPLETADO" })).toContain("Deshacer</button>");
  });
});

describe("EscalasCard: «Omitir tacómetro»", () => {
  it("se ofrece en el tramo vivo sin llegada con puedeOmitir, con su ayuda y cursor-pointer", () => {
    const html = card([SIN_LLEGADA]);
    expect(veces(html, BOTON_OMITIR)).toBe(1);
    const i = html.indexOf(BOTON_OMITIR);
    const boton = html.slice(html.lastIndexOf("<button", i), i);
    expect(boton).toContain("cursor-pointer");
    expect(boton).toContain(
      `title="${esc("No hubo forma de capturar la lectura (falló el tacómetro, foto ilegible…): el tramo deja de pedirla, aporta 0 h y queda registrado quién y por qué.")}"`,
    );
  });

  it("también en un vuelo nunca iniciado (CONFIRMADO, caso #301)", () => {
    expect(card([SIN_LLEGADA], { vueloEstado: "CONFIRMADO" })).toContain(BOTON_OMITIR);
  });

  it("no sin permiso, ni en cancelado, con llegada, omitido, COMPLETADO o externo", () => {
    expect(card([SIN_LLEGADA], { puedeOmitir: false })).not.toContain(BOTON_OMITIR);
    expect(card([CANCELADO])).not.toContain(BOTON_OMITIR);
    expect(card([CON_LLEGADA])).not.toContain(BOTON_OMITIR);
    expect(card([OMITIDO])).not.toContain(BOTON_OMITIR);
    expect(card([SIN_LLEGADA], { vueloEstado: "COMPLETADO" })).not.toContain(BOTON_OMITIR);
    expect(card([SIN_LLEGADA], { vueloEsExterno: true })).not.toContain(BOTON_OMITIR);
    // Sin estado/folio del vuelo (llamador previo) la card es la de siempre.
    expect(
      renderToStaticMarkup(<EscalasCard flightId={VUELO} escalas={[SIN_LLEGADA]} />),
    ).not.toContain(BOTON_OMITIR);
  });

  it("solo en el tramo que lo admite cuando el vuelo mezcla tramos", () => {
    const html = card([OMITIDO, SIN_LLEGADA, CON_LLEGADA, CANCELADO]);
    expect(veces(html, BOTON_OMITIR)).toBe(1);
  });
});

describe("cuerpo del diálogo «Omitir tacómetro»", () => {
  const form = (motivo: string, pending = false) =>
    renderToStaticMarkup(
      <FormularioOmitirTaco motivo={motivo} onMotivo={() => {}} pending={pending} onConfirmar={() => {}} />,
    );

  it("los 3 chips con cursor-pointer, la etiqueta, el placeholder y el tope de 500", () => {
    const html = form("");
    for (const m of ["Falló el tacómetro", "Lectura ilegible y sin forma de recuperarla", "No se tomó la foto"]) {
      const i = html.indexOf(`>${m}</button>`);
      expect(i, m).toBeGreaterThan(-1);
      expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("cursor-pointer");
    }
    expect(html).toContain("Motivos frecuentes (puedes editarlos):");
    expect(html).toContain("Motivo (obligatorio)");
    expect(html).toContain('maxLength="500"');
    expect(html).toContain(
      `placeholder="${esc("Ej. Falló el tacómetro; no hubo forma de registrar la llegada")}"`,
    );
    expect(html).toMatch(/aria-describedby="[^"]+-contador"/);
  });

  const botonConfirmar = (html: string) => {
    const i = html.indexOf(">Omitir tacómetro</button>");
    expect(i).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<button", i), i);
  };

  it("con 9 caracteres bloquea (botón deshabilitado y contador en rojo con el aviso)", () => {
    const html = form("123456789");
    expect(botonConfirmar(html)).toContain("disabled");
    expect(html).toContain("9/500 · mínimo 10 · Escribe el motivo (mínimo 10 caracteres).");
    expect(html).toContain("text-red-600");
  });

  it("los espacios no cuentan (como en el API)", () => {
    expect(botonConfirmar(form("   Falló    "))).toContain("disabled");
  });

  it("con 10 o más se habilita; mientras guarda dice «Omitiendo…»", () => {
    const html = form("Falló el tacómetro");
    expect(botonConfirmar(html)).not.toContain("disabled");
    expect(html).toContain("18/500 · mínimo 10");
    expect(form("Falló el tacómetro", true)).toContain(">Omitiendo…</button>");
  });
});

const vuelo = (p: Partial<FlightListItem> = {}): FlightListItem =>
  ({
    id: VUELO,
    folio: 300,
    estado: "EN_VUELO",
    es_externo: false,
    aeronave_id: "a1",
    piloto_id: "p1",
    estado_permiso: "no_aplica",
    combinado_con_id: null,
    ...p,
  }) as FlightListItem;

const barra = (f: FlightListItem, omision?: { completable: boolean; requiereIniciar: boolean; omitidos: number }) =>
  renderToStaticMarkup(<FlightActionsBar flight={f} aircraft={[]} pilots={[]} omision={omision} />);

describe("FlightActionsBar con omisiones", () => {
  it("EN_VUELO completable por omisión: botón verde «Completar vuelo»", () => {
    const html = barra(vuelo(), { completable: true, requiereIniciar: false, omitidos: 1 });
    expect(html).toContain("Completar vuelo</button>");
    expect(html).not.toContain("Cerrar vuelo");
    expect(html).not.toContain("Iniciar y completar");
  });

  it("nunca iniciado (CONFIRMADO): «Iniciar y completar» con su ayuda", () => {
    const html = barra(vuelo({ estado: "CONFIRMADO" }), {
      completable: false,
      requiereIniciar: true,
      omitidos: 1,
    });
    expect(html).toContain("Iniciar y completar</button>");
    expect(html).toContain(
      esc("Este vuelo nunca se inició en la app. Se marcará EN VUELO y, enseguida, COMPLETADO con las horas que sí se capturaron."),
    );
    expect(html).not.toContain("Completar vuelo</button>");
  });

  it("sin piloto/avión: «Iniciar y completar» deshabilitado (el API exige asignación)", () => {
    const html = barra(vuelo({ estado: "CONFIRMADO", piloto_id: null }), {
      completable: false,
      requiereIniciar: true,
      omitidos: 1,
    });
    const i = html.indexOf("Iniciar y completar</button>");
    expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("disabled");
  });

  it("sin omisión (o faltan llegadas): la barra de siempre", () => {
    const sin = barra(vuelo());
    expect(sin).not.toContain("Completar vuelo</button>");
    expect(sin).not.toContain("Cerrar vuelo");
    expect(sin).not.toContain("Iniciar y completar");
    expect(barra(vuelo(), { completable: false, requiereIniciar: false, omitidos: 1 })).not.toContain(
      "Completar vuelo</button>",
    );
  });

  it("un externo EN_VUELO sigue con «Cerrar vuelo»", () => {
    expect(barra(vuelo({ es_externo: true }))).toContain("Cerrar vuelo");
  });
});

const fila = (extra: Partial<FlightRow> = {}): FlightRow => ({
  id: "v300",
  folio: 300,
  cliente_nombre: "Operación",
  es_externo: false,
  operador_externo: null,
  ruta: "CET → CUN",
  matricula: "N4142R",
  piloto_nombre: null,
  fecha_vuelo: "2026-09-12T20:00:00Z",
  fecha_solicitud: null,
  monto_total_usd: "0",
  estado: "EN_VUELO",
  falta_taco: false,
  en_cotizacion: false,
  cobrado: false,
  es_interno: true,
  cotizacion_abierta: false,
  total_cobrado_usd: 0,
  sin_tc_count: 0,
  ...extra,
});

describe("FlightsTable: icono del tacómetro omitido", () => {
  const TITULO = esc(
    "Tacómetro omitido en algún tramo (sin lectura, con motivo): abre el vuelo para ver el motivo.",
  );

  it("con taco_omitido pinta el icono slate con su title", () => {
    const html = renderToStaticMarkup(<FlightsTable rows={[fila({ taco_omitido: true })]} />);
    expect(html).toContain(`title="${TITULO}"`);
    expect(html).toContain("text-slate-500");
  });

  it("sin la llave (API previo) no pinta nada", () => {
    expect(renderToStaticMarkup(<FlightsTable rows={[fila()]} />)).not.toContain(TITULO);
  });
});
