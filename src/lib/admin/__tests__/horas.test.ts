import { describe, expect, it } from "vitest";

import {
  HORAS_DECIMALES,
  fmtHorasDecimal,
  fmtHorasMinutos,
  horasATexto,
  horasONull,
  mismasHoras,
  parseHorasPactadas,
  preferirHorasPersistidas,
  round8,
  textoCambioHoras,
} from "@/lib/admin/horas";

/**
 * Cotizaciones #322 y #302 (22-sep-2026): mismos datos, dos totales.
 * La regla que se congela aquí es una sola: lo que se pacta es lo que se
 * multiplica, y lo que se multiplica es lo que se guarda.
 */
const redondeoDinero = (n: number) => Math.round(n * 100) / 100;

describe("el centavo de la #322", () => {
  it("2:20 pactado son 2.33333333 hr y a $600/hr dan $1,400.00", () => {
    const horas = parseHorasPactadas("2:20").valor!;
    expect(horas).toBe(2.33333333);
    expect(redondeoDinero(horas * 600)).toBe(1400);
  });

  it("las mismas horas TRUNCADAS a 4 decimales son el bug ($1,399.98)", () => {
    expect(redondeoDinero(2.3333 * 600)).toBe(1399.98);
  });

  it("tarifas altas no pierden el centavo (3,500 y 9,750 /hr)", () => {
    const horas = parseHorasPactadas("2:20").valor!;
    expect(redondeoDinero(horas * 3500)).toBe(8166.67);
    expect(redondeoDinero(horas * 9750)).toBe(22750);
    // Con 4 decimales el error crece con la tarifa: 21 y 65 centavos.
    expect(redondeoDinero(2.3333 * 3500)).toBe(8166.55);
    expect(redondeoDinero(2.3333 * 9750)).toBe(22749.68);
  });

  it("round8 es idempotente y no arrastra basura binaria", () => {
    expect(round8(2 + 20 / 60)).toBe(2.33333333);
    expect(round8(round8(2 + 20 / 60))).toBe(2.33333333);
    expect(HORAS_DECIMALES).toBe(8);
  });
});

describe("parseHorasPactadas", () => {
  it("vacío = sin pactar (el motor vuelve a la regla)", () => {
    for (const t of ["", "   ", null, undefined]) {
      const r = parseHorasPactadas(t);
      expect(r.valido).toBe(true);
      expect(r.valor).toBeNull();
    }
  });

  it("decimales con punto o con coma", () => {
    expect(parseHorasPactadas("2.3333").valor).toBe(2.3333);
    expect(parseHorasPactadas("2,5").valor).toBe(2.5);
    expect(parseHorasPactadas("3").valor).toBe(3);
    expect(parseHorasPactadas("2.333333333").valor).toBe(2.33333333);
  });

  it("horas:minutos", () => {
    expect(parseHorasPactadas("2:20").valor).toBe(2.33333333);
    expect(parseHorasPactadas("2:30").valor).toBe(2.5);
    expect(parseHorasPactadas("0:45").valor).toBe(0.75);
    expect(parseHorasPactadas("10:05").valor).toBe(10.08333333);
  });

  it("los minutos son LITERALES: «2:5» son 2 h 5 min, nunca 2:50", () => {
    expect(parseHorasPactadas("2:5").valor).toBe(round8(2 + 5 / 60));
    expect(fmtHorasMinutos(parseHorasPactadas("2:5").valor)).toBe("2 h 5 min");
    expect(parseHorasPactadas("2:50").valor).toBe(round8(2 + 50 / 60));
    // Y se VE antes de guardar: el texto canónico del campo no miente.
    expect(horasATexto(parseHorasPactadas("2:5").valor)).toBe("2:05");
  });

  it("«:30» suelto NO se adivina: error que enseña los formatos", () => {
    const r = parseHorasPactadas(":30");
    expect(r.valor).toBeNull();
    expect(r.valido).toBe(false);
    expect(r.parcial).toBe(false);
    expect(r.error).toMatch(/horas decimales/);
    // Quien quiera media hora tiene dos caminos que SÍ se entienden.
    expect(parseHorasPactadas("0:30").valor).toBe(0.5);
    expect(parseHorasPactadas("30 min").valor).toBe(0.5);
  });

  it("también «2 h 20 min» y «45 min» (lo que dice la ayuda)", () => {
    expect(parseHorasPactadas("2 h 20 min").valor).toBe(2.33333333);
    expect(parseHorasPactadas("2h20").valor).toBe(2.33333333);
    expect(parseHorasPactadas("3 hrs").valor).toBe(3);
    expect(parseHorasPactadas("45 min").valor).toBe(0.75);
  });

  it("a medio escribir no es un error (no grita mientras teclean)", () => {
    for (const t of ["2:", "2.", "2,"]) {
      const r = parseHorasPactadas(t);
      expect(r.parcial).toBe(true);
      expect(r.error).toBeNull();
      expect(r.valor).toBeNull();
    }
  });

  it("rechaza lo que no se entiende, en es-MX", () => {
    expect(parseHorasPactadas("2:75").error).toMatch(/minutos van de 00 a 59/);
    expect(parseHorasPactadas("-2").error).toMatch(/negativas/);
    expect(parseHorasPactadas("dos horas").error).toMatch(/horas decimales/);
    // Dedo pegado: «220» en vez de «2:20».
    expect(parseHorasPactadas("220").error).toMatch(/máximo son 48 hr/);
    expect(parseHorasPactadas("220", { maximo: 999 }).valor).toBe(220);
  });

  it("cero = sin pactar (no un pacto de 0 hr)", () => {
    expect(parseHorasPactadas("0").valor).toBeNull();
    expect(parseHorasPactadas("0:00").valor).toBeNull();
  });
});

