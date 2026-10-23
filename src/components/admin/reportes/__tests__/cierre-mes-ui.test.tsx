/**
 * Cierre de mes formal (16-oct-2026, API 0.0.88) en pantalla: render estático
 * de los botones, de los avisos del reparto y cableado (por regex) de la
 * previa, el `PREVIA_CAMBIO`, el pre-cierre y el aviso 409 `MES_CERRADO` en
 * los formularios de captura. Sin DOM (runner `node`).
 *
 * CIERRE POR AVIÓN (23-oct-2026, API 0.0.104, invariante 105): la burbuja
 * «Cierre formal del mes» ya no existe; el cierre vive en BALANCES: el bloque
 * de la flota en «Balance mensual» (`CierreFlotaBloque`) y el chip + botón de
 * cada tile (`CierreAvionAcciones`); el cuerpo del diálogo (`CuerpoPrevia`)
 * con matrícula, vuelos compartidos, «Se queda» decidido por otro avión y los
 * bloqueantes de otros aviones plegados.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CargaCierres } from "@/lib/api/cierres-server";
import type { CierresRespuesta, MesCierre, MesCierreAvion, PreviaCierre } from "@/types/cierres";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/admin/reportes/actions", () => ({
  previaCierreAction: async () => ({ ok: false }),
  cerrarMesAction: async () => ({ ok: false }),
  reabrirMesAction: async () => ({ ok: false }),
}));

const { CierreMesAcciones, CuerpoPrevia, ListaBloqueantesPrevia } = await import("../cierre-mes-acciones");
const { CierreAvionAcciones } = await import("../cierre-avion-acciones");
const { CierreFlotaBloque } = await import("../cierre-flota-bloque");
const { TITULO_BLOQUEANTE_SIN_VERIFICAR, TITULO_BLOQUEANTES_OTROS_AVIONES, AYUDA_CIERRE_AVION, AYUDA_CIERRE_MES, normalizarPrevia } =
  await import("@/lib/admin/cierre-mes");
const { CierreRepartoAviso, CierreRepartoAvion } = await import(
  "@/components/admin/profit-sharing/cierre-reparto-aviso"
);

const raiz = path.resolve(__dirname, "../../../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const UUID = (n: number) => `3f9a1c2e-0000-4000-8000-00000000000${n}`;
const HOY = "2026-10-23";

function avionMes(over: Partial<MesCierreAvion> & Pick<MesCierreAvion, "aeronave_id" | "matricula">): MesCierreAvion {
  return {
    modelo: "Cessna",
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
  };
}

const N621 = avionMes({ aeronave_id: UUID(5), matricula: "N621TX" });
const N58BT = avionMes({
  aeronave_id: UUID(4),
  matricula: "N58BT",
  estado: "CERRADO",
  cerrado_at: "2026-10-16T19:02:00Z",
  cerrado_por: { id: "u1", nombre: "Ale" },
  version: 1,
  puede_cerrar: false,
  motivo_no_cerrable: "YA_CERRADO",
  totales: { vuelos_diferidos: 2 },
});

/** Septiembre PARCIAL (N58BT cerrado, N621TX abierto) de un API por avión. */
const SEP_PARCIAL: MesCierre = {
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
  aviones_activos: 2,
  aviones_cerrados: 1,
  aviones: [N58BT, N621],
};

function cargaOk(meses: MesCierre[], porAvion = true): CargaCierres<CierresRespuesta> {
  return {
    estado: "ok",
    datos: { disponible: true, por_avion: porAvion, inicio_oficial: "2026-09-01", mes_en_curso: "2026-10", meses, siguiente_a_cerrar: "2026-09" },
  };
}

