/**
 * «Fecha» en «Vincular gasto» (14-oct-2026, API 0.0.76): el diálogo anidado
 * «Corregir la fecha del gasto» (render estático) y el CABLEADO por regex
 * sobre los fuentes:
 *  1. el diálogo con el caso Winjet (gasto 08c0632c $321.54 del 10-oct contra
 *     el cargo 5e3178db de $345.00 del 12-oct): textos, campo de fecha con
 *     sus límites, aviso de monto, nota de tarjeta y la nota fija. Desde la
 *     revisión del 14-oct-2026 una TARJETA a 3 días o menos abre con la fecha
 *     del ticket (atajo a la del cargo) y la descripción no dice «la del
 *     cargo del banco»; una transferencia abre con la del cargo;
 *  2. los estados del cuerpo: atajo, misma fecha (gris, no error), candado
 *     del mes del vuelo, confirmación del API, bloqueo y «Guardando…»;
 *  3. el renglón: el botón «Fecha» va FUERA del <label> (hermano), lleva
 *     type="button", aria-haspopup y cursor-pointer, dice «Fecha» también en
 *     el teléfono y solo sale en gastos bancarios; la lista se corrige con el
 *     mapa (sin volver a pedirla); «Deshacer» manda confirmar: true y lee la
 *     respuesta con `resultadoCorregirFecha`; la página se refresca al CERRAR
 *     (la action ya no revalida); el diálogo se carga sin SSR y su chunk se
 *     precarga al abrir;
 *  4. el diálogo: la action con .catch(sinConexion), formulario noValidate,
 *     cursor-pointer y type en todo botón, ningún texto literal.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GastoCandidato, MovimientoBancario } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
// La red y la sesión no son parte de esta prueba.
vi.mock("@/app/admin/conciliacion/actions", () => ({ corregirFechaGastoAction: vi.fn() }));
// El diálogo de Base UI se monta en un portal (no existe en el render del
// server): aquí se pinta en línea, abierto o cerrado según `open`.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { CorregirFechaGastoDialog, CuerpoCorregirFecha } = await import("../corregir-fecha-gasto-dialog");
type Estado = Parameters<typeof CuerpoCorregirFecha>[0]["estado"];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T17:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const WINJET: GastoCandidato = {
  id: "08c0632c-5711-4f0d-affd-591d756dd9fc",
  fecha: "2026-10-10",
  monto: 321.54,
  moneda: "MXN",
  categoria: "TAXI",
  medio_pago: "TARJETA_CORP",
  tarjeta_terminacion: "0585",
  proveedor: null,
  lugar: null,
  nota: "Winjet · Boleto Adulto ferry CZM-PDC",
  vuelo_folio: 436,
  conciliado: false,
  monto_vinculado: 0,
  faltante: 321.54,
  no_bancario: false,
};

const CARGO: Pick<MovimientoBancario, "id" | "fecha" | "monto" | "descripcion"> = {
  id: "5e3178db-c0ac-4a65-bc11-2e34fc3b34ab",
  fecha: "2026-10-12",
  monto: "345.00",
  descripcion: "WINJET PLAYA DEL CARME",
};

const nada = () => {};

function dialogo(candidato: GastoCandidato = WINJET): string {
  return renderToStaticMarkup(
    <CorregirFechaGastoDialog
      candidato={candidato}
      movimiento={CARGO}
      monedaCuenta="MXN"
      dias={30}
      onCerrar={nada}
      onCorregida={nada}
      onFechaVigente={nada}
      onGastoNoExiste={nada}
    />,
  );
}

function cuerpo(
  o: { fecha?: string; estado?: Estado; pending?: boolean; candidato?: GastoCandidato; fechaActual?: string } = {},
): string {
  return renderToStaticMarkup(
    <CuerpoCorregirFecha
      idCampo="campo"
      candidato={o.candidato ?? WINJET}
      movimiento={CARGO}
      monedaCuenta="MXN"
      dias={30}
      hoy="2026-10-14"
      fecha={o.fecha ?? "2026-10-12"}
      fechaActual={o.fechaActual ?? "2026-10-10"}
      estado={o.estado ?? { tipo: "editando" }}
      pending={o.pending ?? false}
      onFecha={nada}
      onEnviar={nada}
      onCancelar={nada}
    />,
  );
}

/** Las etiquetas de apertura de todos los botones (nativos y de Base UI). */
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];
const guardar = (html: string) => botones(html).find((b) => b.includes('type="submit"')) ?? "";
const cancelar = (html: string) => {
  const i = html.indexOf(">Cancelar</button>");
  const abre = html.lastIndexOf("<button", i);
  return html.slice(abre, html.indexOf(">", abre) + 1);
};