describe("formatos de presentación", () => {
  it("fmtHorasDecimal recorta ceros y respeta el tope de decimales", () => {
    expect(fmtHorasDecimal(2.33333333)).toBe("2.3333");
    expect(fmtHorasDecimal(2.33333333, 8)).toBe("2.33333333");
    expect(fmtHorasDecimal(2.5)).toBe("2.5");
    expect(fmtHorasDecimal(3)).toBe("3");
    expect(fmtHorasDecimal(null)).toBe("");
  });

  it("fmtHorasMinutos habla como el operador", () => {
    expect(fmtHorasMinutos(2.33333333)).toBe("2 h 20 min");
    expect(fmtHorasMinutos(2.5)).toBe("2 h 30 min");
    expect(fmtHorasMinutos(3)).toBe("3 h");
    expect(fmtHorasMinutos(0.75)).toBe("45 min");
    expect(fmtHorasMinutos(null)).toBe("");
  });

  it("fmtHorasMinutos marca «≈» cuando no cae en un minuto exacto", () => {
    expect(fmtHorasMinutos(2.34)).toBe("≈ 2 h 20 min");
  });

  it("horasATexto: decimal corto, h:mm cuando hace falta, nunca 2.33333333 crudo", () => {
    expect(horasATexto(2.3333)).toBe("2.3333");
    expect(horasATexto(2.5)).toBe("2.5");
    expect(horasATexto(3)).toBe("3");
    expect(horasATexto(2.33333333)).toBe("2:20");
    expect(horasATexto(10.08333333)).toBe("10:05");
    expect(horasATexto(null)).toBe("");
    expect(horasATexto(0)).toBe("");
  });

  it("horasATexto ida y vuelta: lo que se pinta se vuelve a leer igual", () => {
    // Incluye los bordes: un valor que no cae en minuto exacto y uno tan
    // pequeño que «0:00» lo borraría (el texto tiene que poder releerse).
    for (const v of [2.3333, 2.5, 3, 2.33333333, 10.08333333, 0.75, 2.34999999, 0.00000001]) {
      expect(parseHorasPactadas(horasATexto(v), { maximo: 999 }).valor).toBe(v);
    }
  });

  it("salir del campo NUNCA mueve el valor (barrido de minutos y fracciones)", () => {
    const casos: number[] = [];
    for (let m = 1; m <= 48 * 60; m += 7) casos.push(round8(m / 60));
    for (let i = 1; i <= 500; i++) casos.push(round8(i / 7));
    for (const v of casos) {
      expect(parseHorasPactadas(horasATexto(v), { maximo: 999 }).valor, `${v}`).toBe(v);
    }
  });
});

describe("horasONull / mismasHoras", () => {
  it("descarta vacío, texto, negativo y cero", () => {
    expect(horasONull("")).toBeNull();
    expect(horasONull("x")).toBeNull();
    expect(horasONull(-1)).toBeNull();
    expect(horasONull(0)).toBeNull();
    expect(horasONull("2.33333333")).toBe(2.33333333);
  });

  it("dos horas iguales a 8 decimales son las MISMAS", () => {
    expect(mismasHoras(2.33333333, 2.333333334)).toBe(true);
    expect(mismasHoras(2.3333, 2.33333333)).toBe(false);
    expect(mismasHoras(null, 0)).toBe(true);
  });
});