describe("botones «Cerrar <mes>» / «Reabrir mes» (la flota o el mes global)", () => {
  it("mes abierto y cerrable: «Cerrar septiembre 2026» habilitado", () => {
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-09" ofreceCerrar ofreceReabrir={false} motivoNoCerrable={null} nDiferidos={null} />,
    );
    expect(html).toContain("Cerrar septiembre 2026");
    expect(html).not.toContain(" disabled=\"\"");
    expect(html).not.toContain("Reabrir mes");
    expect(html).toContain('data-cierre-acciones="flota"');
  });
  it("con motivo (orden / en curso): deshabilitado y el texto a la vista", () => {
    const motivo = "Para cerrar octubre 2026 primero cierra septiembre 2026.";
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-10" ofreceCerrar ofreceReabrir={false} motivoNoCerrable={motivo} nDiferidos={null} />,
    );
    expect(html).toContain(" disabled=\"\"");
    expect(html).toContain(motivo);
  });
  it("mes cerrado: solo «Reabrir mes» (ADMIN); sin rol para nada ⇒ nada", () => {
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-09" ofreceCerrar={false} ofreceReabrir motivoNoCerrable={null} nDiferidos={5} />,
    );
    expect(html).toContain("Reabrir mes");
    expect(html).not.toContain("Cerrar septiembre");
    expect(
      renderToStaticMarkup(
        <CierreMesAcciones mes="2026-09" ofreceCerrar={false} ofreceReabrir={false} motivoNoCerrable={null} nDiferidos={5} />,
      ),
    ).toBe("");
  });
  it("mes PARCIAL: «Cerrar … (los N aviones abiertos)» y «Reabrir los N aviones cerrados» a la vez; con alcance, el botón nombra al avión", () => {
    const html = renderToStaticMarkup(
      <CierreMesAcciones
        mes="2026-09"
        ofreceCerrar
        ofreceReabrir
        motivoNoCerrable={null}
        nDiferidos={null}
        etiquetaCerrar="Cerrar septiembre 2026 (los 3 aviones abiertos)"
        etiquetaReabrir="Reabrir los 4 aviones cerrados"
      />,
    );
    expect(html).toContain("Cerrar septiembre 2026 (los 3 aviones abiertos)");
    expect(html).toContain("Reabrir los 4 aviones cerrados");
    const avion = renderToStaticMarkup(
      <CierreMesAcciones
        mes="2026-09"
        ofreceCerrar
        ofreceReabrir={false}
        motivoNoCerrable={null}
        nDiferidos={null}
        alcance={{ aeronaveId: UUID(5), matricula: "N621TX" }}
      />,
    );
    expect(avion).toContain('data-cierre-acciones="N621TX"');
    expect(avion).toContain('aria-label="Cerrar septiembre 2026 · N621TX"');
    expect(avion).toContain(">Cerrar septiembre 2026<");
  });
});

describe("CierreAvionAcciones: chip del avión + botón según rol (tile de «Balance por avión»)", () => {
  const pintar = (rol: string | null, avion: MesCierreAvion | null, enCurso = false) =>
    renderToStaticMarkup(
      <CierreAvionAcciones mes="2026-09" enCurso={enCurso} rol={rol} avion={avion} aeronaveId={avion?.aeronave_id ?? UUID(9)} matricula={avion?.matricula ?? "X"} />,
    );
  it("ADMIN y FACTURACION: chip «Abierto» + «Cerrar septiembre 2026» (aria-label con la matrícula)", () => {
    for (const rol of ["ADMIN", "FACTURACION"]) {
      const html = pintar(rol, N621);
      expect(html).toContain('data-cierre-avion="N621TX"');
      expect(html).toContain('data-estado-cierre="abierto"');
      expect(html).toContain(">Abierto<");
      expect(html).toContain('aria-label="Cerrar septiembre 2026 · N621TX"');
      expect(html).not.toContain("Reabrir");
    }
  });
  it("ANALISTA: solo el chip, sin botones", () => {
    const html = pintar("ANALISTA", N621);
    expect(html).toContain(">Abierto<");
    expect(html).not.toContain("<button");
  });
  it("avión cerrado: chip «Cerrado el 16-oct-2026 por Ale»; «Reabrir» solo ADMIN", () => {
    const admin = pintar("ADMIN", N58BT);
    expect(admin).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(admin).toContain('aria-label="¿Reabrir septiembre 2026 · N58BT?"');
    expect(admin).toContain(">Reabrir<");
    expect(admin).not.toContain("Cerrar septiembre");
    const fact = pintar("FACTURACION", N58BT);
    expect(fact).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(fact).not.toContain("<button");
  });
  it("«Este mes»: el chip «En curso» sí, los botones no; sin fila del avión ⇒ nada", () => {
    const html = pintar("ADMIN", N621, true);
    expect(html).toContain("En curso (se cierra a partir del 1-oct)");
    expect(html).not.toContain("<button");
    expect(pintar("ADMIN", null)).toBe("");
  });
  it("orden por avión: el botón deshabilitado dice «N621TX: Para cerrar …»", () => {
    const html = pintar("ADMIN", { ...N621, puede_cerrar: false, motivo_no_cerrable: "MES_ANTERIOR_ABIERTO" });
    expect(html).toContain(" disabled=\"\"");
    expect(html).toContain("N621TX: Para cerrar septiembre 2026 primero cierra agosto 2026.");
  });
});

