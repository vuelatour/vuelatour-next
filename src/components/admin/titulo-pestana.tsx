"use client";

import { useLayoutEffect } from "react";
import { tituloConPlantilla } from "@/lib/admin/titulos-pestana";
import {
  crearControlTituloPestana,
  type ControlTituloPestana,
} from "@/lib/admin/titulo-pestana-dom";

let control: ControlTituloPestana | null = null;

function controlDelDocumento(): ControlTituloPestana {
  control ??= crearControlTituloPestana(document, (alCambiar) => new MutationObserver(() => alCambiar()));
  return control;
}

/**
 * Título de la pestaña del navegador con los DATOS de la pantalla
 * («Vuelo #315 · Beh Kay»), 14-oct-2026. Lo pinta la PÁGINA (server) con el
 * texto ya armado por `lib/admin/titulos-pestana.ts` y con lo que ella YA
 * cargó: `<TituloPestana titulo={tituloVuelo(snapshot.folio, client?.nombre)} />`.
 * No pinta nada. Mientras no hidrata, la pestaña dice el genérico de su
 * `metadata` («Vuelo · Vuelatour»).
 *
 * Por qué no `generateMetadata` con el API y por qué se vigila el <head>:
 * `lib/admin/titulo-pestana-dom.ts`. `useLayoutEffect` y no `useEffect`: el
 * título se pone antes del primer pintado y la limpieza corre DENTRO del
 * commit que desmonta la pantalla; con `useEffect` el vigilante alcanzaba a
 * reponer el título viejo sobre el de la pantalla nueva.
 */
export function TituloPestana({ titulo }: { titulo: string }) {
  useLayoutEffect(() => controlDelDocumento().fijar(tituloConPlantilla(titulo)), [titulo]);
  return null;
}
