import type {
  CapturaCompacta,
  CapturaLinea,
  OrigenConDistintivo,
} from "@/lib/admin/gastos-captura";

/**
 * Segunda línea bajo la fecha del consumo en TODAS las tablas de gastos:
 * "Capturado 5 sep 14:32 · Luis · app" (hora Cancún). El viewmodel sale de
 * la FUENTE ÚNICA `lineaCaptura()` (@/lib/admin/gastos-captura); aquí solo
 * se pinta: gris cuando todo cuadra, ámbar cuando el ticket trae otro año o
 * una fecha muy lejana de la captura (pista 28-ago).
 */
export function CapturadoLinea({ linea }: { linea: CapturaLinea | null }) {
  if (!linea) return null;
  return (
    <span
      className={
        // max-w + whitespace-normal: la celda Fecha va en nowrap; sin esto un
        // nombre largo ensancha la columna. La línea envuelve a 2 renglones.
        "block max-w-[15rem] whitespace-normal text-[10px] font-normal leading-tight " +
        (linea.ambar
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground")
      }
      title={linea.title}
    >
      {linea.texto}
    </span>
  );
}

/**
 * Color del DISTINTIVO de origen (pedido del cliente, 9-jul-2026): los de la
 * insignia de la vieja columna «Capturó» (sky / violet / teal), con su tono
 * claro en tema oscuro. Va en la palabra de origen, sin fondo ni relleno:
 * así no le quita espacio al nombre.
 */
const CLASE_DISTINTIVO: Record<OrigenConDistintivo, string> = {
  OFICINA: "text-sky-600 dark:text-sky-400",
  SISTEMA: "text-violet-600 dark:text-violet-400",
  VISITANTE: "text-teal-600 dark:text-teal-400",
};

/**
 * Variante COMPACTA para la celda «Fecha» de Gastos (14-oct-2026, una sola
 * tabla; las otras 4 tablas siguen con `CapturadoLinea`). Dos sublíneas de
 * 10 px que nunca ensanchan la columna (8rem): «Capturado 14 oct 10:33»
 * (ámbar, con «⚠ año 2025 · » delante, cuando `lineaCaptura` lo marca) y
 * «Mary Cruz · panel» — el NOMBRE se trunca y el origen se conserva. El origen
 * de oficina, sistema o visitante lleva el COLOR de su distintivo (el que
 * pidió el cliente el 9-jul) con su etiqueta en el `title` y para el lector
 * de pantalla; piloto y mecánico dicen «app» en gris. `title` de las dos
 * líneas = el detalle completo de `lineaCaptura`.
 */
export function CapturadoCompacto({ captura }: { captura: CapturaCompacta | null }) {
  if (!captura) return null;
  const d = captura.distintivo;
  const origen = captura.origen ? (
    d ? (
      <span
        data-distintivo={d.codigo}
        className={"shrink-0 font-medium " + CLASE_DISTINTIVO[d.codigo]}
        title={d.titulo}
      >
        {captura.origen}
        <span className="sr-only"> ({d.etiqueta})</span>
      </span>
    ) : (
      <span className="shrink-0">{captura.origen}</span>
    )
  ) : null;
  return (
    <>
      <span
        className={
          "block max-w-[7rem] truncate text-[10px] font-normal leading-tight " +
          (captura.ambar ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")
        }
        title={captura.title}
      >
        {captura.cuando}
      </span>
      {(captura.nombre || origen) && (
        <span
          className="flex max-w-[7rem] items-center text-[10px] font-normal leading-tight text-muted-foreground"
          title={captura.title}
        >
          {captura.nombre && <span className="min-w-0 truncate">{captura.nombre}</span>}
          {captura.nombre && origen && <span className="shrink-0">{"\u00a0·\u00a0"}</span>}
          {origen}
        </span>
      )}
    </>
  );
}