describe("CierreFlotaBloque: el cierre de la flota en «Balance mensual»", () => {
  const pintar = (carga: CargaCierres<CierresRespuesta>, rol: string | null, desde = "2026-09-01", hasta = "2026-09-30") =>
    renderToStaticMarkup(<CierreFlotaBloque carga={carga} desde={desde} hasta={hasta} hoy={HOY} rol={rol} />);
  it("ADMIN, mes parcial: «Parcial · 1 de 2», «Cerrar septiembre 2026 (el avión abierto)» y «Reabrir el avión cerrado»", () => {
    const html = pintar(cargaOk([SEP_PARCIAL]), "ADMIN");
    expect(html).toContain('data-cierre-flota="POR_AVION"');
    expect(html).toContain("Cierre de septiembre 2026");
    expect(html).toContain('data-estado-cierre="parcial"');
    expect(html).toContain(">Parcial · 1 de 2<");
    expect(html).toContain('title="1 de 2 aviones cerrados"');
    expect(html).toContain("Cerrar septiembre 2026 (el avión abierto)");
    expect(html).toContain("Reabrir el avión cerrado");
    expect(html).toContain(AYUDA_CIERRE_AVION);
  });
  it("FACTURACION cierra pero no reabre; ANALISTA solo ve el chip", () => {
    const fact = pintar(cargaOk([SEP_PARCIAL]), "FACTURACION");
    expect(fact).toContain("Cerrar septiembre 2026 (el avión abierto)");
    expect(fact).not.toContain("Reabrir");
    const ana = pintar(cargaOk([SEP_PARCIAL]), "ANALISTA");
    expect(ana).toContain(">Parcial · 1 de 2<");
    expect(ana).not.toContain("<button");
  });
  it("mes abierto sin cierres: «Abierto · 0 de 2» y «Cerrar … (los 2 aviones abiertos)»; cerrado: «Cerrado» + «Reabrir mes»", () => {
    const abierto: MesCierre = { ...SEP_PARCIAL, estado: "ABIERTO", aviones_cerrados: 0, aviones: [{ ...N58BT, estado: "ABIERTO" }, N621] };
    const a = pintar(cargaOk([abierto]), "ADMIN");
    expect(a).toContain(">Abierto · 0 de 2<");
    expect(a).toContain("Cerrar septiembre 2026 (los 2 aviones abiertos)");
    expect(a).not.toContain("Reabrir");
    const cerrado: MesCierre = {
      ...SEP_PARCIAL,
      estado: "CERRADO",
      cerrado_at: "2026-10-16T19:02:00Z",
      cerrado_por: { id: "u1", nombre: "Ale" },
      aviones_cerrados: 2,
      totales: { vuelos_diferidos: 5 },
      aviones: [N58BT, { ...N621, estado: "CERRADO" }],
    };
    const c = pintar(cargaOk([cerrado]), "ADMIN");
    expect(c).toContain(">Cerrado<");
    expect(c).toContain('title="Cerrado el 16-oct-2026 por Ale · 2 de 2 aviones cerrados"');
    expect(c).toContain("Reabrir mes");
    expect(c).not.toContain("Cerrar septiembre");
  });
  it("FALLBACK (`por_avion` false, API previo): el flujo global de siempre", () => {
    const global: MesCierre = { ...SEP_PARCIAL, estado: "ABIERTO", aviones_activos: undefined, aviones_cerrados: undefined, aviones: undefined };
    const html = pintar(cargaOk([global], false), "ADMIN");
    expect(html).toContain('data-cierre-flota="GLOBAL"');
    expect(html).toContain(">Abierto<");
    expect(html).toContain(">Cerrar septiembre 2026<");
    expect(html).not.toContain("aviones abiertos");
    expect(html).toContain(AYUDA_CIERRE_MES);
    expect(html).not.toContain(AYUDA_CIERRE_AVION);
  });
  it("«Este mes»: chip «En curso» y la guía a «Mes pasado», sin botones; un rango que no es un mes ⇒ solo la guía", () => {
    const oct: MesCierre = { ...SEP_PARCIAL, periodo: "2026-10", estado: "ABIERTO", aviones_cerrados: 0, puede_cerrar: false, motivo_no_cerrable: "MES_EN_CURSO" };
    const html = pintar(cargaOk([SEP_PARCIAL, oct]), "ADMIN", "2026-10-01", HOY);
    expect(html).toContain("En curso (se cierra a partir del 1-nov)");
    expect(html).toContain("elige «Mes pasado · Septiembre 2026»");
    expect(html).not.toContain("<button");
    const rango = pintar(cargaOk([SEP_PARCIAL]), "ADMIN", "2026-09-05", "2026-09-30");
    expect(rango).toContain("El cierre es por mes completo");
    expect(rango).not.toContain("data-estado-cierre");
  });
  it("skew: API previo / sin migración / error ⇒ la línea que lo dice; sin permiso ⇒ nada; jamás «Abierto» sin leer", () => {
    expect(pintar({ estado: "api-previo" }, "ADMIN")).toContain("necesita el API 0.0.88");
    expect(pintar({ estado: "sin-migracion" }, "ADMIN")).toContain("todavía no está activo en la base de datos");
    expect(pintar({ estado: "error" }, "ADMIN")).toContain("No se pudo leer el estado del cierre");
    expect(pintar({ estado: "sin-permiso" }, "ADMIN")).toBe("");
    for (const e of ["api-previo", "sin-migracion", "error"] as const) expect(pintar({ estado: e }, "ADMIN")).not.toContain("Abierto");
  });
});