describe("preferirHorasPersistidas (rehidratación)", () => {
  it("manda el que conserva más precisión cuando es el MISMO número", () => {
    // Snapshot viejo (4 dec) + columna nueva (8 dec) → la columna.
    expect(preferirHorasPersistidas(2.3333, 2.33333333)).toBe(2.33333333);
    // Snapshot nuevo + columna vieja (API a medio desplegar) → el snapshot.
    expect(preferirHorasPersistidas(2.33333333, 2.3333)).toBe(2.33333333);
  });

  it("si son números DISTINTOS manda el snapshot (es la foto del dinero)", () => {
    expect(preferirHorasPersistidas(2.5, 3)).toBe(2.5);
  });

  it("tolera que falte cualquiera de los dos", () => {
    expect(preferirHorasPersistidas(null, 2.5)).toBe(2.5);
    expect(preferirHorasPersistidas(2.5, null)).toBe(2.5);
    expect(preferirHorasPersistidas(null, null)).toBeNull();
    expect(preferirHorasPersistidas(0, 0)).toBeNull();
  });

  /**
   * PostgREST puede entregar un `numeric` como NÚMERO o como CADENA (según
   * versión y cliente), y `to_jsonb(2.5::numeric(14,8))` conserva los ceros
   * de cola («2.50000000»). Ninguna de las dos formas puede cambiar el
   * rehidratado: ahí es donde el centavo de la #322 se perdía.
   */
  it("da igual que el API mande number o string (y con ceros de cola)", () => {
    expect(preferirHorasPersistidas("2.3333", "2.33333333")).toBe(2.33333333);
    expect(preferirHorasPersistidas("2.33333333", 2.3333)).toBe(2.33333333);
    expect(preferirHorasPersistidas("2.50000000", "2.5000")).toBe(2.5);
    expect(preferirHorasPersistidas(2.5, "2.50000000")).toBe(2.5);
  });
});

/**
 * EL CICLO QUE FALLABA (#322): pactar → multiplicar → persistir → rehidratar
 * (tal cual lo devuelve el API) → volver a multiplicar. El total no se mueve
 * ni un centavo, y el texto del campo tampoco cambia el número al releerse.
 */
describe("ciclo completo pactar → guardar → reabrir", () => {
  const casos: Array<[string, number, number]> = [
    ["2:20", 600, 1400], // el caso del cliente
    ["1:45", 3500, 6125],
    ["0:50", 9750, 8125], // el mínimo de 1 hr NO aplica a un pactado a mano
    ["2:20", 9750, 22750], // con 2.3333 se perdían 32 centavos
    ["2:20", 3500, 8166.67],
  ];
  it.each(casos)("«%s» × $%s/hr ⇒ $%s, ida y vuelta", (texto, tarifa, total) => {
    const horas = parseHorasPactadas(texto).valor!;
    expect(redondeoDinero(horas * tarifa)).toBe(total);
    // Lo que el API devuelve tras guardar: snapshot y columna, en sus dos
    // formas posibles y con la columna vieja aún truncada a 4 decimales.
    for (const columna of [horas, horas.toFixed(8), Number(horas.toFixed(4))]) {
      const rehidratado = preferirHorasPersistidas(horas, columna)!;
      expect(rehidratado).toBe(horas);
      expect(redondeoDinero(rehidratado * tarifa)).toBe(total);
    }
    expect(preferirHorasPersistidas(Number(horas.toFixed(4)), horas.toFixed(8))).toBe(horas);
    // El texto canónico del campo se relee como el MISMO número.
    expect(parseHorasPactadas(horasATexto(horas)).valor).toBe(horas);
  });
});

describe("textoCambioHoras (diff de versiones)", () => {
  it("nunca se lee «2.3333→2.3333»", () => {
    expect(textoCambioHoras(2.3333, 2.33333333)).toEqual(["2.3333", "2.33333333"]);
  });

  it("un cambio normal se cuenta corto", () => {
    expect(textoCambioHoras(2.4, 3)).toEqual(["2.4", "3"]);
    expect(textoCambioHoras(2.3333, 2.5)).toEqual(["2.33", "2.5"]);
  });

  it("vacío se cuenta como «—»", () => {
    expect(textoCambioHoras(null, 2.5)).toEqual(["—", "2.5"]);
  });
});
