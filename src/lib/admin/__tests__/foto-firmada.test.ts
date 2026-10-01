/**
 * Fotos de bucket privado con URL firmada que VENCE (1-oct-2026, «las fotos
 * de las facturas no están cargando»): la oficina deja la pestaña abierta más
 * de lo que dura la firma y Supabase responde 400 InvalidJWT ⇒ imagen rota.
 * Aquí se prueba la lógica PURA que usa `ImagePreview`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BUCKETS_FIRMABLES,
  EDAD_MAXIMA_URL_MS,
  ESPERA_ENTRE_RENOVACIONES_MS,
  crearFotoFirmada,
  crearPedidorDeUrls,
  debeRenovarUrl,
  esBucketFirmable,
  esPathFirmable,
  pathDeUrlFirmada,
  vencimientoDeUrlFirmada,
  type ConfigFoto,
} from "../foto-firmada";

const BASE = "https://bjesduasnzbzywofukbf.supabase.co/storage/v1/object/sign";
const B64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
/** URL firmada como la arma supabase-js (`?token=<JWT>`). */
const firmada = (
  bucket: string,
  path: string,
  payload: Record<string, unknown> = {},
) =>
  `${BASE}/${bucket}/${encodeURI(path)}?token=${B64({ alg: "HS256", typ: "JWT" })}.${B64({
    url: `${bucket}/${path}`,
    ...payload,
  })}.firma`;

const PATH = "02996dd1-417d-4871-b4eb-87c4a9697cac/2026-09/20c7ef4a.jpg";
const T0 = Date.UTC(2026, 9, 1, 14, 0, 0); // 1-oct-2026 09:00 Cancún
const seg = (ms: number) => Math.floor(ms / 1000);

describe("pathDeUrlFirmada", () => {
  it("lee bucket y path de una URL firmada de Supabase", () => {
    expect(pathDeUrlFirmada(firmada("taco-fotos", PATH))).toEqual({
      bucket: "taco-fotos",
      path: PATH,
    });
  });

  it("sin token legible, decodifica el path del pathname", () => {
    expect(
      pathDeUrlFirmada(`${BASE}/gasto-fotos/oficina/1727-abc-mi%20ticket.jpg?token=xyz`),
    ).toEqual({ bucket: "gasto-fotos", path: "oficina/1727-abc-mi ticket.jpg" });
  });

  it("el path del token gana sobre un pathname doblemente codificado", () => {
    const url = firmada("gasto-fotos", "oficina/mi ticket.jpg").replace("%20", "%2520");
    expect(pathDeUrlFirmada(url)).toEqual({
      bucket: "gasto-fotos",
      path: "oficina/mi ticket.jpg",
    });
  });

  it("null si no es una URL firmada", () => {
    expect(pathDeUrlFirmada(null)).toBeNull();
    expect(pathDeUrlFirmada("")).toBeNull();
    expect(pathDeUrlFirmada("no es url")).toBeNull();
    expect(pathDeUrlFirmada("https://x.supabase.co/storage/v1/object/public/a/b.jpg")).toBeNull();
    expect(pathDeUrlFirmada(`${BASE}/solo-bucket`)).toBeNull();
    expect(pathDeUrlFirmada(`${BASE}/gasto-fotos/`)).toBeNull();
  });
});

describe("esPathFirmable (espejo de motivoPathInvalido del API)", () => {
  it("acepta las llaves reales del bucket", () => {
    expect(esPathFirmable(PATH)).toBe(true);
    expect(esPathFirmable("oficina/1727-abc-mi ticket.jpg")).toBe(true);
  });

  it("rechaza lo que el API respondería con 400 PATH_INVALIDO (tumbaría el lote)", () => {
    for (const malo of [
      "",
      "https://x.supabase.co/storage/v1/object/public/gasto-fotos/a.jpg",
      "/u/a.jpg",
      "u/../csd/llave.key",
      "./a.jpg",
      "u\\a.jpg",
      "u/a\u0000.jpg",
      "x".repeat(1025),
    ]) {
      expect(esPathFirmable(malo), malo.slice(0, 40)).toBe(false);
    }
    expect(esPathFirmable(null)).toBe(false);
    expect(esPathFirmable(undefined)).toBe(false);
  });
});

