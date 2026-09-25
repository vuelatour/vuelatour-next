/**
 * Pantalla INGRESOS (24-sep-2026) — CABLEADO de las piezas (los textos se
 * prueban en `lib/admin/__tests__/ingresos-ui.test.ts`):
 *  - «Por conciliar»: el caso REAL #235 sale «Sin candidato automático · 1
 *    con el monto exacto» con el chip «Cliente: Cristy Chavez»; el duplicado
 *    lleva «¿Duplicado?»; sin motivos calculados, «Pendiente» a secas.
 *  - Resumen: «Dinero que entró» dice que no es utilidad; la tarjeta de
 *    abonos solo para quien puede abrir «Por conciliar».
 *  - Entradas: el cobro de un anticipo en gris con su chip; reembolso en rojo.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AbonoPendiente,
  AbonosPendientesRespuesta,
  EntradaDinero,
  ResumenIngresos,
} from "@/types/ingresos";
import { filtrosIngresosDeUrl } from "@/lib/admin/ingresos-ui";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/ingresos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  clasificarAbonoAction: async () => ({ ok: true }),
  sugerirAbonosAction: async () => ({ ok: true }),
  aceptarPropuestaAbonoAction: async () => ({ ok: true }),
  candidatosAbonoAction: async () => ({ ok: true }),
  ligarAbonoCobroAction: async () => ({ ok: true }),
  ligarAbonoIngresoAction: async () => ({ ok: true }),
  cobroDeVueloDesdeAbonoAction: async () => ({ ok: true }),
  vuelosCandidatosAction: async () => ({ ok: true, data: [] }),
  gastosParaReembolsoAction: async () => ({ ok: true, data: [] }),
  archivoIngresoUrlAction: async () => ({ ok: true, data: "https://x" }),
  bajaIngresoAction: async () => ({ ok: true }),
  aplicarAnticipoAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  autoMatchAction: async () => ({ ok: true }),
  importJobStatusAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/ingresos-browser", () => ({
  registrarIngreso: async () => ({ ok: false, error: "no" }),
  editarIngreso: async () => ({ ok: false, error: "no" }),
  motivoComprobanteIngresoInvalido: () => null,
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));

const { AbonosPendientesTable } = await import("../abonos-pendientes-table");
const { IngresosResumen } = await import("../ingresos-resumen");
const { EntradasTable } = await import("../entradas-table");

const CATALOGOS = { cuentas: [], clientes: [], aeronaves: [] };

const ABONO_235: AbonoPendiente = {
  id: "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  cuenta_bancaria_id: "5f0c7c3e-9a44-4b53-9f7e-3a1d1c1b2a10",
  cuenta_alias: "Paywise",
  cuenta_moneda: "MXN",
  cuenta_tipo: "PASARELA",
  fecha: "2026-09-08",
  monto: 19380,
  monto_bruto: null,
  comision_monto: null,
  descripcion: "MARIA CRISTINA CHAVEZ BADIOLA : vuelo cristy badiola",
  referencia: null,
  notas: null,
  patron: null,
  motivo_pendiente: "SIN_CANDIDATOS",
  candidatos_n: 0,
  exactos_manual: 1,
  posible_duplicado_de: null,
  cliente_sugerido: { id: "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a", nombre: "Cristy Chavez" },
  categoria_sugerida: null,
};

const DUPLICADO: AbonoPendiente = {
  ...ABONO_235,
  id: "f1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  fecha: "2026-09-03",
  monto: 36456.58,
  descripcion: "SPEI RECIBIDO",
  referencia: "00000000006247178602",
  cliente_sugerido: null,
  motivo_pendiente: "SIN_CANDIDATOS",
  exactos_manual: 0,
  posible_duplicado_de: { id: "x", conciliado: true, descripcion: "SPEI RECIBIDO", referencia: "000125473315" },
};

const TRASPASO: AbonoPendiente = {
  ...ABONO_235,
  id: "a1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  descripcion: "SEL TRASPASO ENTRE CUENTAS",
  cliente_sugerido: null,
  patron: "TRASPASO",
  motivo_pendiente: "SE_PUEDE_CRUZAR",
};

function respuesta(p: Partial<AbonosPendientesRespuesta> = {}): AbonosPendientesRespuesta {
  return {
    data: [ABONO_235, DUPLICADO, TRASPASO],
    total: 3,
    desde: "2026-09-01",
    hasta: "2026-09-24",
    truncado: false,
    motivos_calculados: true,
    por_moneda: [{ moneda: "MXN", n: 3, monto: 75216.58 }],
    ...p,
  };
}

function tabla(r: AbonosPendientesRespuesta): string {
  return renderToStaticMarkup(
    <AbonosPendientesTable
      respuesta={r}
      catalogos={CATALOGOS}
      cuentasIa={[]}
      desde="2026-09-01"
      hasta="2026-09-24"
    />,
  );
}

describe("«Por conciliar»", () => {
  it("caso #235, duplicado y traspaso", () => {
    const html = tabla(respuesta());
    expect(html).toContain("Sin candidato automático · 1 con el monto exacto");
    expect(html).toContain("Cliente: Cristy Chavez");
    expect(html).toContain("¿Duplicado?");
    expect(html).toContain("Parece traspaso");
    expect(html).toContain("1 parece traspaso entre cuentas");
    expect(html).toContain("Cruzar pendientes");
    expect(html).toContain("Sugerir con IA (pendientes)");
    expect(html).toContain("Abonos del banco que el sistema no ha identificado.");
  });

  it("sin motivos calculados: «Pendiente» a secas", () => {
    const html = tabla(respuesta({ motivos_calculados: false, data: [ABONO_235] }));
    expect(html).toContain(">Pendiente<");
    expect(html).not.toContain("Sin candidato automático");
  });

  it("truncado se AVISA", () => {
    expect(tabla(respuesta({ truncado: true, total: 900 }))).toContain("Mostrando 3 de 900 abonos pendientes");
  });
});

const RESUMEN: ResumenIngresos = {
  desde: "2026-09-01",
  hasta: "2026-09-24",
  por_moneda: [
    {
      moneda: "MXN",
      cobros_vuelo: { recibido: 20400, reembolsos: 0, n: 1, conciliado: 0, sin_conciliar: 20400, no_bancario: 0 },
      depositos_por_volar: { monto: 0, n: 0 },
      aplicado_de_anticipos: { monto: 600, n: 1 },
      otros_ingresos: { monto: 1000, n: 1, conciliado: 1000, sin_conciliar: 0, no_bancario: 0 },
      anticipos: { recibido: 1000, aplicado: 600, saldo: 400, n: 1, conciliado: 0, sin_conciliar: 1000, no_bancario: 0 },
      fuera_de_resultados: { monto: 0, n: 0 },
      total_recibido: 22400,
      neto_de_reembolsos: 22400,
      abonos_por_identificar: { n: 3, monto: 75216.58 },
    },
  ],
  anticipos_con_saldo: [{ moneda: "MXN", saldo: 400, n: 1 }],
};

describe("resumen por moneda", () => {
  it("«Dinero que entró» no es utilidad y los aplicados de anticipo no se suman otra vez", () => {
    const html = renderToStaticMarkup(
      <IngresosResumen resumen={RESUMEN} puedeConciliar hrefPorConciliar="/p" hrefAnticipos="/a" />,
    );
    expect(html).toContain("Dinero que entró");
    expect(html).toContain("$22,400 MXN");
    expect(html).toContain("No es utilidad: incluye anticipos y préstamos.");
    expect(html).toContain("aplicados de anticipos (no se suman otra vez)");
    expect(html).toContain("saldo por aplicar $400 MXN");
    expect(html).toContain("Abonos del banco por identificar");
    expect(html).toContain("Los totales no convierten monedas.");
  });

  it("COORDINADOR no ve la tarjeta de abonos (lleva a una pestaña que no puede abrir)", () => {
    const html = renderToStaticMarkup(
      <IngresosResumen resumen={RESUMEN} puedeConciliar={false} hrefPorConciliar="/p" hrefAnticipos="/a" />,
    );
    expect(html).not.toContain("Abonos del banco por identificar");
  });
});

describe("entradas: cobro de anticipo y reembolso", () => {
  const base: EntradaDinero = {
    origen: "COBRO_VUELO",
    id: "c-1",
    dia: "2026-09-08",
    etiqueta: "Vuelo #312",
    categoria: "COBRO_VUELO",
    categoria_etiqueta: "Cobro de vuelo",
    cliente_nombre: "Cristy Chavez",
    concepto: null,
    monto: 600,
    comision: null,
    neto: 600,
    moneda: "MXN",
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    vuelo_id: "v-312",
    vuelo_folio: 312,
    grupo_folio: null,
    vuelo_estado: "CONFIRMADO",
    por_volar: true,
    anticipo_etiqueta: "ING-12",
    cuenta_en_total: false,
    es_reembolso: false,
    conciliacion: { estado: "VIA_ANTICIPO", movimiento_id: "m-1" },
    registrado_por_nombre: "Itzi",
  };

  it("en gris, con su chip y el tooltip de que no suma", () => {
    const f = filtrosIngresosDeUrl({}, "ADMIN", "2026-09-24");
    const html = renderToStaticMarkup(<EntradasTable entradas={[base]} filtros={f} />);
    expect(html).toContain("Del anticipo ING-12");
    expect(html).toContain("No suma al total: el dinero entró como anticipo.");
    expect(html).toContain("Conciliado vía anticipo");
    expect(html).toContain("Por volar");
  });

  it("reembolso en rojo con signo", () => {
    const f = filtrosIngresosDeUrl({}, "ADMIN", "2026-09-24");
    const html = renderToStaticMarkup(
      <EntradasTable
        entradas={[{ ...base, id: "c-2", monto: -500, neto: -500, es_reembolso: true, anticipo_etiqueta: null, cuenta_en_total: true }]}
        filtros={f}
      />,
    );
    expect(html).toContain("-$500 MXN");
    expect(html).toContain("text-red-600");
  });
});