describe("el diálogo con el caso Winjet (tarjeta con 2 días de desfase)", () => {
  const html = dialogo();

  it("título, descripción SIN «la del cargo del banco», fecha actual y el cargo", () => {
    expect(html).toContain('data-dialogo="abierto"');
    expect(html).toContain("Corregir la fecha del gasto");
    expect(html).toContain(
      "Taxi / estacionamiento · $321.54 MXN · Winjet · Boleto Adulto ferry CZM-PDC. La fecha del gasto es la del PAGO, no la de la factura.",
    );
    expect(html).not.toContain("(la del cargo del banco)");
    expect(html).toContain("Fecha actual del gasto: 10 oct 2026");
    expect(html).toContain("Cargo de $345 MXN del 12 oct 2026 · WINJET PLAYA DEL CARME");
  });

  it("el campo nace con la fecha del TICKET (no se mueve en dos clics), de hace 365 días a hoy, con el atajo al cargo", () => {
    const campo = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(campo).toContain('value="2026-10-10"');
    expect(campo).toContain('min="2025-10-14"');
    expect(campo).toContain('max="2026-10-14"');
    expect(campo).toContain("cursor-pointer");
    // La misma fecha no es un error: gris, sin role=alert ni aria-invalid.
    expect(campo).toContain('aria-invalid="false"');
    expect(html).toMatch(/<p data-sin-cambio-fecha="" class="[^"]*text-muted-foreground[^"]*">Es la misma fecha que ya tiene el gasto\.<\/p>/);
    expect(html).not.toMatch(/role="alert"[^>]*>Es la misma fecha/);
    expect(html).toContain("Fecha del pago");
    expect(html).toContain("Usar la fecha del cargo (12 oct 2026)");
    // El campo describe con la nota fija (la misma id).
    const describe = /aria-describedby="([^"]+)"/.exec(campo)?.[1];
    expect(describe).toBeTruthy();
    expect(html).toContain(`id="${describe}"`);
  });

  it("aviso de monto (ámbar), nota de tarjeta y la nota fija; «Guardar fecha» apagado hasta elegir otra fecha", () => {
    expect(html).toContain(
      "Ojo: con la fecha no basta para vincularlo solo: el cargo ($345.00) es mayor que el gasto ($321.54) por $23.46. Si el ticket dice otro monto, corrígelo en Gastos; si el cargo pagó varios gastos, márcalos todos.",
    );
    expect(html).toMatch(/data-aviso-fecha="monto" class="[^"]*text-amber-700/);
    expect(html).toMatch(/data-aviso-fecha="tarjeta" class="[^"]*text-muted-foreground/);
    expect(html).toContain("Con tarjeta, el banco registra el cargo 1 a 3 días después del ticket");
    expect(html).toContain("Guardar solo cambia la fecha: no vincula el gasto. El cambio queda registrado con tu nombre.");
    expect(html).toContain(">Guardar fecha</button>");
    expect(guardar(html)).toMatch(/\sdisabled=""/);
  });
});

describe("el diálogo con una transferencia (sin desfase de tarjeta)", () => {
  const html = dialogo({ ...WINJET, medio_pago: "TRANSFERENCIA", tarjeta_terminacion: null });

  it("nace con la fecha del CARGO, sin atajo, con la frase completa y «Guardar fecha» encendido", () => {
    const campo = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(campo).toContain('value="2026-10-12"');
    expect(html).toContain("La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.");
    expect(html).not.toContain("Usar la fecha del cargo");
    expect(html).not.toContain('data-aviso-fecha="tarjeta"');
    expect(guardar(html)).not.toMatch(/\sdisabled=""/);
  });
});