describe("vencimiento y renovación", () => {
  it("lee el exp del token en milisegundos", () => {
    const url = firmada("gasto-fotos", PATH, { iat: seg(T0), exp: seg(T0) + 3600 });
    expect(vencimientoDeUrlFirmada(url)).toBe(T0 + 3600 * 1000);
    expect(vencimientoDeUrlFirmada(`${BASE}/gasto-fotos/a.jpg?token=basura`)).toBeNull();
    expect(vencimientoDeUrlFirmada(`${BASE}/gasto-fotos/a.jpg`)).toBeNull();
  });

  it("con exp: renueva si le quedan menos de 10 min", () => {
    const url = firmada("gasto-fotos", PATH, { exp: seg(T0) + 3600 });
    expect(debeRenovarUrl({ url, nacioEn: T0, ahora: T0 + 49 * 60_000 })).toBe(false);
    expect(debeRenovarUrl({ url, nacioEn: T0, ahora: T0 + 51 * 60_000 })).toBe(true);
    // Una firma de 8 h no se renueva a la hora (no importa cuándo «nació»).
    const larga = firmada("gasto-fotos", PATH, { exp: seg(T0) + 8 * 3600 });
    expect(debeRenovarUrl({ url: larga, nacioEn: T0 - 5 * 3600_000, ahora: T0 + 3600_000 })).toBe(
      false,
    );
  });

  it("sin exp: renueva si la URL tiene más de 50 min", () => {
    const url = "https://ejemplo.mx/foto.jpg";
    expect(debeRenovarUrl({ url, nacioEn: T0, ahora: T0 + EDAD_MAXIMA_URL_MS })).toBe(false);
    expect(debeRenovarUrl({ url, nacioEn: T0, ahora: T0 + EDAD_MAXIMA_URL_MS + 1 })).toBe(true);
  });

  it("lista blanca de buckets (espejo del API)", () => {
    expect(BUCKETS_FIRMABLES).toContain("gasto-fotos");
    expect(BUCKETS_FIRMABLES).toContain("taco-fotos");
    expect(BUCKETS_FIRMABLES).toContain("cobro-vouchers");
    expect(esBucketFirmable("gasto-fotos")).toBe(true);
    expect(esBucketFirmable("avatars")).toBe(false);
    expect(esBucketFirmable(undefined)).toBe(false);
  });
});

