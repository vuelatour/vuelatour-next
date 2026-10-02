/**
 * PAGOS A SOCIOS en /admin/profit-sharing (1-oct-2026, API 0.0.49).
 *
 * Captura del cliente: «Mauricio Roque, %, Monto de utilidad, estatus de si
 * ya se pagó o aún no, con cuánto se le pagó, cuándo y quién se lo entregó».
 *
 * Qué se custodia aquí (marcado con `react-dom/server` + cableado leído del
 * código, como el resto del panel):
 *  1. la tabla de socios de cada avión gana «Utilidad · Pagado · Pendiente ·
 *     Estatus» y la relación de pagos SOLO con un mes completo y el servidor
 *     al día; si no, la tabla de siempre + una línea que dice por qué;
 *  2. una carga FALLIDA nunca se pinta como «Sin pagos registrados»;
 *  3. roles: ADMIN/FACTURACION registran/editan/eliminan; SOCIO solo lee lo
 *     suyo; los botones llevan `cursor-pointer`;
 *  4. la sección consolidada «Pagos a socios · Septiembre 2026» con totales y
 *     «N socios con pago pendiente»;
 *  5. el CABLEADO: la página la monta debajo de los KPIs, la tarjeta pasa el
 *     contexto, el DELETE solo sale de «Eliminar pago» del diálogo, el 409
 *     de exceso reintenta con `aceptar_exceso` y el MISMO `client_request_id`,
 *     el comprobante va del navegador directo al API y el atajo «Mes pasado».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FilaPagoSocio, PagoSocio, RepartoPagosRespuesta } from "@/types/reparto-pagos";
import type { RepartoSocio } from "@/types/profit-sharing";
import type { ModoPagosReparto } from "@/lib/admin/reparto-pagos";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));
// El selector de MES vive junto a las descargas del cierre (cliente de
// Supabase del navegador): en las pruebas no hace falta.
vi.mock("@/lib/download", () => ({ descargarDelApi: async () => {} }));

const { SociosSection } = await import("../socios-section");
const { PagosSociosSection, PagosFueraDelRepartoSection } = await import("../pagos-socios-section");
const { PeriodSelector } = await import("../period-selector");

const AVION = "a1a1a1a1-0000-4000-8000-000000000001";
const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const ACC = "50c10000-0000-4000-8000-000000000002";
const SAAB = "50c10000-0000-4000-8000-000000000003";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };

const REPARTO: RepartoSocio[] = [
  { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 69, monto_usd: 1395.94 },
  { socio_id: ACC, socio_nombre: "Aero Charter Cancun S.A. de C.V.", porcentaje: 29, monto_usd: 586.7 },
  { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 2, monto_usd: 40.46 },
];

const PAGO_MXN: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  aeronave_id: AVION,
  socio_id: MAURICIO,
  periodo: "2026-09-01",
  monto: 20000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 1081.08,
  utilidad_snapshot_usd: 1395.94,
  fecha_pago: "2026-10-05",
  metodo: "TRANSFERENCIA",
  referencia: "SPEI 123456",
  entregado_por: ALE.id,
  entregado_por_nombre: "Alejandro Canales",
  recibido_por: "Su esposa",
  factura_folio: "A-77",
  comprobante_path: `${AVION}/2026-09/9a9a.jpg`,
  comprobante_url:
    "https://x.supabase.co/storage/v1/object/sign/reparto-comprobantes/a/2026-09/9a9a.jpg?token=t",
  notas: null,
  created_by: ALE.id,
  created_by_nombre: "Itzi",
  created_at: "2026-10-05T17:30:00Z",
};

const base = (over: Partial<FilaPagoSocio>): FilaPagoSocio => ({
  aeronave: { id: AVION, matricula: "N4142R", modelo: "Piper Seneca V" },
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  porcentaje: 69,
  utilidad_usd: 1395.94,
  pagado_usd: 0,
  pendiente_usd: 1395.94,
  exceso_usd: 0,
  estado: "PENDIENTE",
  utilidad_al_pagar_usd: null,
  utilidad_difiere: false,
  pagos: [],
  ...over,
});

const FILAS: FilaPagoSocio[] = [
  base({
    pagado_usd: 1081.08,
    pendiente_usd: 314.86,
    estado: "PARCIAL",
    pagos: [PAGO_MXN],
    utilidad_al_pagar_usd: 1500,
    utilidad_difiere: true,
  }),
  base({
    socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." },
    porcentaje: 29,
    utilidad_usd: 586.7,
    pagado_usd: 700,
    pendiente_usd: 0,
    exceso_usd: 113.3,
    estado: "PAGADO",
  }),
  base({
    socio: { id: SAAB, nombre: "Alexander E. Saab" },
    porcentaje: 2,
    utilidad_usd: 40.46,
    pendiente_usd: 40.46,
  }),
];

const DATOS: RepartoPagosRespuesta = {
  disponible: true,
  mes: "2026-09",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  filas: FILAS,
  por_socio: [
    { socio: { id: MAURICIO, nombre: "Mauricio Roque" }, utilidad_usd: 1395.94, pagado_usd: 1081.08, pendiente_usd: 314.86, estado: "PARCIAL", aviones: 1 },
    { socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." }, utilidad_usd: 586.7, pagado_usd: 700, pendiente_usd: 0, estado: "PAGADO", aviones: 7 },
    { socio: { id: SAAB, nombre: "Alexander E. Saab" }, utilidad_usd: 40.46, pagado_usd: 0, pendiente_usd: 40.46, estado: "PENDIENTE", aviones: 1 },
  ],
  totales: { utilidad_usd: 2023.1, pagado_usd: 1781.08, pendiente_usd: 355.32, socios_pendientes: 2 },
};

const OK: ModoPagosReparto = { modo: "ok", mes: "2026-09", datos: DATOS };

function tabla(modo: ModoPagosReparto | undefined, rol = "ADMIN", puedeRegistrar = true): string {
  return renderToStaticMarkup(
    <SociosSection
      socios={REPARTO}
      porcentajeTotal={100}
      aeronaveId={AVION}
      pagos={
        modo
          ? { modo, puedeRegistrar, usuarios: [ALE], me: ALE, hoy: "2026-10-01", rol }
          : undefined
      }
    />,
  );
}

const pos = (html: string, texto: string) => {
  const i = html.indexOf(texto);
  expect(i, `no aparece «${texto}»`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("tabla de socios del avión con un mes completo", () => {
  const html = tabla(OK);

  it("columnas «Socio · % · Utilidad · Pagado · Pendiente · Estatus» (el % bajo el nombre)", () => {
    const cols = ["Socio · %", "Utilidad", "Pagado", "Pendiente", "Estatus"].map((c) =>
      pos(html, `>${c}</th>`),
    );
    expect([...cols].sort((a, b) => a - b)).toEqual(cols);
    expect(html).not.toContain(">Monto</th>");
    // 5 columnas: el detalle de pagos abarca las 5.
    expect(html).toContain('colSpan="5"');
    expect(html).not.toContain('colSpan="6"');
  });

  it("el nombre hace salto de línea y el % va debajo (la columna Estatus no se sale en una laptop)", () => {
    const celda = html.match(/<td[^>]*>(?:(?!<\/td>)[\s\S])*Aero Charter Cancun S\.A\. de C\.V\.[\s\S]*?<\/td>/)?.[0] ?? "";
    expect(celda).toContain("whitespace-normal");
    expect(celda).toContain("min-w-[8rem]");
    expect(celda).toContain("29.00%");
  });

  it("montos del API por socio y el estatus con su color", () => {
    expect(html).toContain("$1,395.94");
    expect(html).toContain("$1,081.08");
    expect(html).toContain("$314.86");
    expect(html).toMatch(/data-estado-pago="PARCIAL"[^>]*>Pago parcial</);
    expect(html).toMatch(/data-estado-pago="PAGADO"[^>]*>Pagado</);
    expect(html).toMatch(/data-estado-pago="PENDIENTE"[^>]*>Pendiente</);
    const etiqueta = (estado: string) => html.match(new RegExp(`<[^>]*data-estado-pago="${estado}"[^>]*>`))?.[0] ?? "";
    expect(etiqueta("PAGADO")).toContain("emerald");
    expect(etiqueta("PARCIAL")).toContain("amber");
    expect(etiqueta("PENDIENTE")).toContain("amber");
  });

  it("la relación de pagos: fecha · monto con moneda y T.C. · método · entregó · recibió · factura · referencia · comprobante", () => {
    expect(html).toMatch(/0?5 oct\.? 2026/);
    expect(html).toContain("$20,000 MXN · T.C. 18.5 · ≈ $1,081.08 USD");
    expect(html).toContain("Transferencia");
    expect(html).toContain("Entregó: Alejandro Canales");
    expect(html).toContain("Recibió: Su esposa · Factura A-77 · Ref. SPEI 123456");
    expect(html).toContain("Registró Itzi");
    // Miniatura del comprobante (bucket privado, se renueva sola).
    expect(html).toContain("9a9a.jpg?token=t");
  });

  it("avisos del renglón: la utilidad cambió y pagado de más", () => {
    expect(html).toContain("La utilidad del mes cambió después del último pago: era $1,500 y hoy es $1,395.94.");
    expect(html).toContain("Pagado de más: $113.30");
  });

  it("oficina: «Registrar pago» por socio, «Editar», «Eliminar» y adjuntar, todos con la manita", () => {
    const registrar = html.match(/data-accion="registrar-pago-socio"/g) ?? [];
    expect(registrar).toHaveLength(3);
    expect(html).toContain('aria-label="Registrar pago a Mauricio Roque · N4142R · Septiembre 2026"');
    expect(html).toContain('title="Registrar pago a Mauricio Roque · N4142R · Septiembre 2026"');
    expect(html).not.toContain("de este mes");
    expect(html.match(/data-accion="editar-pago-socio"/g)).toHaveLength(1);
    expect(html.match(/data-accion="eliminar-pago-socio"/g)).toHaveLength(1);
    expect(html).toContain(">Reemplazar<");
    // El botón del comprobante dice DE QUÉ pago es (fecha y monto).
    expect(html).toMatch(
      /aria-label="Reemplazar el comprobante del pago del 0?5 oct\.? 2026 por \$20,000 MXN · T\.C\. 18\.5 · ≈ \$1,081\.08 USD"/,
    );
    const botones = html.match(/<button[^>]*>/g) ?? [];
    for (const b of botones) expect(b, b).toContain("cursor-pointer");
  });

  it("sin pagos del socio se dice; nunca un vacío inventado", () => {
    expect(html).toContain("Sin pagos registrados en el mes.");
  });
});

describe("cuándo NO se pintan los pagos", () => {
  it("periodo que no es mes completo: la tabla de siempre + la línea tenue", () => {
    const html = tabla({ modo: "sin-mes" });
    expect(html).toContain(">Monto</th>");
    expect(html).not.toContain(">Pagado</th>");
    expect(html).toContain(
      "Los pagos a socios se registran por mes completo: elige un mes en el selector.",
    );
    expect(html).not.toContain("Registrar pago");
  });

  it("servidor sin actualizar: «Disponible cuando se actualice el servidor»", () => {
    const html = tabla({ modo: "no-disponible", mes: "2026-09" });
    expect(html).toContain("Pagos a socios: Disponible cuando se actualice el servidor.");
    expect(html).not.toContain(">Pagado</th>");
  });

  it("lectura fallida: se dice que NO se pudo cargar, jamás «Sin pagos registrados»", () => {
    const html = tabla({ modo: "error", mes: "2026-09" });
    expect(html).toContain("No se pudieron cargar los pagos a socios.");
    expect(html).not.toContain("Sin pagos registrados");
  });

  it("sin contexto (otro uso de la tarjeta) la tabla queda EXACTAMENTE como antes", () => {
    const html = tabla(undefined);
    expect(html).toContain(">Monto</th>");
    expect(html).not.toContain("data-nota-pagos");
  });
});

describe("roles", () => {
  it("SOCIO: solo lee lo suyo, sin registrar/editar/eliminar ni adjuntar", () => {
    const soloSaab: ModoPagosReparto = {
      modo: "ok",
      mes: "2026-09",
      datos: { ...DATOS, filas: [FILAS[2]] },
    };
    const html = tabla(soloSaab, "SOCIO", false);
    expect(html).not.toContain("Registrar pago");
    expect(html).not.toContain('data-accion="editar-pago-socio"');
    expect(html).not.toContain('data-accion="eliminar-pago-socio"');
    expect(html).not.toContain("Adjuntar comprobante");
    // Los renglones de los otros socios no muestran pagos (no los conoce).
    expect(html).toContain('title="Solo ves tus propios pagos"');
    expect(html).toMatch(/data-estado-pago="PENDIENTE"/);
  });

  it("sin utilidad no se ofrece «Registrar pago»: se dice por qué", () => {
    const sin: ModoPagosReparto = {
      modo: "ok",
      mes: "2026-09",
      datos: { ...DATOS, filas: [base({ utilidad_usd: 0, pendiente_usd: 0, estado: "SIN_UTILIDAD" })] },
    };
    const html = tabla(sin);
    expect(html).toContain("Sin utilidad en el mes: no hay pago que registrar.");
    expect(html).not.toContain('aria-label="Registrar pago a Mauricio Roque');
  });

  it("socio que ya no es vigente con pagos del mes: al final, marcado y sin «Registrar pago»", () => {
    const ex = base({
      socio: { id: "50c10000-0000-4000-8000-0000000000aa", nombre: "Ex Socio" },
      porcentaje: 0,
      utilidad_usd: 0,
      pagado_usd: 300,
      pendiente_usd: 0,
      estado: "SIN_UTILIDAD",
      pagos: [{ ...PAGO_MXN, id: "pp", socio_id: "50c10000-0000-4000-8000-0000000000aa" }],
    });
    const html = tabla({ modo: "ok", mes: "2026-09", datos: { ...DATOS, filas: [...FILAS, ex] } });
    expect(pos(html, "Ex Socio")).toBeGreaterThan(pos(html, "Alexander E. Saab"));
    expect(html).toContain("ya no vigente");
    expect(html).toContain("Ya no es socio vigente de este avión en el mes");
    expect(html).not.toContain('aria-label="Registrar pago a Ex Socio');
  });

  it("socio con DOS vigencias en el mes: UN renglón, la utilidad UNA vez y un solo «Registrar pago»", () => {
    const reparto: RepartoSocio[] = [
      { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 60, monto_usd: 600 },
      { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 9, monto_usd: 90 },
    ];
    const datos = {
      ...DATOS,
      filas: [base({ porcentaje: 69, utilidad_usd: 690, pendiente_usd: 690 })],
    };
    const html = renderToStaticMarkup(
      <SociosSection
        socios={reparto}
        porcentajeTotal={69}
        aeronaveId={AVION}
        pagos={{ modo: { modo: "ok", mes: "2026-09", datos }, puedeRegistrar: true, usuarios: [ALE], me: ALE, hoy: "2026-10-01", rol: "ADMIN" }}
      />,
    );
    expect(html.match(/data-socio-renglon=/g)).toHaveLength(1);
    expect(html.match(/data-accion="registrar-pago-socio"/g)).toHaveLength(1);
    expect(html.match(/\$690</g)).toHaveLength(2); // utilidad y pendiente, una vez cada uno
    expect(html).toContain("69.00%");
  });
});

describe("sección «Pagos a socios · Septiembre 2026»", () => {
  it("consolidado por socio con totales y «N socios con pago pendiente»", () => {
    const html = renderToStaticMarkup(<PagosSociosSection modo={OK} rol="ADMIN" meId={ALE.id} />);
    expect(html).toContain("Pagos a socios · Septiembre 2026");
    const cols = ["Socio", "Utilidad del mes", "Pagado", "Pendiente", "Estatus", "Aviones"].map((c) =>
      pos(html, `>${c}</th>`),
    );
    expect([...cols].sort((a, b) => a - b)).toEqual(cols);
    expect(html).toContain("2 socios con pago pendiente");
    expect(html).toMatch(/data-tono="ambar"/);
    expect(html).toContain("7 aviones");
    expect(html).toContain(">Total<");
    expect(html).toContain("$2,023.10");
    expect(html).toContain("$355.32");
  });

  it("SOCIO: solo su renglón, sin totales ni el conteo de los demás", () => {
    const html = renderToStaticMarkup(<PagosSociosSection modo={OK} rol="SOCIO" meId={SAAB} />);
    expect(html).toContain("Alexander E. Saab");
    expect(html).not.toContain("Mauricio Roque");
    expect(html).not.toContain(">Total<");
    expect(html).not.toContain("socios con pago pendiente");
  });

  it("mes con pérdida (todos SIN_UTILIDAD): gris «Sin utilidad que repartir», jamás verde «todos pagados»", () => {
    const perdida: ModoPagosReparto = {
      modo: "ok",
      mes: "2026-09",
      datos: {
        ...DATOS,
        por_socio: [{ ...DATOS.por_socio[0], utilidad_usd: 0, pagado_usd: 0, pendiente_usd: 0, estado: "SIN_UTILIDAD" }],
        totales: { utilidad_usd: 0, pagado_usd: 0, pendiente_usd: 0, socios_pendientes: 0 },
      },
    };
    const html = renderToStaticMarkup(<PagosSociosSection modo={perdida} rol="ADMIN" meId={ALE.id} />);
    expect(html).toContain("Sin utilidad que repartir en el mes");
    expect(html).toMatch(/data-tono="gris"/);
    expect(html).not.toContain("emerald");
    expect(html).not.toContain("están pagados");
    // Sin renglones: tampoco verde junto a «Ningún socio tiene utilidad…».
    const vacio = renderToStaticMarkup(
      <PagosSociosSection
        modo={{ modo: "ok", mes: "2026-09", datos: { ...DATOS, por_socio: [], totales: { utilidad_usd: 0, pagado_usd: 0, pendiente_usd: 0, socios_pendientes: 0 } } }}
        rol="ADMIN"
        meId={ALE.id}
      />,
    );
    expect(vacio).toContain("Ningún socio tiene utilidad ni pagos registrados en este mes.");
    expect(vacio).toMatch(/data-tono="gris"/);
    // Todos pagados CON utilidad: verde y el texto calificado.
    const pagados = renderToStaticMarkup(
      <PagosSociosSection
        modo={{ modo: "ok", mes: "2026-09", datos: { ...DATOS, totales: { ...DATOS.totales, socios_pendientes: 0 } } }}
        rol="ADMIN"
        meId={ALE.id}
      />,
    );
    expect(pagados).toContain("Todos los socios con utilidad están pagados");
    expect(pagados).toMatch(/data-tono="verde"/);
  });

  it("periodo que no es mes completo: UNA tarjeta compacta con «Ver Septiembre 2026» al mes cerrado", () => {
    const html = renderToStaticMarkup(
      <PagosSociosSection modo={{ modo: "sin-mes" }} rol="ADMIN" meId={null} hoy="2026-10-01" />,
    );
    expect(html).toContain('data-seccion-pagos-socios="sin-mes"');
    expect(html).toContain("Los pagos a socios se registran por mes completo: elige un mes en el selector.");
    expect(html).toContain("Ver Septiembre 2026");
    expect(html).toContain('href="/admin/profit-sharing?desde=2026-09-01&amp;hasta=2026-09-30"');
    expect(html).toMatch(/data-accion="ver-mes-pagos-socios"[^>]*|class="[^"]*cursor-pointer[^"]*"[^>]*data-accion="ver-mes-pagos-socios"/);
    const enlace = html.match(/<a[^>]*data-accion="ver-mes-pagos-socios"[^>]*>/)?.[0] ?? "";
    expect(enlace).toContain("cursor-pointer");
  });

  it("sin mes y sin «hoy» no se pinta; servidor sin actualizar lo dice; fallo con «Reintentar»", () => {
    expect(renderToStaticMarkup(<PagosSociosSection modo={{ modo: "sin-mes" }} rol="ADMIN" meId={null} />)).toBe("");
    expect(renderToStaticMarkup(<PagosSociosSection modo={{ modo: "oculto" }} rol="ADMIN" meId={null} />)).toBe("");
    const nd = renderToStaticMarkup(
      <PagosSociosSection modo={{ modo: "no-disponible", mes: "2026-09" }} rol="ADMIN" meId={null} />,
    );
    expect(nd).toContain("Disponible cuando se actualice el servidor.");
    const err = renderToStaticMarkup(
      <PagosSociosSection modo={{ modo: "error", mes: "2026-09" }} rol="ADMIN" meId={null} />,
    );
    expect(err).toContain("No se pudieron cargar los pagos a socios.");
    expect(err).toContain("Reintentar");
  });
});

describe("pagos de aviones fuera del reparto del mes (dados de baja)", () => {
  const baja = base({
    aeronave: { id: "b0b0b0b0-0000-4000-8000-000000000001", matricula: "XB-OLD", modelo: "Cessna 182" },
    socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." },
    porcentaje: 0,
    utilidad_usd: 0,
    pagado_usd: 1081.08,
    pendiente_usd: 0,
    estado: "SIN_UTILIDAD",
    vigente: false,
    aviso: "Ya no es socio de este avión en el mes: este renglón solo muestra sus pagos registrados.",
    pagos: [{ ...PAGO_MXN, aeronave_id: "b0b0b0b0-0000-4000-8000-000000000001", socio_id: ACC }],
  });
  const ctx = {
    modo: OK,
    puedeRegistrar: true,
    usuarios: [ALE],
    me: ALE,
    hoy: "2026-10-01",
    rol: "ADMIN",
  };

  it("se ven con su detalle, «Editar» y «Eliminar», sin «Registrar pago»", () => {
    const html = renderToStaticMarkup(<PagosFueraDelRepartoSection filas={[baja]} mes="2026-09" contexto={ctx} />);
    expect(html).toContain("Pagos de aviones fuera del reparto del mes");
    expect(html).toContain("XB-OLD");
    expect(html).toContain("Aero Charter Cancun S.A. de C.V.");
    expect(html).toContain("$20,000 MXN · T.C. 18.5 · ≈ $1,081.08 USD");
    expect(html).toContain("Entregó: Alejandro Canales");
    expect(html).toContain('data-accion="editar-pago-socio"');
    expect(html).toContain('data-accion="eliminar-pago-socio"');
    expect(html).not.toContain('data-accion="registrar-pago-socio"');
    expect(html).toContain("Ya no es socio de este avión en el mes");
  });

  it("sin filas no se pinta nada", () => {
    expect(renderToStaticMarkup(<PagosFueraDelRepartoSection filas={[]} mes="2026-09" contexto={ctx} />)).toBe("");
  });
});

describe("atajo «Mes pasado»", () => {
  it("lleva a septiembre completo y se marca cuando ya es el periodo", () => {
    const html = renderToStaticMarkup(
      <PeriodSelector initial={{ desde: "2026-10-01", hasta: "2026-10-01" }} atajoMesPasado hoy="2026-10-01" />,
    );
    expect(html).toContain("Mes pasado · Septiembre 2026");
    expect(html).toContain('aria-pressed="false"');
    const activo = renderToStaticMarkup(
      <PeriodSelector initial={{ desde: "2026-09-01", hasta: "2026-09-30" }} atajoMesPasado hoy="2026-10-01" />,
    );
    expect(activo).toContain('aria-pressed="true"');
    // Sin la prop (reportes, tableros) el selector queda como siempre.
    const sinProp = renderToStaticMarkup(<PeriodSelector initial={{ desde: "2026-10-01", hasta: "2026-10-01" }} />);
    expect(sinProp).not.toContain("Mes pasado");
    expect(sinProp).not.toContain('id="mes-reporte"');
  });

  it("selector de MES en la misma tarjeta: el texto «elige un mes en el selector» es verdad", () => {
    const html = renderToStaticMarkup(
      <PeriodSelector initial={{ desde: "2026-08-01", hasta: "2026-08-31" }} atajoMesPasado hoy="2026-10-01" />,
    );
    expect(html).toContain('id="mes-reporte"');
    expect(html).toMatch(/<label[^>]*for="mes-reporte"[^>]*>Mes<\/label>/);
    expect(html).toMatch(/<option value="2026-08" selected="">Agosto 2026<\/option>/);
    expect(html).toContain(">Septiembre 2026</option>");
    const select = html.match(/<select[^>]*id="mes-reporte"[^>]*>/)?.[0] ?? "";
    expect(select).toContain("cursor-pointer");
  });
});

describe("cableado en el código", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const pagina = leer("src/app/admin/profit-sharing/page.tsx");
  const tarjeta = leer("src/components/admin/profit-sharing/avion-reparto-card.tsx");
  const detalle = leer("src/components/admin/profit-sharing/pagos-socio-detalle.tsx");
  const dialogo = leer("src/components/admin/profit-sharing/pago-socio-dialog.tsx");
  const precierre = leer("src/components/admin/reportes/pre-cierre-card.tsx");

  it("la página: sección debajo de los KPIs y antes de las tarjetas; contexto a cada tarjeta; atajo", () => {
    const kpi = pagina.indexOf("<KpiStrip");
    const seccion = pagina.indexOf("<PagosSociosSection");
    const tarjetas = pagina.indexOf("<AvionRepartoCard");
    expect(kpi).toBeGreaterThan(0);
    expect(seccion).toBeGreaterThan(kpi);
    expect(tarjetas).toBeGreaterThan(seccion);
    expect(pagina).toMatch(/pagos=\{contextoPagos\}/);
    expect(pagina).toMatch(/mes \? getRepartoPagos\(mes\)/);
    expect(pagina).toMatch(/<PeriodSelector[^>]*atajoMesPasado/);
    expect(tarjeta).toMatch(/<SociosSection[\s\S]*?pagos=\{pagos\}/);
  });

  it("el DELETE sale UNA vez y solo desde «Eliminar pago» del diálogo de motivo", () => {
    expect(detalle.match(/eliminarPagoSocioAction\(/g)).toHaveLength(1);
    const botonFila = detalle.indexOf('data-accion="eliminar-pago-socio"');
    const confirmar = detalle.indexOf('data-accion="confirmar-eliminar-pago-socio"');
    const llamada = detalle.indexOf("eliminarPagoSocioAction(pago.id, motivo)");
    expect(confirmar).toBeGreaterThan(0);
    // La llamada vive DESPUÉS del botón de confirmar, no en el de la fila.
    expect(llamada).toBeGreaterThan(confirmar);
    expect(detalle.slice(botonFila, botonFila + 200)).toContain("onClick={onEliminar}");
  });

  it("exceso: «Registrar de todas formas» reintenta con aceptar_exceso y el MISMO client_request_id", () => {
    expect(dialogo).toContain("const [clientRequestId] = useState(nuevoIdSolicitud)");
    expect(dialogo).toContain("res.code === CODIGO_EXCEDE_UTILIDAD");
    expect(dialogo).toContain("onConfirmar={() => void guardar(true)}");
    expect(dialogo).toMatch(/client_request_id: clientRequestId,\s*meId: me\.id,\s*aceptar_exceso: aceptarExceso/);
  });

  it("el comprobante va del navegador DIRECTO al API (tope de Vercel), nunca por server action", () => {
    expect(detalle).toContain("adjuntarComprobantePagoSocio(pago.id, file)");
    expect(dialogo).toContain("adjuntarComprobantePagoSocio(res.data.pago.id, archivo)");
    const acciones = leer("src/app/admin/profit-sharing/actions.ts");
    expect(acciones).not.toMatch(/\/comprobante|FormData|fileBase64/);
  });

  it("pre-cierre: el renglón de socios pendientes lleva al reparto, lista socios, cuenta PAGOS y no repite el detalle", () => {
    expect(precierre).toContain("[CLAVE_PRECIERRE_PAGOS_SOCIOS]: hrefPagosSocios");
    expect(precierre).toContain("lineasPreCierrePagosSocios(");
    expect(precierre).toContain("conteoPreCierrePagosSocios(item.count, item.socios)");
    expect(precierre).toMatch(/esPagosSocios && item\.lectura_fallida !== true/);
    expect(precierre).toMatch(/ocultarDetalle = esPagosSocios && sociosPendientes\.lineas\.length > 0/);
    expect(precierre).toMatch(/\{!ocultarDetalle && \(/);
  });

  it("la página: pagos de aviones fuera del reparto, «Ver <mes>» y tarjetas en 2xl con pagos", () => {
    expect(pagina).toContain("filasFueraDelReparto(");
    expect(pagina).toMatch(/<PagosFueraDelRepartoSection[\s\S]*?contexto=\{contextoPagos\}/);
    // También cuando no hay aviones activos (todos dados de baja).
    const vacio = pagina.indexOf("<EmptyState");
    expect(pagina.indexOf("{seccionFuera}", vacio)).toBeGreaterThan(vacio);
    expect(pagina).toMatch(/<PagosSociosSection[^>]*hoy=\{hoy\}/);
    expect(pagina).toContain('"grid gap-4 2xl:grid-cols-2"');
  });

  it("el diálogo no se cierra mientras guarda (la X, Esc y el clic fuera)", () => {
    expect(dialogo).toContain("onOpenChange={(o) => !o && !ocupado && onCerrar()}");
    expect(dialogo).toContain("showCloseButton={!ocupado}");
    expect(dialogo).toContain("onOcupado?.(g !== null)");
    // «Hoy» se calcula al ABRIR, en el navegador (no el del render del servidor).
    expect(dialogo).toContain("const [hoyLocal] = useState(() => todayCancun() || hoy)");
    expect(dialogo).toContain("validarFormPago(form, hoyLocal)");
    expect(dialogo).toContain("max={hoyLocal}");
  });

  it("si la LLAMADA falla (red, 502) el diálogo no se queda «Guardando…» sin salida", () => {
    expect(dialogo).toMatch(/\} catch \{[\s\S]{0,300}setGuardando\(null\);\s*setErrorGeneral\(TEXTO_FALLO_RED_PAGO\)/);
    expect(detalle).toMatch(/\} catch \{[\s\S]{0,200}setEliminando\(false\);\s*setError\(TEXTO_FALLO_RED_BAJA\)/);
  });

  it("eliminar: el mínimo del motivo se DICE junto al contador", () => {
    expect(detalle).toContain("textoContadorMotivo(motivo)");
    expect(detalle).toContain("{contador.texto}");
  });
});