describe("CuerpoPrevia: el diálogo de cierre de UN avión", () => {
  const previa = normalizarPrevia({
    periodo: "2026-09",
    estado: "ABIERTO",
    listo: true,
    motivo_no_cerrable: null,
    aeronave: { id: UUID(5), matricula: "N621TX", modelo: "Kodiak" },
    aviones_alcance: [{ aeronave_id: UUID(5), matricula: "N621TX" }],
    bloqueantes: [],
    bloqueantes_otros_aviones: [{ clave: "vuelos_sin_completar", titulo: "Vuelos sin completar", count: 2, ids: ["x", "y"] }],
    vuelos_que_pasan: [
      {
        id: UUID(1),
        folio: 401,
        cliente: "Cliente A",
        aeronave: { id: UUID(5), matricula: "N621TX" },
        venta_usd: 1000,
        cobrado_usd: 0,
        por_cobrar_usd: 1000,
        cobrado_posterior_usd: 1000,
        fecha_cobro_posterior: "2026-10-02",
        motivo: "COBRO_POSTERIOR",
        destino: "2026-10",
        leyenda: "Pasa a octubre 2026",
        multi_avion: true,
        otros_aviones: [{ aeronave_id: UUID(4), matricula: "N58BT", estado: "CERRADO" }],
      },
    ],
    vuelos_incluidos: [
      {
        id: UUID(2),
        folio: 402,
        cliente: "Cliente B",
        aeronave: { id: UUID(5), matricula: "N621TX" },
        venta_usd: 500,
        cobrado_usd: 0,
        por_cobrar_usd: 500,
        cobrado_posterior_usd: 500,
        motivo: "COBRO_POSTERIOR",
        leyenda: "Se queda en septiembre 2026",
        multi_avion: true,
        otros_aviones: [{ aeronave_id: UUID(4), matricula: "N58BT", estado: "CERRADO" }],
        decidido_por: { aeronave_id: UUID(4), matricula: "N58BT" },
      },
    ],
    vuelos_que_vienen: [],
    totales: { vuelos: 10, completados: 9, cancelados: 1, pasan: 1, pasan_por_cobrar_usd: 1000, incluidos: 1 },
    reparto: { antes: [{ matricula: "N621TX", saldo_usd: 100 }], despues: [{ matricula: "N621TX", saldo_usd: 50 }] },
  }) as PreviaCierre;
  const html = renderToStaticMarkup(
    <CuerpoPrevia
      mes="2026-09"
      destino="2026-10"
      alcance={{ aeronaveId: UUID(5), matricula: "N621TX" }}
      previa={previa}
      cambio={false}
      incluir={[]}
      onCambiarQuedarse={() => {}}
      recalculando={false}
      enviando={false}
      entiendo={false}
      onEntiendo={() => {}}
      cerrarDialogo={() => {}}
    />,
  );
  it("la casilla nombra al avión y el cuerpo sabe su alcance", () => {
    expect(html).toContain('data-cuerpo-previa="N621TX"');
    expect(html).toContain("Entiendo que N621TX quedará bloqueado para capturas en septiembre 2026");
    // Un solo avión: no se repite la línea del alcance de la flota.
    expect(html).not.toContain("data-alcance-previa");
  });
  it("el vuelo compartido dice con quién y en qué estado; «Se queda» decidido por otro avión va marcado y deshabilitado con su tooltip", () => {
    expect(html).toContain("compartido con N58BT (cerrado)");
    expect(html).toContain('data-decidido-por="N58BT"');
    expect(html).toMatch(
      /<input[^>]*disabled=""[^>]*title="Se queda en septiembre 2026 \(decidido al cerrar N58BT\)"[^>]*data-decidido-por="N58BT"[^>]*checked=""/,
    );
    // El que sí puede decidirse aquí conserva su casilla viva.
    expect(html).toContain(`data-quedarse="${UUID(1)}"`);
  });
  it("los bloqueantes de OTROS aviones van plegados y no impiden cerrar (la casilla «Entiendo» se ofrece)", () => {
    expect(html).toContain("data-bloqueantes-otros");
    expect(html).toMatch(/<details[^>]*data-bloqueantes-otros[^>]*>(?!.*\bopen\b)/);
    expect(html).toContain(`${TITULO_BLOQUEANTES_OTROS_AVIONES} · 1`);
    expect(html).toContain("Vuelos sin completar");
    expect(html).not.toContain("Pendientes que impiden cerrar");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("N621TX: $100 USD → $50 USD");
  });
  it("la previa de la FLOTA nombra a los aviones que cierra y la casilla es la de siempre", () => {
    const flota = normalizarPrevia({
      periodo: "2026-09",
      listo: true,
      aeronave: null,
      aviones_alcance: [
        { aeronave_id: UUID(3), matricula: "N4142R" },
        { aeronave_id: UUID(5), matricula: "N621TX" },
      ],
      totales: {},
    }) as PreviaCierre;
    const h = renderToStaticMarkup(
      <CuerpoPrevia
        mes="2026-09"
        destino="2026-10"
        alcance={null}
        previa={flota}
        cambio={false}
        incluir={[]}
        onCambiarQuedarse={() => {}}
        recalculando={false}
        enviando={false}
        entiendo={false}
        onEntiendo={() => {}}
        cerrarDialogo={() => {}}
      />,
    );
    expect(h).toContain('data-cuerpo-previa="flota"');
    expect(h).toContain("Cierra N4142R y N621TX (2 aviones abiertos).");
    expect(h).toContain("Entiendo que septiembre 2026 quedará bloqueado para capturas");
    expect(h).not.toContain("data-bloqueantes-otros");
  });
});

