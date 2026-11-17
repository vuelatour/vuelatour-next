/**
 * COMPONENTES CON VIDA LÍMITE en el expediente del avión (17-nov-2026, API
 * 0.0.140). Pedido del cliente: «la lista de componentes del avión y su
 * seguimiento… saber cuánto tiempo le queda a un foco, a una llanta» y
 * «subir uno o varios documentos por componente».
 *
 * Vitest sin DOM: la lista se pinta con `renderToStaticMarkup`; los diálogos
 * (portales de Base UI) se vigilan por su CABLEADO en el fuente. Los textos y
 * los números se prueban en `lib/admin/__tests__/componentes-aeronave.test.ts`.
 *
 *  1. cada estado se ve distinto (color + lo que le queda) con lo que manda
 *     el API, sin recalcular;
 *  2. API previo / migración sin aplicar ⇒ sin «Agregar» y se dice en gris;
 *     carga fallida ⇒ se dice y se ofrece reintentar;
 *  3. reemplazar, retirar y eliminar CONFIRMAN;
 *  4. el historial de retirados es un `<details>` que no desmonta nada.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AdjuntoIngenieria,
  ComponenteAeronave,
  ComponentesAeronaveRespuesta,
  VidaComponente,
} from "@/types/engineering";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    info: () => {},
    warning: () => {},
  }),
}));
vi.mock("@/lib/api/engineering", () => ({
  listAdjuntosIngenieria: vi.fn(),
  quitarAdjuntoIngenieria: vi.fn(),
  registrarAdjuntoIngenieria: vi.fn(),
  urlAdjuntoIngenieria: vi.fn(),
  listComponentesAeronave: vi.fn(),
  crearComponenteAeronave: vi.fn(),
  actualizarComponenteAeronave: vi.fn(),
  reemplazarComponenteAeronave: vi.fn(),
  retirarComponenteAeronave: vi.fn(),
  eliminarComponenteAeronave: vi.fn(),
}));
vi.mock("@/lib/storage/documentos-flota", () => ({
  deleteDocumentoFlota: vi.fn(),
  uploadDocumentoFlota: vi.fn(),
}));

const { AircraftComponentes, ComponentesLista, ComponentesRetirados, TITULO_COMPONENTES_VIDA } =
  await import("../aircraft-componentes");
const { AdjuntosIngenieriaProvider } = await import("../adjuntos-ingenieria");
const { TEXTO_COMPONENTES_NO_CARGARON } = await import("@/lib/admin/componentes-aeronave");
const { TEXTO_NO_DISPONIBLE } = await import("@/lib/admin/ingenieria-errores");

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const nada = () => {};
const recargar = async () => {};

const vida = (p: Partial<VidaComponente> = {}): VidaComponente => ({
  horas_en_servicio: 379.5,
  horas_restantes: 120.5,
  vence_el: "2027-03-12",
  dias_restantes: 115,
  dias_en_servicio: 250,
  estado: "VIGENTE",
  por: "HORAS",
  faltantes: [],
  ...p,
});

const comp = (p: Partial<ComponenteAeronave> = {}): ComponenteAeronave => ({
  id: "c-1",
  aeronave_id: "a-1",
  nombre: "Llanta principal",
  categoria: "Tren de aterrizaje",
  posicion: "Izquierda",
  numero_parte: "6.00-6",
  numero_serie: "A123",
  fabricante: "Goodyear",
  fecha_instalacion: "2026-03-12",
  horas_aeronave_instalacion: 5480.2,
  horas_previas: 0,
  limite_horas: 500,
  limite_meses: 12,
  fecha_vencimiento: null,
  aviso_horas: 10,
  aviso_dias: 30,
  notas: null,
  estado: "INSTALADO",
  fecha_retiro: null,
  horas_aeronave_retiro: null,
  motivo_retiro: null,
  reemplaza_a_id: null,
  reemplazado_por_id: null,
  created_at: "2026-03-12T15:00:00Z",
  updated_at: "2026-03-12T15:00:00Z",
  actualizado_por_nombre: null,
  vida: vida(),
  ...p,
});

const FOCO_VENCIDO = comp({
  id: "c-foco",
  nombre: "Foco de aterrizaje",
  posicion: null,
  categoria: "Luces",
  numero_parte: null,
  numero_serie: null,
  fabricante: null,
  limite_horas: 25,
  limite_meses: null,
  vida: vida({
    horas_en_servicio: 28.2,
    horas_restantes: -3.2,
    vence_el: null,
    dias_restantes: null,
    estado: "VENCIDO",
    por: "HORAS",
  }),
});

const ELT_POR_VENCER = comp({
  id: "c-elt",
  nombre: "Batería del ELT",
  posicion: null,
  limite_horas: null,
  limite_meses: null,
  fecha_vencimiento: "2026-12-07",
  vida: vida({
    horas_restantes: null,
    vence_el: "2026-12-07",
    dias_restantes: 20,
    estado: "POR_VENCER",
    por: "FECHA",
  }),
});

const FILTRO_SIN_DATO = comp({
  id: "c-filtro",
  nombre: "Filtro de aceite",
  posicion: null,
  limite_meses: null,
  horas_aeronave_instalacion: null,
  vida: vida({
    horas_en_servicio: null,
    horas_restantes: null,
    vence_el: null,
    dias_restantes: null,
    estado: "SIN_DATOS",
    por: null,
    faltantes: ["horas_aeronave_instalacion"],
  }),
});

const CINTURON_A_CONDICION = comp({
  id: "c-cint",
  nombre: "Cinturones de seguridad",
  posicion: null,
  limite_horas: null,
  limite_meses: null,
  vida: vida({
    horas_restantes: null,
    vence_el: null,
    dias_restantes: null,
    estado: "SIN_LIMITE",
    por: null,
  }),
});

const RETIRADA = comp({
  id: "c-vieja",
  numero_serie: "Z999",
  estado: "RETIRADO",
  fecha_retiro: "2026-03-12",
  horas_aeronave_retiro: 5480.2,
  motivo_retiro: "Desgaste",
  reemplazado_por_id: "c-1",
  vida: vida({
    horas_en_servicio: 410,
    dias_en_servicio: 300,
    horas_restantes: null,
    vence_el: null,
    dias_restantes: null,
    estado: "SIN_LIMITE",
    por: null,
  }),
});

const lista = (componentes: ComponenteAeronave[], puedeEditar = true) =>
  renderToStaticMarkup(
    <ComponentesLista
      componentes={componentes}
      puedeEditar={puedeEditar}
      onEditar={nada}
      onReemplazar={nada}
      onRetirar={nada}
      onEliminar={nada}
    />,
  );

/** El `<li>` de un componente (para mirar SOLO su renglón). */
function renglon(html: string, id: string): string {
  const ini = html.indexOf(`data-componente="${id}"`);
  const fin = html.indexOf("</li>", ini);
  return html.slice(ini, fin);
}

