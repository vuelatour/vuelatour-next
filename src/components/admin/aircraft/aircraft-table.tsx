"use client";

import Link from "next/link";
import { ChevronRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { CLASE_TONO_SERVICIO } from "@/lib/admin/proximo-servicio";
import {
  CLASE_TONO_RESTANTE,
  GUION,
  estadoOrdenDeServicio,
  etiquetaTipoServicio,
  nombreEtapaSiguiente,
  textoRestante,
  textoSiguienteServicio,
  textoUltimoServicio,
  tituloSinServicio,
  tonoRestante,
} from "@/lib/admin/servicio-flota";
import type { Aircraft } from "@/types/aircraft";

/**
 * Lista de la flota. El 22-sep-2026 el cliente tachó en la foto de esta
 * pantalla **Pax**, **USD/hr público** y **USD/hr broker** y pidió «sustituir
 * estas columnas por las columnas de tacómetro último servicio, tacómetro
 * siguiente servicio, tiempo restante para servicio y siguiente tipo de
 * servicio (50, 100 hrs, etc.) para tratar de igualar la tabla que usamos hoy
 * en día» — el pizarrón «Tacómetros» de la oficina. Las tres columnas
 * quitadas siguen en el expediente del avión (ficha comercial), y la cabecera
 * de la página conserva el aviso «N sin tarifa configurada».
 *
 * «Último taco» se queda: es el «Tact. Actual» del pizarrón. Los textos y los
 * colores de las cuatro nuevas los decide `lib/admin/servicio-flota.ts`
 * (fuente única, con los números del API) — aquí no se calcula nada.
 */

/** Guion de una celda sin dato: explica el porqué cuando el API lo sabe. */
function CeldaVacia({ titulo }: { titulo?: string }) {
  return (
    <span className="text-xs font-sans text-muted-foreground" title={titulo}>
      {GUION}
    </span>
  );
}

/** Sublínea tenue bajo la lectura (etapa + fecha, estado de la orden…). */
function Sublinea({
  texto,
  clase,
  titulo,
}: {
  texto: string;
  clase?: string;
  titulo?: string;
}) {
  return (
    <span
      className={`block text-[11px] font-sans ${clase || "text-muted-foreground"}`}
      title={titulo}
    >
      {texto}
    </span>
  );
}

const columns: Array<DataTableColumn<Aircraft>> = [
  {
    key: "aeronave",
    header: "Aeronave",
    cell: (a) => (
      <div className="flex items-center gap-3">
        {a.imagen_principal_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imagen_principal_url}
            alt={a.matricula}
            className="h-10 w-14 shrink-0 rounded-md object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <PaperAirplaneIcon className="h-4 w-4" />
          </div>
        )}
        <span>
          <span className="flex items-center gap-2 font-mono font-semibold group-hover:text-brand-600 transition-colors">
            {/* Color del avión en el calendario (pedido 21-ago): un punto
                discreto, el mismo que pinta sus vuelos y el Libro Dinero. */}
            {a.color_calendario && (
              <span
                aria-hidden
                title={`Color en el calendario: ${a.color_calendario}`}
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: a.color_calendario }}
              />
            )}
            {a.matricula}
          </span>
          <span className="block text-xs text-muted-foreground">{a.modelo}</span>
        </span>
      </div>
    ),
  },
  {
    key: "pais",
    header: "País",
    cell: (a) => (
      <Badge variant="outline" className="font-mono text-xs">
        {a.pais_registro}
      </Badge>
    ),
  },
  {
    key: "motores",
    header: "Motores",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => a.num_motores,
  },
  {
    // «Tact. Actual» del pizarrón: la última lectura capturada.
    key: "ultimo_taco",
    header: "Último taco",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) =>
      a.ultimo_taco != null ? (
        `${Number(a.ultimo_taco).toFixed(1)} h`
      ) : (
        <CeldaVacia />
      ),
  },
  {
    // «Últ. Tact. Serv.»: con qué taco se hizo el último servicio del avión.
    key: "ultimo_servicio",
    header: "Último servicio",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (a) => {
      const { taco, detalle } = textoUltimoServicio(a.servicio);
      if (taco === GUION) return <CeldaVacia titulo={tituloSinServicio(a.servicio)} />;
      return (
        <span className="block">
          <span className="font-mono text-sm">{taco}</span>
          {detalle && <Sublinea texto={detalle} />}
        </span>
      );
    },
  },
  {
    // «Sig. Servicio» (el taco): a qué lectura toca el próximo hito.
    key: "siguiente_servicio",
    header: "Siguiente servicio",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) => {
      const taco = textoSiguienteServicio(a.servicio);
      return taco === GUION ? (
        <CeldaVacia titulo={tituloSinServicio(a.servicio)} />
      ) : (
        taco
      );
    },
  },
  {
    // «Tiempo restante»: ámbar dentro del margen de aviso, rojo si ya se pasó.
    key: "restante",
    header: "Restante",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (a) => {
      const texto = textoRestante(a.servicio);
      if (texto === GUION) return <CeldaVacia titulo={tituloSinServicio(a.servicio)} />;
      const tono = tonoRestante(a.servicio);
      // `en_taller` = respaldo cuando el hito que se pinta todavía no tiene
      // orden pero el avión SÍ está parado (N58BT): el dato ya viene en esta
      // misma fila del API.
      const orden = estadoOrdenDeServicio(a.servicio, {
        enTaller: a.en_taller === true,
      });
      return (
        <span className="block">
          <span
            className={`text-sm tabular-nums ${tono ? CLASE_TONO_RESTANTE[tono] : ""}`}
          >
            {texto}
          </span>
          {/* La orden ya existe: se dice en qué va. El enlace para actuar
              vive en el expediente del avión (la fila entera lleva ahí),
              porque un <a> dentro del link de fila sería marcado inválido. */}
          {orden && (
            <Sublinea
              texto={orden.texto}
              clase={CLASE_TONO_SERVICIO[orden.tono]}
              titulo={orden.detalle}
            />
          )}
        </span>
      );
    },
  },
  {
    // «Siguiente tipo de servicio»: la etiqueta corta (50 / 100 / 200 hrs).
    key: "tipo_servicio",
    header: "Tipo",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => {
      const etiqueta = etiquetaTipoServicio(a.servicio);
      return etiqueta === GUION ? (
        <CeldaVacia titulo={tituloSinServicio(a.servicio)} />
      ) : (
        <span className="text-sm" title={nombreEtapaSiguiente(a.servicio)}>
          {etiqueta}
        </span>
      );
    },
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) =>
      !a.activa ? (
        <Badge variant="secondary">Inactiva</Badge>
      ) : a.apto === false ? (
        // Motivos en el tooltip; el detalle trae el desglose completo.
        <Badge
          className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-help"
          title={(a.no_apto_razones ?? []).join("\n")}
        >
          No apto
        </Badge>
      ) : (
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
          Apta
        </Badge>
      ),
  },
  {
    key: "ver",
    header: "",
    headClassName: "w-8",
    cellClassName: "text-right",
    // Link propio para conservar el aria-label descriptivo por matrícula.
    noLink: true,
    cell: (a) => (
      <Link
        href={`/admin/aircraft/${a.id}`}
        className="block"
        aria-label={`Ver ${a.matricula}`}
      >
        <ChevronRightIcon className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    ),
  },
];

/** Listado de la flota (catálogo chico: sin buscador). */
export function AircraftTable({ aircraft }: { aircraft: Aircraft[] }) {
  return (
    <DataTable
      columns={columns}
      rows={aircraft}
      rowKey={(a) => a.id}
      rowHref={(a) => `/admin/aircraft/${a.id}`}
      rowClassName={(a) =>
        "group transition-colors" + (a.activa ? "" : " opacity-60")
      }
    />
  );
}
