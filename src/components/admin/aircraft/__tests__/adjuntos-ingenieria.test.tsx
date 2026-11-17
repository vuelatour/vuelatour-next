/**
 * EVIDENCIAS Y DOCUMENTOS en el expediente del avión (17-nov-2026, API
 * 0.0.140). Pedido del cliente: subir la foto o el PDF del sticker del taller
 * en cada mantenimiento —y los documentos de cada componente— y poder
 * descargarlos después.
 *
 * Vitest sin DOM: la lista se pinta con `renderToStaticMarkup` (el provider
 * arranca con `inicial`, sin red); los diálogos (portales de Base UI) y las
 * acciones se vigilan por su CABLEADO en el fuente. La subida paso a paso se
 * prueba de verdad en `lib/admin/__tests__/adjuntos-ingenieria.test.ts`.
 *
 *  1. cada destino pinta SUS archivos, con Ver / Descargar / Quitar;
 *  2. sin permiso de edición no hay subir ni quitar;
 *  3. API previo o migración sin aplicar ⇒ nada de botones y se dice en gris;
 *  4. carga fallida ⇒ se dice y se ofrece reintentar (nunca «sin archivos»);
 *  5. quitar confirma; un registro fallido limpia el objeto recién subido.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdjuntoIngenieria } from "@/types/engineering";

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
}));
vi.mock("@/lib/storage/documentos-flota", () => ({
  deleteDocumentoFlota: vi.fn(),
  uploadDocumentoFlota: vi.fn(),
}));

const {
  AdjuntosDestino,
  AdjuntosIngenieriaProvider,
  AdjuntosVista,
  AvisoAdjuntos,
} = await import("../adjuntos-ingenieria");
const { TEXTO_INVITA_STICKER, TEXTO_ADJUNTOS_NO_CARGARON } = await import(
  "@/lib/admin/adjuntos-ingenieria"
);
const { TEXTO_NO_DISPONIBLE } = await import("@/lib/admin/ingenieria-errores");

type EstadoAdjuntos = NonNullable<
  Parameters<typeof AdjuntosIngenieriaProvider>[0]["inicial"]
>;

const RAIZ = path.resolve(__dirname, "../../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const nada = () => {};

const adj = (p: Partial<AdjuntoIngenieria> & { id: string }): AdjuntoIngenieria => ({
  destino: "MANTENIMIENTO",
  destino_id: "m-1",
  aeronave_id: "a-1",
  nombre: "sticker-100hrs.pdf",
  mime: "application/pdf",
  bytes: 870_400,
  etiqueta: "STICKER",
  nota: null,
  subido_por_nombre: "Itzi",
  created_at: "2026-11-17T18:00:00Z",
  ...p,
});

const ARCHIVOS: AdjuntoIngenieria[] = [
  adj({ id: "1" }),
  adj({ id: "2", nombre: "foto-sticker.jpg", mime: "image/jpeg", nota: "Taller Toledo" }),
  adj({
    id: "3",
    destino: "COMPONENTE",
    destino_id: "c-1",
    nombre: "factura-llanta.pdf",
    etiqueta: "FACTURA",
  }),
  adj({ id: "4", destino: "MOTOR", destino_id: "mot-1", nombre: "certificado.pdf", etiqueta: "CERTIFICADO" }),
];

function conProvider(
  inicial: EstadoAdjuntos,
  hijos: React.ReactNode,
) {
  return renderToStaticMarkup(
    <AdjuntosIngenieriaProvider aircraftId="a-1" inicial={inicial}>
      {hijos}
    </AdjuntosIngenieriaProvider>,
  );
}

describe("AdjuntosVista · la lista de un destino", () => {
  const html = renderToStaticMarkup(
    <AdjuntosVista
      destino="MANTENIMIENTO"
      lista={ARCHIVOS.slice(0, 2)}
      puedeEditar
      onSubir={nada}
      onVer={nada}
      onDescargar={nada}
      onQuitar={nada}
    />,
  );
  const t = texto(html);

  it("cuenta, nombra y describe cada archivo", () => {
    expect(t).toContain("2 evidencias");
    expect(t).toContain("sticker-100hrs.pdf");
    expect(t).toContain("foto-sticker.jpg");
    expect(t).toContain("850 KB · 17/11/2026 · Itzi");
    expect(t).toContain("Taller Toledo");
    expect(t).toContain("Sticker / etiqueta de servicio");
  });

  it("cada archivo se puede ver, descargar y quitar", () => {
    for (const accion of ["Ver", "Descargar", "Quitar"]) {
      expect(html).toContain(`aria-label="${accion} sticker-100hrs.pdf"`);
      expect(html).toContain(`aria-label="${accion} foto-sticker.jpg"`);
    }
    expect(t).toContain("Subir evidencia");
  });

  it("la ruta del bucket nunca se pinta", () => {
    expect(html).not.toContain("oficina/");
    expect(html).not.toContain("documentos-flota");
  });

  it("sin permiso de edición: se ve y se descarga, pero no se sube ni se quita", () => {
    const soloLectura = renderToStaticMarkup(
      <AdjuntosVista
        destino="MANTENIMIENTO"
        lista={ARCHIVOS.slice(0, 1)}
        puedeEditar={false}
        onSubir={nada}
        onVer={nada}
        onDescargar={nada}
        onQuitar={nada}
      />,
    );
    expect(soloLectura).toContain('aria-label="Ver sticker-100hrs.pdf"');
    expect(soloLectura).toContain('aria-label="Descargar sticker-100hrs.pdf"');
    expect(soloLectura).not.toContain('aria-label="Quitar sticker-100hrs.pdf"');
    expect(soloLectura).not.toContain('data-accion="subir-adjunto"');
  });

  it("orden COMPLETADA sin evidencia: invita a subir el sticker; con evidencia, no", () => {
    const vacia = (invitar: boolean) =>
      texto(
        renderToStaticMarkup(
          <AdjuntosVista
            destino="MANTENIMIENTO"
            lista={[]}
            puedeEditar
            invitar={invitar}
            onSubir={nada}
            onVer={nada}
            onDescargar={nada}
            onQuitar={nada}
          />,
        ),
      );
    expect(vacia(true)).toContain(TEXTO_INVITA_STICKER);
    expect(vacia(true)).toContain("Sin evidencias");
    expect(vacia(false)).not.toContain(TEXTO_INVITA_STICKER);
    const conEvidencia = texto(
      renderToStaticMarkup(
        <AdjuntosVista
          destino="MANTENIMIENTO"
          lista={ARCHIVOS.slice(0, 1)}
          puedeEditar
          invitar
          onSubir={nada}
          onVer={nada}
          onDescargar={nada}
          onQuitar={nada}
        />,
      ),
    );
    expect(conEvidencia).not.toContain(TEXTO_INVITA_STICKER);
  });
});

describe("AdjuntosDestino · reparte por destino con UNA sola carga", () => {
  const listo: EstadoAdjuntos = { estado: "listo", adjuntos: ARCHIVOS };

  it("cada destino pinta solo lo suyo", () => {
    const orden = texto(
      conProvider(listo, <AdjuntosDestino destino="MANTENIMIENTO" destinoId="m-1" />),
    );
    expect(orden).toContain("2 evidencias");
    expect(orden).not.toContain("factura-llanta.pdf");

    const pieza = texto(
      conProvider(listo, <AdjuntosDestino destino="COMPONENTE" destinoId="c-1" />),
    );
    expect(pieza).toContain("1 documento");
    expect(pieza).toContain("factura-llanta.pdf");
    expect(pieza).toContain("Subir documento");

    const motor = texto(conProvider(listo, <AdjuntosDestino destino="MOTOR" destinoId="mot-1" />));
    expect(motor).toContain("certificado.pdf");

    const sinNada = texto(
      conProvider(listo, <AdjuntosDestino destino="HELICE" destinoId="h-1" />),
    );
    expect(sinNada).toContain("Sin documentos");
  });

  it("API previo o migración sin aplicar: ni lista ni botón; se dice UNA vez, en gris", () => {
    const html = conProvider(
      { estado: "no_disponible", adjuntos: [] },
      <>
        <AvisoAdjuntos destino="MANTENIMIENTO" />
        <AdjuntosDestino destino="MANTENIMIENTO" destinoId="m-1" />
        <AdjuntosDestino destino="MANTENIMIENTO" destinoId="m-2" />
      </>,
    );
    expect(html).not.toContain('data-accion="subir-adjunto"');
    expect(html).not.toContain("Sin evidencias");
    expect(texto(html)).toContain(`Evidencias: ${TEXTO_NO_DISPONIBLE}`);
    expect(html.match(/Disponible cuando/g)).toHaveLength(1);
    expect(html).toContain("text-muted-foreground");
  });

  it("carga fallida: se dice y se ofrece reintentar; jamás «Sin evidencias»", () => {
    const html = conProvider(
      { estado: "error", adjuntos: [] },
      <>
        <AvisoAdjuntos destino="MANTENIMIENTO" />
        <AdjuntosDestino destino="MANTENIMIENTO" destinoId="m-1" />
      </>,
    );
    const t = texto(html);
    expect(t).toContain(TEXTO_ADJUNTOS_NO_CARGARON);
    expect(t).toContain("Reintentar");
    expect(t).not.toContain("Sin evidencias");
    expect(html).not.toContain('data-accion="subir-adjunto"');
  });

  it("mientras carga no pinta nada (ni un «sin archivos» prematuro)", () => {
    const html = conProvider(
      { estado: "cargando", adjuntos: [] },
      <>
        <AvisoAdjuntos destino="MANTENIMIENTO" />
        <AdjuntosDestino destino="MANTENIMIENTO" destinoId="m-1" />
      </>,
    );
    expect(html).toBe("");
  });

  it("con los archivos cargados el aviso no estorba", () => {
    expect(conProvider(listo, <AvisoAdjuntos destino="COMPONENTE" />)).toBe("");
  });

  it("fuera del provider lo nuevo se esconde (no revienta)", () => {
    expect(
      renderToStaticMarkup(<AdjuntosDestino destino="MOTOR" destinoId="mot-1" />),
    ).toBe("");
  });
});

describe("cableado de subir, abrir y quitar", () => {
  const src = leer("components/admin/aircraft/adjuntos-ingenieria.tsx");

  it("sube al bucket, registra en el API y, si el registro falla, LIMPIA el objeto", () => {
    expect(src).toContain("await subirAdjuntos(validos, {");
    expect(src).toContain("subir: uploadDocumentoFlota,");
    expect(src).toContain("registrarAdjuntoIngenieria({");
    expect(src).toContain("limpiar: deleteDocumentoFlota,");
    // El body lo serializa `apiBrowser`: nunca a mano.
    expect(src).not.toContain("JSON.stringify");
  });

  it("deja elegir VARIOS archivos y solo los formatos del bucket", () => {
    expect(src).toMatch(/type="file"\s+multiple\s+accept=\{ACCEPT_ADJUNTO\}/);
  });

  it("quitar pasa SIEMPRE por la confirmación", () => {
    // La lista solo pide confirmar; el borrado vive en `confirmarQuitar`.
    expect(src).toContain("onQuitar={setQuitando}");
    expect(src).toContain("<AlertDialog open={!!quitando}");
    expect(src.match(/quitarAdjuntoIngenieria\(/g)).toHaveLength(1);
    const confirmar = src.slice(src.indexOf("const confirmarQuitar"));
    expect(confirmar.indexOf("quitarAdjuntoIngenieria(quitando.id)")).toBeGreaterThan(0);
  });

  it("ver y descargar piden la URL firmada al API (nada de blob:)", () => {
    expect(src).toContain("urlAdjuntoIngenieria(a.id, descargar)");
    expect(src).not.toContain("createObjectURL");
    expect(src).not.toContain("blob:");
  });

  it("el cliente del API usa las rutas del contrato", () => {
    const api = leer("lib/api/engineering.ts");
    expect(api).toContain("`/v1/engineering/aircraft/${aircraftId}/adjuntos`");
    expect(api).toContain('apiBrowser<AdjuntoIngenieria>("/v1/engineering/adjuntos"');
    expect(api).toContain("`/v1/engineering/adjuntos/${adjuntoId}/url`");
    expect(api).toContain("{ searchParams: { descargar } }");
    expect(api).not.toContain("JSON.stringify");
  });
});