describe("crearFotoFirmada", () => {
  const A = "https://s/a.jpg?token=a";
  const B = "https://s/b.jpg?token=b";
  const C = "https://s/c.jpg?token=c";
  const conPath: ConfigFoto = { src: A, bucket: "gasto-fotos", path: PATH, firmadaEn: T0 };

  function armar(config: ConfigFoto, respuestas: Array<string | null | Error>, ahora = T0) {
    const pedirUrl = vi.fn(async () => {
      const r = respuestas.shift() ?? null;
      if (r instanceof Error) throw r;
      return r;
    });
    const reloj = { t: ahora };
    const foto = crearFotoFirmada(config, { pedirUrl, ahora: () => reloj.t });
    return { foto, pedirUrl, reloj };
  }

  it("onError ⇒ pide otra firma y reintenta UNA vez con la URL nueva", async () => {
    const { foto, pedirUrl } = armar(conPath, [B]);
    expect(foto.estado()).toMatchObject({ url: A, fase: "lista", rota: false });
    const intentoAntes = foto.estado().intento;
    await foto.alFallar(A);
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(pedirUrl).toHaveBeenCalledWith("gasto-fotos", PATH);
    expect(foto.estado()).toMatchObject({ url: B, fase: "lista", rota: false });
    // El <img> se remonta con la URL nueva.
    expect(foto.estado().intento).toBeGreaterThan(intentoAntes);
  });

  it("segundo fallo ⇒ placeholder, sin más llamadas", async () => {
    const { foto, pedirUrl } = armar(conPath, [B, C]);
    await foto.alFallar(A);
    await foto.alFallar(B);
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(foto.estado()).toMatchObject({ fase: "fallo", rota: true });
  });

  it("una carga exitosa devuelve el reintento (la URL nueva también vence horas después)", async () => {
    const { foto, pedirUrl, reloj } = armar(conPath, [B, C]);
    await foto.alFallar(A);
    foto.alCargar(B);
    reloj.t = T0 + 8 * 3600_000; // B sirvió y venció 8 h después
    await foto.alFallar(B);
    expect(pedirUrl).toHaveBeenCalledTimes(2);
    expect(foto.estado()).toMatchObject({ url: C, fase: "lista" });
  });

  it("miniatura que CARGA + visor que FALLA con la misma URL: sin ping-pong de firmas", async () => {
    // Antes del freno: cada «cargó» devolvía el reintento y cada fallo del
    // visor pedía otra firma — 6 fallos = 6 llamadas, sin fin.
    const nuevas = Array.from({ length: 10 }, (_, i) => `https://s/n${i}.jpg?token=${i}`);
    const { foto, pedirUrl, reloj } = armar(conPath, [...nuevas]);
    await foto.alFallar(A);
    for (let i = 0; i < 5; i++) {
      const u = foto.estado().url as string;
      foto.alCargar(u); // la miniatura cargó…
      reloj.t += 30_000;
      await foto.alFallar(u); // …y el visor falló con la MISMA URL
    }
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(foto.estado()).toMatchObject({ fase: "fallo", rota: true });
  });

  it("el freno vale entre renovaciones AUTOMÁTICAS; «Reintentar» (clic) siempre pide", async () => {
    const { foto, pedirUrl, reloj } = armar(conPath, [B, C]);
    await foto.alFallar(A);
    foto.alCargar(B);
    reloj.t = T0 + ESPERA_ENTRE_RENOVACIONES_MS - 1;
    await foto.alFallar(B);
    expect(foto.estado().fase).toBe("fallo");
    await foto.reintentar();
    expect(pedirUrl).toHaveBeenCalledTimes(2);
    expect(foto.estado()).toMatchObject({ url: C, fase: "lista" });
  });

  it("props nuevas reinician el freno", async () => {
    const { foto, pedirUrl } = armar(conPath, [B, C]);
    await foto.alFallar(A);
    foto.configurar({ ...conPath, src: "https://s/d.jpg?token=d" });
    await foto.alFallar("https://s/d.jpg?token=d");
    expect(pedirUrl).toHaveBeenCalledTimes(2);
    expect(foto.estado()).toMatchObject({ url: C, fase: "lista" });
  });

  it("el API viejo (404 ⇒ sin URL) o un error de red dejan el placeholder con gracia", async () => {
    const sinUrl = armar(conPath, [null]);
    await sinUrl.foto.alFallar(A);
    expect(sinUrl.foto.estado()).toMatchObject({ fase: "fallo", rota: true });

    const conError = armar(conPath, [new Error("red")]);
    await conError.foto.alFallar(A);
    expect(conError.foto.estado()).toMatchObject({ fase: "fallo" });
  });

  it("sin bucket/path ⇒ placeholder SIN llamadas", async () => {
    const { foto, pedirUrl } = armar({ src: A }, [B]);
    await foto.alFallar(A);
    expect(pedirUrl).not.toHaveBeenCalled();
    expect(foto.estado()).toMatchObject({ fase: "fallo" });
    expect(await foto.vigente()).toBeNull();
    expect(pedirUrl).not.toHaveBeenCalled();
  });

  it("sin src ⇒ placeholder desde el inicio", () => {
    const { foto } = armar({ src: "", bucket: "gasto-fotos", path: PATH }, []);
    expect(foto.estado()).toMatchObject({ url: null, fase: "fallo" });
  });

  it("miniatura y visor que fallan juntos piden UNA sola firma", async () => {
    const { foto, pedirUrl } = armar(conPath, [B]);
    await Promise.all([foto.alFallar(A), foto.alFallar(A)]);
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(foto.estado()).toMatchObject({ url: B, fase: "lista" });
  });

  it("un error tardío de una URL ya reemplazada no cuenta", async () => {
    const { foto, pedirUrl } = armar(conPath, [B]);
    await foto.alFallar(A);
    await foto.alFallar(A); // llegó tarde: ya se pinta B
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(foto.estado()).toMatchObject({ url: B, fase: "lista" });
  });

  it("apertura con URL vieja ⇒ renueva ANTES de usarla", async () => {
    const { foto, pedirUrl, reloj } = armar(conPath, [B]);
    reloj.t = T0 + 51 * 60_000;
    expect(await foto.vigente()).toBe(B);
    expect(pedirUrl).toHaveBeenCalledTimes(1);
    expect(foto.estado()).toMatchObject({ url: B, fase: "lista" });
  });

  it("apertura con URL fresca ⇒ la usa tal cual, sin llamadas", async () => {
    const { foto, pedirUrl, reloj } = armar(conPath, [B]);
    reloj.t = T0 + 10 * 60_000;
    expect(await foto.vigente()).toBe(A);
    expect(pedirUrl).not.toHaveBeenCalled();
  });

  it("sin firmadaEn, la edad cuenta desde el montaje", async () => {
    const { foto, pedirUrl, reloj } = armar({ ...conPath, firmadaEn: null }, [B], T0);
    reloj.t = T0 + 49 * 60_000;
    expect(await foto.vigente()).toBe(A);
    reloj.t = T0 + 51 * 60_000;
    expect(await foto.vigente()).toBe(B);
    expect(pedirUrl).toHaveBeenCalledTimes(1);
  });

  it("el vencimiento del token manda sobre firmadaEn", async () => {
    const porVencer = firmada("gasto-fotos", PATH, { exp: seg(T0) + 5 * 60 });
    const vieja = armar({ ...conPath, src: porVencer, firmadaEn: T0 }, [B]);
    expect(await vieja.foto.vigente()).toBe(B);

    const larga = firmada("gasto-fotos", PATH, { exp: seg(T0) + 8 * 3600 });
    const fresca = armar({ ...conPath, src: larga, firmadaEn: T0 - 3 * 3600_000 }, [B]);
    expect(await fresca.foto.vigente()).toBe(larga);
    expect(fresca.pedirUrl).not.toHaveBeenCalled();
  });

  it("si la renovación PROACTIVA falla, se queda la URL que había", async () => {
    const { foto, reloj } = armar(conPath, [null]);
    reloj.t = T0 + 2 * 3600_000;
    expect(await foto.vigente()).toBe(A);
    expect(foto.estado()).toMatchObject({ url: A, fase: "lista", rota: false });
  });

  it("«Reintentar» tras el placeholder pide otra firma (y vuelve al placeholder si falla)", async () => {
    const { foto, pedirUrl } = armar(conPath, [null, null, B]);
    await foto.alFallar(A);
    expect(foto.estado().fase).toBe("fallo");
    await foto.reintentar();
    expect(foto.estado().fase).toBe("fallo");
    await foto.reintentar();
    expect(foto.estado()).toMatchObject({ url: B, fase: "lista", rota: false });
    expect(pedirUrl).toHaveBeenCalledTimes(3);
  });

  it("«Reintentar» sin bucket/path vuelve a intentar la MISMA URL, sin llamadas", async () => {
    const { foto, pedirUrl } = armar({ src: A }, []);
    await foto.alFallar(A);
    const intento = foto.estado().intento;
    await foto.reintentar();
    expect(pedirUrl).not.toHaveBeenCalled();
    expect(foto.estado()).toMatchObject({ url: A, fase: "lista", rota: false });
    expect(foto.estado().intento).toBeGreaterThan(intento);
  });

  it("props nuevas (router.refresh volvió a firmar) reinician y descartan la firma en vuelo", async () => {
    let soltar: (u: string | null) => void = () => {};
    const pedirUrl = vi.fn(
      () => new Promise<string | null>((r) => {
        soltar = r;
      }),
    );
    const foto = crearFotoFirmada(conPath, { pedirUrl, ahora: () => T0 });
    const avisos = vi.fn();
    foto.suscribir(avisos);
    const fallo = foto.alFallar(A);
    expect(foto.estado().fase).toBe("renovando");
    foto.configurar({ ...conPath, src: C });
    expect(foto.estado()).toMatchObject({ url: C, fase: "lista", rota: false });
    soltar(B);
    await fallo;
    expect(foto.estado().url).toBe(C);
    expect(avisos).toHaveBeenCalled();
    // Mismas props: no reinicia.
    const antes = foto.estado();
    foto.configurar({ ...conPath, src: C });
    expect(foto.estado()).toBe(antes);
  });
});

