import { describe, expect, it } from "vitest";
import { debeRefrescarAlEnfocar, MIN_ENTRE_REFRESCOS_MS } from "../refresh-on-focus";

describe("debeRefrescarAlEnfocar", () => {
  it("la primera vez refresca", () => {
    expect(debeRefrescarAlEnfocar(null, 1_000)).toBe(true);
  });
  it("dos focos seguidos no disparan dos refrescos", () => {
    expect(debeRefrescarAlEnfocar(1_000, 1_000 + MIN_ENTRE_REFRESCOS_MS - 1)).toBe(false);
  });
  it("pasado el mínimo vuelve a refrescar", () => {
    expect(debeRefrescarAlEnfocar(1_000, 1_000 + MIN_ENTRE_REFRESCOS_MS)).toBe(true);
  });
});