describe("ComponentesLista · cuánto le queda a cada pieza", () => {
  const html = lista([
    FOCO_VENCIDO,
    ELT_POR_VENCER,
    FILTRO_SIN_DATO,
    comp(),
    CINTURON_A_CONDICION,
  ]);

  it("vigente: ficha completa, lo que le queda y la barra de vida usada", () => {
    const r = renglon(html, "c-1");
    const t = texto(r);
    expect(t).toContain("Llanta principal · Izquierda");
    expect(t).toContain("Tren de aterrizaje · P/N 6.00-6 · S/N A123 · Goodyear");
    expect(t).toContain("Instalado el 12/03/2026 · Hobbs 5,480.2 h");
    expect(t).toContain("cada 500 h o 12 meses");
    expect(t).toContain("faltan 120.5 h");
    expect(t).toContain("vence el 12/03/2027 · en 115 días");
    expect(t).toContain("lleva 379.5 h · 8 meses instalado");
    expect(t).toContain("Vigente");
    expect(r).toContain('data-estado-vida="VIGENTE"');
    expect(r).toContain('aria-label="Vida usada: 76 %"');
    expect(r).toContain("bg-emerald-500");
    expect(r).toContain("width:76%");
  });

  it("vencido: rojo y «vencido por 3.2 h» (nunca «faltan −3.2 h»)", () => {
    const r = renglon(html, "c-foco");
    const t = texto(r);
    expect(t).toContain("Vencido");
    expect(t).toContain("vencido por 3.2 h");
    expect(t).not.toContain("faltan");
    expect(r).toContain("text-destructive");
    expect(r).toContain("bg-destructive");
    expect(r).toContain("width:100%");
    expect(t).toContain("Luces");
  });

  it("por vencer por FECHA: ámbar y la fecha exacta de la etiqueta", () => {
    const r = renglon(html, "c-elt");
    const t = texto(r);
    expect(t).toContain("Por vencer");
    expect(t).toContain("vence el 07/12/2026");
    expect(t).toContain("vence el 07/12/2026 · en 20 días");
    expect(r).toContain("text-amber-600");
  });

  it("falta un dato: se dice cuál, en ámbar, y no se pinta barra", () => {
    const r = renglon(html, "c-filtro");
    const t = texto(r);
    expect(t).toContain("Falta un dato");
    expect(t).toContain("falta capturar el Hobbs al instalar");
    expect(r).not.toContain("Vida usada");
  });

  it("a condición: sin límite, sin barra, solo cuánto lleva", () => {
    const r = renglon(html, "c-cint");
    const t = texto(r);
    expect(t).toContain("A condición");
    expect(t).toContain("a condición (sin límite)");
    expect(t).toContain("sin límite: se cambia a condición");
    expect(r).not.toContain("Vida usada");
  });

  it("el orden es el del API (lo urgente primero): el panel no reordena", () => {
    const ids = [...html.matchAll(/data-componente="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["c-foco", "c-elt", "c-filtro", "c-1", "c-cint"]);
  });

  it("acciones por componente; sin permiso de edición, ninguna", () => {
    const t = texto(renglon(html, "c-1"));
    for (const accion of ["Reemplazar", "Editar", "Retirar", "Eliminar"]) {
      expect(t).toContain(accion);
    }
    const soloLectura = texto(lista([comp()], false));
    for (const accion of ["Reemplazar", "Editar", "Retirar", "Eliminar"]) {
      expect(soloLectura).not.toContain(accion);
    }
  });

  it("lista vacía: invita a agregar (esto sí es «no hay»)", () => {
    expect(texto(lista([]))).toContain("Sin componentes registrados");
  });

  it("los documentos de cada pieza salen en su renglón", () => {
    const factura: AdjuntoIngenieria = {
      id: "adj-1",
      destino: "COMPONENTE",
      destino_id: "c-1",
      aeronave_id: "a-1",
      nombre: "factura-llanta.pdf",
      mime: "application/pdf",
      bytes: 120_000,
      etiqueta: "FACTURA",
      nota: null,
      subido_por_nombre: null,
      created_at: "2026-03-12T18:00:00Z",
    };
    const conDocs = renderToStaticMarkup(
      <AdjuntosIngenieriaProvider
        aircraftId="a-1"
        inicial={{ estado: "listo", adjuntos: [factura] }}
      >
        <ComponentesLista
          componentes={[comp(), FOCO_VENCIDO]}
          puedeEditar
          onEditar={nada}
          onReemplazar={nada}
          onRetirar={nada}
          onEliminar={nada}
        />
      </AdjuntosIngenieriaProvider>,
    );
    expect(texto(renglon(conDocs, "c-1"))).toContain("factura-llanta.pdf");
    expect(texto(renglon(conDocs, "c-1"))).toContain("1 documento");
    expect(texto(renglon(conDocs, "c-foco"))).toContain("Sin documentos");
    expect(texto(renglon(conDocs, "c-foco"))).not.toContain("factura-llanta.pdf");
  });
});

describe("AircraftComponentes · estados de la carga", () => {
  const datos: ComponentesAeronaveRespuesta = {
    disponible: true,
    horas_aeronave: 5599.4,
    hoy: "2026-11-17",
    componentes: [FOCO_VENCIDO, comp()],
    retirados: [RETIRADA],
  };
  const pintar = (
    estado: "cargando" | "listo" | "no_disponible" | "error",
    d: ComponentesAeronaveRespuesta | null = null,
  ) =>
    renderToStaticMarkup(
      <AircraftComponentes aircraftId="a-1" estado={estado} datos={d} recargar={recargar} />,
    );

  it("listo: título, «Agregar componente», la lista y el historial", () => {
    const html = pintar("listo", datos);
    const t = texto(html);
    expect(t).toContain(TITULO_COMPONENTES_VIDA);
    expect(html).toContain('data-accion="agregar-componente"');
    expect(t).toContain("Foco de aterrizaje");
    expect(t).toContain("Historial de componentes retirados (1)");
  });

  it("API previo o migración sin aplicar: sin «Agregar», en gris", () => {
    const html = pintar("no_disponible");
    expect(html).not.toContain('data-accion="agregar-componente"');
    expect(texto(html)).toContain(TEXTO_NO_DISPONIBLE);
    expect(html).toContain('data-componentes="no-disponible"');
    expect(texto(html)).not.toContain("Sin componentes registrados");
  });

  it("carga fallida: se dice y se ofrece reintentar; jamás «sin componentes»", () => {
    const html = pintar("error");
    const t = texto(html);
    expect(t).toContain(TEXTO_COMPONENTES_NO_CARGARON);
    expect(t).toContain("Reintentar");
    expect(t).not.toContain("Sin componentes registrados");
    expect(html).not.toContain('data-accion="agregar-componente"');
  });

  it("cargando: tampoco afirma que no hay", () => {
    const t = texto(pintar("cargando"));
    expect(t).toContain("Cargando componentes…");
    expect(t).not.toContain("Sin componentes registrados");
  });
});

describe("ComponentesRetirados · historial plegable", () => {
  it("es un <details> nativo: el contenido está montado aunque esté cerrado", () => {
    const html = renderToStaticMarkup(
      <ComponentesRetirados retirados={[RETIRADA]} puedeEditar />,
    );
    expect(html).toMatch(/^<details[^>]*data-componentes="retirados"/);
    expect(html).not.toContain(" open");
    const t = texto(html);
    expect(t).toContain("Historial de componentes retirados (1)");
    expect(t).toContain("Llanta principal · Izquierda");
    expect(t).toContain("S/N Z999");
    expect(t).toContain("Retirado el 12/03/2026 · Hobbs 5,480.2 h · estuvo 410.0 h · 9 meses");
    expect(t).toContain("Se cambió por una pieza nueva");
    expect(t).toContain("Motivo: Desgaste");
  });

  it("sin retirados no se pinta", () => {
    expect(renderToStaticMarkup(<ComponentesRetirados retirados={[]} puedeEditar />)).toBe("");
  });
});

describe("cableado: toda acción destructiva confirma", () => {
  const src = leer("components/admin/aircraft/aircraft-componentes.tsx");

  it("reemplazar: formulario → confirmación → API (dos pasos)", () => {
    const dialogo = src.slice(src.indexOf("function ReemplazarDialog"), src.indexOf("function RetirarDialog"));
    expect(dialogo).toContain("const confirmar = textoConfirmarReemplazo(componente);");
    expect(dialogo).toContain("if (Object.keys(errs).length === 0) setConfirmando(true);");
    // El API solo se llama desde el paso de confirmación.
    expect(dialogo.match(/reemplazarComponenteAeronave\(/g)).toHaveLength(1);
    expect(dialogo).toContain("{confirmando ? (");
    expect(dialogo).toContain("onClick={() => void reemplazar()}");
    expect(dialogo).toContain("{guardando ? \"Guardando…\" : confirmar.boton}");
    // «Continuar» NO guarda: solo valida y pasa a la confirmación.
    expect(dialogo).toContain("<Button type=\"button\" onClick={continuar}>");
  });

  it("tras el cambio se ofrece subir la factura o el certificado de la pieza nueva", () => {
    expect(src).toContain("if (adjuntos.estado === \"listo\") setOfrecerDocumento(nuevo);");
    expect(src).toContain("¿Subes ahora la factura o el certificado de la pieza nueva?");
    expect(src).toContain("destinoId={subirPara.id}");
  });

  it("retirar: el diálogo dice qué pasa y lo pide en rojo", () => {
    const dialogo = src.slice(src.indexOf("function RetirarDialog"));
    expect(dialogo).toContain("const texto = textoConfirmarRetiro(componente);");
    expect(dialogo).toContain("<DialogDescription>{texto.descripcion}</DialogDescription>");
    expect(dialogo).toContain('variant="destructive"');
  });

  it("eliminar: pasa por un AlertDialog", () => {
    expect(src).toContain("onEliminar={setEliminando}");
    expect(src).toContain("<AlertDialog open={!!eliminando}");
    expect(src.match(/eliminarComponenteAeronave\(/g)).toHaveLength(1);
    const confirmar = src.slice(src.indexOf("const confirmarEliminar"));
    expect(confirmar.indexOf("eliminarComponenteAeronave(eliminando.id)")).toBeGreaterThan(0);
  });

  it("los derivados NO se recalculan: el panel no hace cuentas con el Hobbs", () => {
    expect(src).not.toMatch(/horas_aeronave\s*-\s*/);
    expect(src).not.toContain("daysUntilCancun");
    const lib = leer("lib/admin/componentes-aeronave.ts");
    expect(lib).not.toContain("daysUntilCancun");
    expect(lib).not.toContain("todayCancun");
  });

  it("el cliente del API usa las rutas del contrato", () => {
    const api = leer("lib/api/engineering.ts");
    expect(api).toContain("`/v1/engineering/aircraft/${aircraftId}/components`");
    expect(api).toContain("`/v1/engineering/components/${componenteId}`");
    expect(api).toContain("`/v1/engineering/components/${componenteId}/reemplazar`");
    expect(api).toContain("`/v1/engineering/components/${componenteId}/retirar`");
  });
});