describe("crearPedidorDeUrls (lote)", () => {
  function armar(respuesta: (b: string, p: string[]) => Promise<Record<string, string> | null>, tope?: number) {
    const tareas: Array<() => void> = [];
    const firmar = vi.fn(respuesta);
    const pedir = crearPedidorDeUrls(firmar, {
      tope,
      programar: (fn) => {
        tareas.push(fn);
      },
    });
    const correr = () => tareas.splice(0).forEach((t) => t());
    return { pedir, firmar, correr };
  }

  it("junta en UN lote por bucket, sin repetir paths", async () => {
    const { pedir, firmar, correr } = armar(async (b, ps) =>
      Object.fromEntries(ps.map((p) => [p, `https://s/${b}/${p}?token=n`])),
    );
    const promesas = [
      pedir("gasto-fotos", "a.jpg"),
      pedir("gasto-fotos", "b.jpg"),
      pedir("gasto-fotos", "a.jpg"),
      pedir("taco-fotos", "t.jpg"),
    ];
    correr();
    const urls = await Promise.all(promesas);
    expect(firmar).toHaveBeenCalledTimes(2);
    expect(firmar).toHaveBeenCalledWith("gasto-fotos", ["a.jpg", "b.jpg"]);
    expect(firmar).toHaveBeenCalledWith("taco-fotos", ["t.jpg"]);
    expect(urls).toEqual([
      "https://s/gasto-fotos/a.jpg?token=n",
      "https://s/gasto-fotos/b.jpg?token=n",
      "https://s/gasto-fotos/a.jpg?token=n",
      "https://s/taco-fotos/t.jpg?token=n",
    ]);
  });

  it("parte el lote en trozos del tope del API", async () => {
    const { pedir, firmar, correr } = armar(async (_b, ps) =>
      Object.fromEntries(ps.map((p) => [p, `u-${p}`])),
    2);
    const promesas = ["1", "2", "3", "4", "5"].map((p) => pedir("gasto-fotos", p));
    correr();
    expect(await Promise.all(promesas)).toEqual(["u-1", "u-2", "u-3", "u-4", "u-5"]);
    expect(firmar.mock.calls.map((c) => c[1])).toEqual([["1", "2"], ["3", "4"], ["5"]]);
  });

  it("nunca rechaza: lote fallido o path ausente ⇒ null", async () => {
    const fallido = armar(async () => {
      throw new Error("404");
    });
    const p1 = fallido.pedir("gasto-fotos", "a.jpg");
    fallido.correr();
    expect(await p1).toBeNull();

    const parcial = armar(async () => ({ "a.jpg": "u-a" }));
    const pa = parcial.pedir("gasto-fotos", "a.jpg");
    const pb = parcial.pedir("gasto-fotos", "b.jpg");
    parcial.correr();
    expect(await pa).toBe("u-a");
    expect(await pb).toBeNull();
  });

  it("después de vaciar, el siguiente pedido arma un lote nuevo", async () => {
    const { pedir, firmar, correr } = armar(async (_b, ps) =>
      Object.fromEntries(ps.map((p) => [p, `u-${p}`])),
    );
    const p1 = pedir("gasto-fotos", "a.jpg");
    correr();
    await p1;
    const p2 = pedir("gasto-fotos", "a.jpg");
    correr();
    expect(await p2).toBe("u-a.jpg");
    expect(firmar).toHaveBeenCalledTimes(2);
  });
});