describe("estados del cuerpo", () => {
  it("con otra fecha, el atajo «Usar la fecha del cargo» es un botón type=button con cursor-pointer", () => {
    const html = cuerpo({ fecha: "2026-10-11" });
    const atajo = botones(html).find((b, i, arr) => html.includes(`${arr[i]}Usar la fecha del cargo (12 oct 2026)</button>`));
    expect(atajo).toBeDefined();
    expect(atajo).toContain('type="button"');
    expect(atajo).toContain("cursor-pointer");
  });

  it("la misma fecha que ya tiene ⇒ nota GRIS (no es un error) y «Guardar fecha» apagado", () => {
    const html = cuerpo({ fecha: "2026-10-10" });
    expect(html).toMatch(/<p data-sin-cambio-fecha=""[^>]*>Es la misma fecha que ya tiene el gasto\.<\/p>/);
    expect(html).not.toMatch(/<p role="alert"[^>]*>Es la misma fecha/);
    expect(guardar(html)).toMatch(/\sdisabled=""/);
    expect(html).toMatch(/<input[^>]*aria-invalid="false"/);
  });

  it("una fecha que el API rechazaría por el mes del vuelo ⇒ caja roja ANTES de guardar y «Guardar fecha» apagado", () => {
    // Prod, 14-oct: TAXI del vuelo #109 (31-jul) contra el cargo del Tren Maya del 10-ago.
    const tren: GastoCandidato = {
      ...WINJET,
      fecha: "2026-07-31",
      vuelo_folio: 109,
      candado_mes_vuelo: { vuelo_dia: "2026-07-31", vuelo_folio: 109 },
    };
    const html = cuerpo({ candidato: tren, fechaActual: "2026-07-31", fecha: "2026-08-10" });
    expect(html).toMatch(
      /<p role="alert"[^>]*>No se puede: este gasto es del vuelo #109 \(31 jul 2026\)\. Con fecha de agosto 2026 quedaría en otro mes que su vuelo/,
    );
    expect(html).toContain("para vincularlo no hace falta cambiarla.");
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/);
    expect(guardar(html)).toMatch(/\sdisabled=""/);
    // Dentro de julio sí se puede.
    expect(guardar(cuerpo({ candidato: tren, fechaActual: "2026-07-31", fecha: "2026-07-29" }))).not.toMatch(/\sdisabled=""/);
  });

  it("confirmación del API ⇒ caja ámbar en role=alert con su título y el botón «Sí, pasarlo a octubre 2026»", () => {
    const html = cuerpo({
      fecha: "2026-10-02",
      estado: {
        tipo: "confirmar",
        titulo: "¿Cambiar el gasto de mes?",
        texto: "Este gasto pasa de septiembre 2026 a octubre 2026. …",
        boton: "Sí, pasarlo a octubre 2026",
      },
    });
    expect(html).toMatch(/<div role="alert" data-confirmar-fecha=""[^>]*>/);
    expect(html).toContain("¿Cambiar el gasto de mes?");
    expect(html).toContain("Este gasto pasa de septiembre 2026 a octubre 2026. …");
    expect(html).toContain(">Sí, pasarlo a octubre 2026</button>");
    expect(guardar(html)).not.toMatch(/\sdisabled=""/);
  });

  it("bloqueo del API ⇒ caja roja en role=alert y «Guardar fecha» apagado hasta cambiar la fecha", () => {
    const html = cuerpo({ estado: { tipo: "bloqueo", texto: "El gasto es del vuelo #201: …" } });
    expect(html).toMatch(/<p role="alert" data-error-fecha=""[^>]*>El gasto es del vuelo #201: …<\/p>/);
    expect(guardar(html)).toMatch(/\sdisabled=""/);
    const error = cuerpo({ estado: { tipo: "error", texto: "Alguien modificó este gasto…" } });
    expect(error).toContain('data-error-fecha=""');
    expect(guardar(error)).not.toMatch(/\sdisabled=""/);
  });

  it("guardando ⇒ «Guardando…», Cancelar y el campo apagados; Cancelar lleva type=button", () => {
    const html = cuerpo({ pending: true, fecha: "2026-10-11" });
    expect(html).toContain(">Guardando…</button>");
    expect(cancelar(html)).toMatch(/\sdisabled=""/);
    expect(cancelar(html)).toContain('type="button"');
    expect(cancelar(cuerpo())).toContain('type="button"');
    expect(html.match(/<input[^>]*type="date"[^>]*>/)?.[0]).toMatch(/\sdisabled=""/);
    expect(botones(html).every((b) => b.includes("cursor-pointer"))).toBe(true);
  });
});

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("cableado del renglón en «Vincular gasto»", () => {
  const src = leer("../vincular-gasto-dialog.tsx");

  it("el botón «Fecha» va DESPUÉS del </label>, nunca dentro", () => {
    const iLabel = src.indexOf("title={bloqueo ?? undefined}");
    const iCierre = src.indexOf("</label>", iLabel);
    expect(iLabel).toBeGreaterThan(-1);
    expect(iCierre).toBeGreaterThan(iLabel);
    expect(src.slice(iLabel, iCierre)).not.toContain("<button");
    const despues = src.slice(iCierre, src.indexOf("data-nudge-fecha", iCierre));
    expect(despues).toMatch(
      /\{puedeFecha && \(\s*<button\s+type="button"\s+data-fecha-pago=""\s+aria-haspopup="dialog"\s+aria-label=\{etiquetaBotonFecha\(c\)\}\s+title=\{etiquetaBotonFecha\(c\)\}\s+onClick=\{\(\) => setEditandoFecha\(c\)\}\s+disabled=\{pending\}\s+className="[^"]*cursor-pointer[^"]*"/,
    );
    expect(src).toContain("const puedeFecha = puedeCorregirFechaDeCandidato(c);");
    expect(src).toContain('<CalendarDaysIcon className="h-4 w-4" aria-hidden />');
    // «Fecha» se ve también en el teléfono (revisión del 14-oct-2026): la
    // ayuda y el aviso dicen «corrígela con «Fecha»».
    expect(src).toMatch(/<CalendarDaysIcon className="h-4 w-4" aria-hidden \/>[\s\S]{0,200}<span>\{BOTON_FECHA_FILA\}<\/span>/);
    expect(src).not.toContain("hidden sm:inline\">{BOTON_FECHA_FILA}");
  });

  it("el renglón conserva lo que fijan las demás pruebas (casilla, veto, tooltip)", () => {
    expect(src).toContain('<div key={c.id} data-candidato-gasto="">');
    expect(src).toContain('"flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-sm"');
    expect(src).toContain('"cursor-not-allowed opacity-60"');
    expect(src).toContain('"cursor-pointer hover:bg-muted/50"');
    expect(src).toContain("disabled={bloqueo != null}");
  });

  it("la lista se corrige con el mapa (sin volver a pedirla) y la etiqueta del error también", () => {
    expect(src).toMatch(
      /const filas = useMemo\(\s*\(\) =>\s*conFechasCorregidas\(\s*listaConMarcadosPrimero\(conSugeridoAlFrente\(resultados, sugerido\), marcados\),\s*fechasCorregidas,\s*\),\s*\[resultados, sugerido, marcados, fechasCorregidas\],\s*\);/,
    );
    expect(src).toContain("fichaCandidatoGasto(conFechaCorregida(f, fechasCorregidas))");
    // El mapa anota la fecha vigente Y la que reemplaza (cede ante una lectura nueva).
    expect(src).toContain("useState<FechasCorregidas>({})");
    expect(src).toMatch(
      /const ponerFecha = useCallback\(\(id: string, fecha: string, vista\?: string \| null\) => \{\s*setFechasCorregidas\(\(prev\) => registrarFechaCorregida\(prev, id, fecha, vista\)\);/,
    );
    expect(src).toContain("ponerFecha(r.id, r.fecha_gasto, r.fecha_anterior);");
    // Un 404 (o el gasto conciliado mientras tanto) vuelve a pedir la lista.
    expect(src).toMatch(/const gastoYaNoExiste = [\s\S]{0,200}setMarcados\(\(prev\) => prev\.filter\(\(m\) => m\.id !== id\)\);\s*toast\.error\(texto\);\s*setRecarga\(\(n\) => n \+ 1\);/);
    // Sin saber si se guardó: también.
    expect(src).toMatch(/const recargarTrasIncierto = \(\) => \{\s*setRecarga\(\(n\) => n \+ 1\);/);
  });

  it("«Deshacer» manda confirmar: true por la MISMA action y nunca lanza", () => {
    expect(src).toMatch(
      /const deshacerFecha = \(r: CambioFechaGasto\) => \{\s*void corregirFechaGastoAction\(r\.id, \{ fecha: r\.fecha_anterior, fechaAnterior: r\.fecha_gasto, confirmar: true \}\)\s*\.catch\(sinConexion\)/,
    );
    expect(src).toContain("toast.error(TITULO_NO_SE_DESHIZO, { description: mensajeErrorFechaGasto(res) });");
    expect(src).toMatch(/action: r\.cambio \? \{ label: BOTON_DESHACER_FECHA, onClick: \(\) => deshacerFecha\(r\) \} : undefined/);
    expect(src.match(/corregirFechaGastoAction\(/g)?.length).toBe(1);
    expect(src).not.toContain("verifyGastoAction");
  });

  it("«Deshacer» lee la respuesta como el diálogo: incierto, fecha vigente y gasto que salió de la lista", () => {
    const i = src.indexOf("const deshacerFecha = ");
    const fin = src.indexOf("const trasCorregirFecha = ", i);
    const deshacer = src.slice(i, fin);
    expect(deshacer).toContain("const d = resultadoCorregirFecha(res);");
    expect(deshacer).toMatch(
      /if \(d\.tipo === "incierto"\) \{[\s\S]{0,200}toast\.error\(TITULO_DESHACER_INCIERTO, \{ description: MSG_DESHACER_INCIERTO \}\);\s*ponerAlDia\(true\);/,
    );
    expect(deshacer).toContain('if (d.tipo === "fecha_vigente") ponerFecha(r.id, d.fecha, r.fecha_gasto);');
    expect(deshacer).toMatch(/if \(d\.tipo === "no_existe"\) \{\s*setMarcados\(\(prev\) => prev\.filter\(\(m\) => m\.id !== r\.id\)\);\s*ponerAlDia\(true\);/);
  });

  it("la página NO se repinta con el diálogo abierto: UN router.refresh() al cerrar (o al instante si ya se cerró)", () => {
    // Al desmontar, si algo cambió.
    expect(src).toMatch(
      /return \(\) => \{\s*montadoRef\.current = false;\s*if \(refrescarAlCerrarRef\.current\) \{\s*refrescarAlCerrarRef\.current = false;\s*routerRef\.current\.refresh\(\);/,
    );
    // Guardar una fecha (con cambio) lo anota; «Deshacer» ya cerrado refresca de una vez.
    expect(src).toContain("if (r.cambio) refrescarAlCerrarRef.current = true;");
    expect(src).toMatch(/const ponerAlDia = \(recargarLista = false\) => \{\s*if \(!montadoRef\.current\) \{\s*router\.refresh\(\);\s*return;\s*\}\s*refrescarAlCerrarRef\.current = true;/);
    // Y la action ya no revalida (en Next 16 repintaba la página abierta).
    const acciones = leer("../../../../app/admin/conciliacion/actions.ts");
    const i = acciones.indexOf("export async function corregirFechaGastoAction(");
    const cuerpoAction = acciones.slice(i, acciones.indexOf("\nexport ", i + 1));
    expect(i).toBeGreaterThan(-1);
    expect(cuerpoAction).not.toContain("revalidatePath(");
  });

  it("el chunk del diálogo anidado se PRECARGA al abrir «Vincular gasto» (el mismo módulo que dynamic)", () => {
    expect(src).toContain(
      'const precargarCorregirFecha = () => import("@/components/admin/conciliacion/corregir-fecha-gasto-dialog");',
    );
    expect(src).toMatch(/montadoRef\.current = true;[\s\S]{0,200}void precargarCorregirFecha\(\)\.catch\(\(\) => undefined\);/);
  });

  it("el diálogo anidado: dynamic sin SSR, montado SOLO al abrirse y dentro del árbol de la lista", () => {
    expect(src).toMatch(
      /const CorregirFechaGastoDialog = dynamic\(\s*\(\) =>\s*import\("@\/components\/admin\/conciliacion\/corregir-fecha-gasto-dialog"\)\.then\(\s*\(m\) => m\.CorregirFechaGastoDialog,\s*\),\s*\{ ssr: false \},\s*\);/,
    );
    const iMontaje = src.indexOf("<CorregirFechaGastoDialog");
    expect(iMontaje).toBeGreaterThan(src.indexOf('estado.tipo === "lista" && filas.some(puedeCorregirFechaDeCandidato)'));
    expect(iMontaje).toBeLessThan(src.indexOf("function PasoCrearGasto("));
    expect(src).toMatch(
      /\{editandoFecha && \(\s*<CorregirFechaGastoDialog\s+key=\{editandoFecha\.id\}\s+candidato=\{editandoFecha\}\s+movimiento=\{movimiento\}\s+monedaCuenta=\{monedaCuenta\}\s+dias=\{dias\}\s+onCerrar=\{\(\) => setEditandoFecha\(null\)\}\s+onCorregida=\{trasCorregirFecha\}\s+onFechaVigente=\{ponerFecha\}\s+onGastoNoExiste=\{gastoYaNoExiste\}\s+onResultadoIncierto=\{recargarTrasIncierto\}\s*\/>/,
    );
  });

  it("la línea de ayuda y el aviso bajo un marcado", () => {
    expect(src).toMatch(
      /\{estado\.tipo === "lista" && filas\.some\(puedeCorregirFechaDeCandidato\) && \(\s*<p className="text-\[11px\] text-muted-foreground">\{AYUDA_CORREGIR_FECHA\}<\/p>/,
    );
    expect(src).toContain("const nudge = marcado ? nudgeFechaMarcado(c, movimiento.fecha) : null;");
    expect(src).toMatch(/\{nudge && \(\s*<p\s+data-nudge-fecha=""/);
  });
});

describe("cableado del diálogo anidado", () => {
  const src = leer("../corregir-fecha-gasto-dialog.tsx");

  it("la action con .catch(sinConexion) y un formulario noValidate", () => {
    expect(src).toMatch(/await corregirFechaGastoAction\(p\.candidato\.id, \{[\s\S]{0,120}\}\)\.catch\(sinConexion\);/);
    expect(src).toMatch(/<form\s+noValidate/);
    expect(src).toContain("const d = resultadoCorregirFecha(r);");
  });

  it("abre con fechaInicialCorregirFecha, valida con el candado del vuelo y un resultado incierto avisa al padre", () => {
    expect(src).toContain("useState(() => fechaInicialCorregirFecha(p.candidato, fechaCargo))");
    expect(src).toMatch(/if \(pending \|\| bloqueoNuevaFechaGasto\(p\.candidato, fecha, fechaActual, hoy\)/);
    expect(src).toContain("const bloqueoLocal = bloqueoNuevaFechaGasto(candidato, fecha, fechaActual, hoy);");
    expect(src).toMatch(/if \(d\.tipo === "incierto"\) \{\s*[\s\S]{0,200}setEstado\(\{ tipo: "error", texto: d\.texto \}\);\s*p\.onResultadoIncierto\?\.\(p\.candidato\.id\);/);
    // La fecha vigente se anota con la que el renglón pintaba (ya no lo es).
    expect(src).toContain("p.onFechaVigente(p.candidato.id, d.fecha, fechaActual);");
  });

  it("mientras guarda no se cierra (Esc / clic fuera / X)", () => {
    expect(src).toMatch(/onOpenChange=\{\(abierto\) => \{\s*if \(!abierto && !pending\) p\.onCerrar\(\);\s*\}\}/);
  });

  it("todo botón lleva cursor-pointer y type=button, salvo el ÚNICO submit", () => {
    const abiertos = src.match(/<(button|Button)\b[\s\S]*?>/g) ?? [];
    expect(abiertos.length).toBe(3);
    for (const b of abiertos) {
      expect(b).toContain("cursor-pointer");
      expect(b).toMatch(/type="(button|submit)"/);
    }
    expect(abiertos.filter((b) => b.includes('type="submit"')).length).toBe(1);
  });

  it("ningún texto literal en el JSX: todo sale de conciliacion-fecha-gasto.ts", () => {
    expect(src).not.toMatch(/>\s*(Guardar|Cancelar|Corregir|Fecha del pago|Usar la fecha)/);
    expect(src).toContain("{TITULO_CORREGIR_FECHA}");
    expect(src).toContain("{ETIQUETA_FECHA_PAGO}");
    expect(src).toContain("{NOTA_FECHA_SOLO_FECHA}");
  });
});