describe("cableado del diálogo de cierre (las reglas viven en lib/admin/cierre-mes.ts, con su test)", () => {
  const src = leer("src/components/admin/reportes/cierre-mes-acciones.tsx");
  it("manda los ids que se VIERON (vuelos_esperados = pasan + se quedan), los que se quedan (incluir) y el avión del alcance; decide con decidirRespuestaCerrar", () => {
    expect(src).toMatch(/cerrarMesAction\(\s*mes,\s*idsVistosEnPrevia\(previa\),\s*incluir,\s*aeronaveId,?\s*\)/);
    expect(src).toContain("decidirRespuestaCerrar(r, mes)");
    expect(src).toMatch(/d\.tipo === "previa_nueva"[\s\S]*setEntiendo\(false\)/);
    // El cierre de la flota a medias: toast, cierra y refresca (lo cerrado se queda cerrado).
    expect(src).toMatch(/d\.tipo === "parcial"[\s\S]*toast\.error\(d\.texto[\s\S]*router\.refresh\(\)/);
  });
  it("INCLUIR EN EL MES (21-oct-2026): la casilla «Se queda» solo para COBRO_POSTERIOR, relee la previa con `incluir` (y el avión) y el toast cuenta los que se quedaron", () => {
    expect(src).toContain("puedeQuedarseEnMes(v)");
    expect(src).toMatch(/previaCierreAction\(mes, incluir, aeronaveId\)/);
    expect(src).toMatch(/\}, \[mes, incluir, aeronaveId\]\);/);
    expect(src).toContain("vuelos_incluidos");
    expect(src).toContain("textoToastCerradoAvion(mes, alcance.matricula, d.diferidos, destino, d.incluidos)");
    expect(src).toContain("textoToastCerradoFlota(mes, d.cerrados, d.diferidos, destino, d.incluidos)");
    expect(src).toContain('data-quedarse={v.id}');
  });
  it("confirmar exige puedeConfirmarCierre (previa lista + casilla) y no hay otro camino al POST", () => {
    expect(src).toContain("disabled={!puedeConfirmar || enviando}");
    expect(src).toContain("if (!previa || !puedeConfirmar || enviandoRef.current) return;");
    expect(src.match(/cerrarMesAction\(/g)).toHaveLength(1);
    expect(src.match(/reabrirMesAction\(/g)).toHaveLength(1);
  });
  it("reabrir: con el avión del alcance, texto vía mensajeErrorCierre (con matrícula) y refresca al cerrar tras un rechazo (estado rancio)", () => {
    expect(src).toContain("reabrirMesAction(mes, motivo, alcance?.aeronaveId ?? null)");
    expect(src).toContain('setError(mensajeErrorCierre(r, "reabrir", mes, alcance?.matricula ?? null))');
    const reabrir = src.slice(src.indexOf("function DialogoReabrir"));
    expect(reabrir).toMatch(/refrescarAlCerrar\.current = true;\s*\n\s*setError\(mensajeErrorCierre/);
    expect(reabrir).toMatch(/if \(!v && refrescarAlCerrar\.current\) \{[\s\S]*router\.refresh\(\)/);
  });
  it("la tabla de los que VIENEN no rotula sus montos con el corte de este mes ni pinta «Cobrado después»", () => {
    expect(src).toContain('informativo ? "Cobrado al cerrar su mes"');
    expect(src).toContain('{!informativo && <th className="px-2 py-1 text-right font-medium">Cobrado después</th>}');
  });
  it("caso #351: «Cobrado después» lleva la fecha del cobro y la descripción dice la regla", () => {
    expect(src).toContain("{textoCobradoPosterior(v)}");
    expect(src).toContain("textoDescripcionCerrar(mes, destino)");
    expect(src).toContain("textoDescripcionCerrarAvion(mes, destino, alcance.matricula)");
    expect(src).not.toContain("y se reparten cuando se cobren");
    // «Por cobrar» lleva el corte y deja el ámbar si ya se cobró después.
    expect(src).toContain('{informativo ? "Por cobrar entonces" : `Por cobrar al ${corte}`}');
    expect(src).toMatch(/porCobrarYaSeCobro\(v\) \? "text-muted-foreground" : "text-amber-700/);
  });
  it("Reportes da 300 s a sus server actions (el cierre corre pre-cierre + 2 repartos)", () => {
    expect(leer("src/app/admin/reportes/page.tsx")).toMatch(/^export const maxDuration = 300;$/m);
  });
  it("los bloqueantes de la previa los pinta ListaBloqueantesPrevia (con la regla del pre-cierre)", () => {
    expect(src).toContain("<ListaBloqueantesPrevia bloqueantes={previa.bloqueantes} />");
    expect(src).toContain("· {textoConteoPreCierre(b)}");
    expect(src).not.toContain("· {b.count}");
  });
});

describe("bloqueantes de la previa del cierre (API 0.0.95: lectura_fallida)", () => {
  it("un renglón que el API no pudo leer dice «sin verificar», nunca «· 0»", () => {
    const html = renderToStaticMarkup(
      <ListaBloqueantesPrevia
        bloqueantes={[
          { clave: "nomina_sin_repartir", titulo: "Nómina sin repartir entre aviones", count: 3 },
          {
            clave: "gastos_por_pagar",
            titulo: "Gastos por pagar sin confirmar",
            count: 0,
            lectura_fallida: true,
            ids_nomina: [],
          },
        ]}
      />,
    );
    expect(html).toContain("Nómina sin repartir entre aviones");
    expect(html).toContain("· 3");
    expect(html).toContain("Gastos por pagar sin confirmar");
    expect(html).toContain("· sin verificar");
    expect(html).not.toContain("· 0<");
    // El tooltip explica por qué bloquea; solo el renglón sin verificar lo lleva.
    expect(html.split("data-sin-verificar").length - 1).toBe(1);
    expect(html).toContain(`title="${TITULO_BLOQUEANTE_SIN_VERIFICAR}"`);
  });
  it("API previo (sin la llave): el conteo de siempre", () => {
    const html = renderToStaticMarkup(
      <ListaBloqueantesPrevia bloqueantes={[{ clave: "gastos_sin_tc", titulo: "Gastos sin T.C.", count: 2 }]} />,
    );
    expect(html).toContain("· 2");
    expect(html).not.toContain("sin verificar");
    expect(html).not.toContain("data-sin-verificar");
  });
});

describe("reparto: estado del mes y listas (texto del API)", () => {
  const cierre = {
    disponible: true,
    periodo: "2026-09",
    estado: "CERRADO" as const,
    cerrado_at: "2026-10-16T19:02:00Z",
    cerrado_por_nombre: "Ale",
    coincide_con_snapshot: false,
    diferidos_salen: [
      {
        id: "v316",
        folio: 316,
        cliente: "Mike Nelson",
        matricula: "N990GG",
        venta_usd: 2076.4,
        destino: "2026-10",
        leyenda: "Pasa a octubre 2026 · pendiente de cobro: cobrado $0.00 de $2,076.40 USD",
      },
    ],
  };
  it("badge, aviso rojo de snapshot y bloque «Pasan a octubre 2026 (sin cobro completo al 30-sep, no se reparten)»", () => {
    const html = renderToStaticMarkup(<CierreRepartoAviso cierre={cierre} />);
    expect(html).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(html).toContain("Los números de hoy no coinciden con el cierre del 16-oct-2026");
    expect(html).toContain("Pasan a octubre 2026 (sin cobro completo al 30-sep, no se reparten)");
    expect(html).toContain("#316 · Mike Nelson · N990GG · $2,076.40 USD");
    expect(html).toContain('data-chip-cierre="pasa"');
  });
  it("CIERRE POR AVIÓN: mes PARCIAL ⇒ chip «Parcial · 2 aviones» con las matrículas en el tooltip y el aviso rojo si no coincide", () => {
    const html = renderToStaticMarkup(
      <CierreRepartoAviso
        cierre={{ disponible: true, periodo: "2026-09", estado: "PARCIAL", aviones_cerrados: ["N621TX", "N58BT"], coincide_con_snapshot: false }}
      />,
    );
    expect(html).toContain('data-estado-cierre="parcial"');
    expect(html).toContain(">Parcial · 2 aviones<");
    expect(html).toContain('title="Cerrados: N621TX y N58BT"');
    expect(html).toContain("Los números de hoy no coinciden");
  });
  it("por avión: solo los de su matrícula", () => {
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N990GG" />)).toContain("#316");
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N621TX" />)).toBe("");
  });
  it("caso #351: los que pasarían ya cobrados después del corte no se rotulan «pendientes de cobro»", () => {
    const html = renderToStaticMarkup(
      <CierreRepartoAviso
        cierre={{
          disponible: true,
          periodo: "2026-09",
          estado: "ABIERTO",
          pendientes_que_pasarian: [
            {
              id: "v351",
              folio: 351,
              cliente: "Cliente 351",
              matricula: "XA-VGV",
              venta_usd: 2343.2,
              destino: "2026-10",
              motivo: "COBRO_POSTERIOR",
              cobrado_posterior_usd: 2343.2,
              fecha_cobro_posterior: "2026-10-14",
              leyenda: "Pasará a octubre 2026 al cerrar · cobrado el 14-oct, después del 30-sep (al 30-sep: $0.00 de $2,343.20 USD)",
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Pasarán a octubre 2026 al cerrar el mes (sin cobro completo al 30-sep)");
    expect(html).toContain("cobrado el 14-oct, después del 30-sep");
    expect(html).toContain('data-chip-cierre="pasaria"');
    expect(html).not.toMatch(/pendientes? de cobro/i);
  });
  it("por avión (compacta): la leyenda del API queda en el title de cada línea", () => {
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N990GG" />)).toContain(
      'title="Pasa a octubre 2026 · pendiente de cobro: cobrado $0.00 de $2,076.40 USD"',
    );
  });
  it("API previo (sin `cierre`) ⇒ nada", () => {
    expect(renderToStaticMarkup(<CierreRepartoAviso cierre={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<CierreRepartoAviso cierre={{ ...cierre, disponible: false }} />)).toBe("");
  });
});

describe("pre-cierre, reportes y libro en pantalla", () => {
  it("el pre-cierre pinta la leyenda de cada vuelo y el estado del mes", () => {
    const src = leer("src/components/admin/reportes/pre-cierre-card.tsx");
    expect(src).toContain("lineasLeyendaPreCierre(");
    expect(src).toContain("<ChipEstadoCierre badge={textoBadgeCierrePeriodo(data.cierre)}");
  });
  it("Reportes YA NO monta la burbuja «Cierre formal del mes»: el cierre vive en Balances (flota + tiles)", () => {
    const src = leer("src/app/admin/reportes/page.tsx");
    expect(src).not.toContain("CierreMesCard");
    expect(src).not.toContain("cierre-mes-card");
    expect(src).toContain("<CierreFlotaBloque carga={cierres} desde={desde} hasta={hasta} hoy={hoy} inicio={inicio} rol={rol} />");
    expect(src).toMatch(/<AircraftBalancePicker[\s\S]*rol=\{rol\}[\s\S]*mesCierre=\{mesCierre\}[\s\S]*periodo=\{vistaCierre\}[\s\S]*modoCierre=\{modoCierre\}/);
    expect(src).toContain("muestraSeccionBalances(rol)");
    expect(src).toContain("getCierres()");
  });
  it("la pantalla por avión pinta el chip de ESE avión (`badgeCierreDelAvion`) y la card del reparto su `cierre_avion`", () => {
    expect(leer("src/app/admin/profit-sharing/aviones/[id]/page.tsx")).toContain("badgeCierreDelAvion(datos.cierre, avion.cierre_avion)");
    expect(leer("src/components/admin/profit-sharing/avion-reparto-card.tsx")).toContain("badgeCierreAvion(avion.cierre_avion)");
  });
  it("el balance en pantalla pinta el estado del cierre del libro", () => {
    const src = leer("src/app/admin/reportes/balance/page.tsx");
    expect(src).toContain("textoBadgeCierrePeriodo(libro.cierre)");
  });
});

describe("aviso 409 MES_CERRADO en los formularios de captura", () => {
  const FORMULARIOS = [
    "src/components/admin/expenses/expense-create-dialog.tsx",
    "src/components/admin/expenses/expense-verify-dialog.tsx",
    "src/components/admin/expenses/expense-actions.tsx",
    "src/components/admin/expenses/reparto-dialog.tsx",
    "src/components/admin/flights/cobro-form-sheet.tsx",
    "src/components/admin/flights/cobros-card.tsx",
    "src/components/admin/quotes/quote-cobros-card.tsx",
    "src/components/admin/quotes/quote-calculator.tsx",
    "src/components/admin/ingresos/registrar-ingreso-dialog.tsx",
    "src/components/admin/ingresos/baja-ingreso-dialog.tsx",
    "src/components/admin/ingresos/cobro-desde-abono-dialog.tsx",
    "src/components/admin/ingresos/aplicar-anticipo-dialog.tsx",
    "src/components/admin/caja-chica/movimiento-dialog.tsx",
    "src/components/admin/caja-chica/movimiento-actions.tsx",
    "src/components/admin/profit-sharing/entrega-socio-dialog.tsx",
    "src/components/admin/profit-sharing/eliminar-entrega-dialog.tsx",
    "src/components/admin/conciliacion/corregir-fecha-gasto-dialog.tsx",
  ];
  it.each(FORMULARIOS)("%s usa toastMesCerradoSiAplica", (rel) => {
    expect(leer(rel)).toContain("toastMesCerradoSiAplica(");
  });
  it("las actions de Gastos y Caja chica conservan `code`/`details` del MES_CERRADO", () => {
    expect(leer("src/app/admin/expenses/actions.ts")).toMatch(/err\.code === CODIGO_MES_CERRADO \? \{ code: err\.code, details: err\.details/);
    expect(leer("src/app/admin/caja-chica/actions.ts")).toMatch(/err\.code === CODIGO_MES_CERRADO \? \{ code: err\.code, details: err\.details/);
  });
});
