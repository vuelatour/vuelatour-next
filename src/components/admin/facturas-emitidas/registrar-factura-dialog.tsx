"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpTrayIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiBrowser } from "@/lib/api/browser";
import {
  guardarFacturaEmitida,
  leerArchivoFactura,
} from "@/lib/api/facturas-emitidas-browser";
import { refrescarFacturasEmitidasAction } from "@/app/admin/facturas-emitidas/actions";
import {
  EMISORA_OTRA,
  avisarCambioPorFacturar,
  cambiosDeEdicion,
  clasificarArchivosFactura,
  datosDeFormulario,
  diferenciasLecturaVsFormulario,
  prellenarSinPisar,
  validarFormularioFactura,
  valoresDeFactura,
  valoresDeLectura,
  valoresVacios,
  type CampoFormularioFactura,
  type ValoresFormularioFactura,
} from "@/lib/admin/facturas-emitidas";
import { megasDe } from "@/lib/admin/factura-cliente";
import { todayCancun } from "@/lib/datetime";
import {
  SelectorVuelosFactura,
  type VueloSeleccionado,
} from "./selector-vuelos-factura";
import type {
  AvisoFactura,
  FacturaEmitida,
  FacturaExistente,
  LecturaArchivoFactura,
  ResultadoGuardarFactura,
} from "@/types/facturas-emitidas";

export interface ClienteOpcion {
  id: string;
  nombre: string;
  rfc?: string | null;
}

export interface EmisoraOpcion {
  id: string;
  razon_social: string;
}

export interface RegistrarFacturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: "crear" | "editar";
  /** Obligatoria en `editar`. */
  factura?: FacturaEmitida;
  /** Vuelos con los que abre (desde «Por facturar», la burbuja del vuelo…). */
  vuelosPreseleccionados?: VueloSeleccionado[];
  /** Si no llegan, se cargan al abrir (`/v1/clients`, `/v1/issuing-entities`). */
  clientes?: ClienteOpcion[];
  emisoras?: EmisoraOpcion[];
  onGuardada?: (r: ResultadoGuardarFactura) => void;
}

type ErroresFormulario = Partial<Record<keyof ValoresFormularioFactura, string>>;

/**
 * «Registrar factura» (24-sep-2026, pedido de Ale: «Mari las estaría
 * adjuntando en PDF»). Mari suelta el PDF (y el XML si lo tiene) y el
 * formulario se PRELLENA con lo que el API leyó —serie, folio, UUID, fecha,
 * cliente, RFC, totales, moneda, método— SIN pisar lo que ella ya escribió.
 * Antes de guardar se ve si «ya está registrada» (banner rojo, «Guardar»
 * deshabilitado) y si lo capturado no coincide con el archivo (ámbar, no
 * bloquea: la lectura de un PDF puede equivocarse).
 *
 * Guardar va en UNA llamada multipart DIRECTA al API (`datos` + `pdf` +
 * `xml`): el tope de 4.5 MB de Vercel mataría el PDF en una server action.
 * El pie con «Guardar» es sticky: el diálogo es largo y el operador no debe
 * tabular a ciegas para encontrarlo.
 */
export function RegistrarFacturaDialog({
  open,
  onOpenChange,
  modo,
  factura,
  vuelosPreseleccionados,
  clientes: clientesProp,
  emisoras: emisorasProp,
  onGuardada,
}: RegistrarFacturaDialogProps) {
  const router = useRouter();
  const editar = modo === "editar" && !!factura;
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const idParcial = useId();

  // ---------------------------------------------------------------- estado
  const hoy = useMemo(() => todayCancun(), []);
  const [valores, setValores] = useState<ValoresFormularioFactura>(() => {
    if (editar && factura) return valoresDeFactura(factura);
    const v = valoresVacios();
    // Fecha por defecto: hoy en Cancún (la lectura del archivo la reemplaza
    // mientras Mari no la toque).
    v.fecha_emision = hoy;
    const primero = vuelosPreseleccionados?.find((x) => x.cliente_id);
    if (primero?.cliente_id) v.cliente_id = primero.cliente_id;
    return v;
  });
  const [tocados, setTocados] = useState<Set<CampoFormularioFactura>>(() => new Set());
  const [vuelos, setVuelos] = useState<VueloSeleccionado[]>(() => {
    if (editar && factura) {
      return factura.vuelos.map((v) => ({
        id: v.id,
        folio: v.folio,
        fecha_vuelo: v.fecha_vuelo,
        cliente_nombre: v.cliente_nombre,
        estado: v.estado,
        total: v.total,
      }));
    }
    return vuelosPreseleccionados ?? [];
  });
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [lectura, setLectura] = useState<LecturaArchivoFactura | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [sugeridoPor, setSugeridoPor] = useState<"RFC" | "NOMBRE" | null>(null);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [existente, setExistente] = useState<FacturaExistente | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  // ----------------------------------------------------- catálogos (si faltan)
  const [clientesCargados, setClientesCargados] = useState<ClienteOpcion[] | null>(null);
  const [emisorasCargadas, setEmisorasCargadas] = useState<EmisoraOpcion[] | null>(null);
  const clientes = clientesProp ?? clientesCargados ?? [];
  const emisoras = emisorasProp ?? emisorasCargadas ?? [];

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    if (!clientesProp) {
      apiBrowser<{ data: ClienteOpcion[] }>("/v1/clients", {
        searchParams: { limit: 200, activo: true },
      })
        .then((r) => {
          if (vivo) setClientesCargados((r?.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, rfc: c.rfc ?? null })));
        })
        .catch(() => {
          if (vivo) setClientesCargados([]);
        });
    }
    if (!emisorasProp) {
      apiBrowser<{ data: EmisoraOpcion[] }>("/v1/issuing-entities", {
        searchParams: { activa: true, limit: 100 },
      })
        .then((r) => {
          if (vivo) setEmisorasCargadas((r?.data ?? []).map((e) => ({ id: e.id, razon_social: e.razon_social })));
        })
        .catch(() => {
          if (vivo) setEmisorasCargadas([]);
        });
    }
    return () => {
      vivo = false;
    };
  }, [open, clientesProp, emisorasProp]);

  // Con UNA sola razón social activa y nada elegido/detectado, esa es la que
  // emite (con dos se deja vacío y se pide elegir).
  const emisoraDefault =
    !editar && valores.emisora_id === "" && !tocados.has("emisora_id") && emisoras.length === 1
      ? emisoras[0].id
      : null;
  const valoresEfectivos: ValoresFormularioFactura = emisoraDefault
    ? { ...valores, emisora_id: emisoraDefault }
    : valores;

  // ---------------------------------------------------------------- helpers
  const cambiar = useCallback(
    <K extends CampoFormularioFactura>(campo: K, valor: ValoresFormularioFactura[K]) => {
      setValores((prev) => ({ ...prev, [campo]: valor }));
      setTocados((prev) => {
        if (prev.has(campo)) return prev;
        const n = new Set(prev);
        n.add(campo);
        return n;
      });
      setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
      if (campo === "cliente_id") setSugeridoPor(null);
    },
    [],
  );

  // La lectura llega después de un `await`: se aplica sobre lo que hay AHORA
  // (refs), no sobre lo que había al soltar el archivo — si Mari tecleó
  // mientras se leía, eso se respeta.
  const valoresRef = useRef(valores);
  const tocadosRef = useRef(tocados);
  useEffect(() => {
    valoresRef.current = valores;
    tocadosRef.current = tocados;
  }, [valores, tocados]);

  const aplicarLectura = (l: LecturaArchivoFactura) => {
    setLectura(l);
    const prev = valoresRef.current;
    const tocadosAhora = tocadosRef.current;
    // La fecha por defecto (hoy) NO cuenta como capturada: si el archivo trae
    // fecha y Mari no la tocó, gana la del archivo.
    const base =
      !tocadosAhora.has("fecha_emision") && prev.fecha_emision === hoy && l.campos.fecha_emision
        ? { ...prev, fecha_emision: "" }
        : prev;
    let v = prellenarSinPisar(base, tocadosAhora, valoresDeLectura(l.campos));
    if (l.emisora && !tocadosAhora.has("emisora_id") && !v.emisora_id) {
      v = { ...v, emisora_id: l.emisora.id };
    }
    if (l.cliente_sugerido && !tocadosAhora.has("cliente_id") && !v.cliente_id) {
      v = { ...v, cliente_id: l.cliente_sugerido.id };
      setSugeridoPor(l.cliente_sugerido.por);
    }
    valoresRef.current = v;
    setValores(v);
  };

  // Turno de la lectura VIGENTE: soltar el PDF y enseguida el XML (o quitar
  // uno) deja dos lecturas en vuelo; la que llega tarde de un juego de
  // archivos ya viejo NO debe pisar a la nueva ni reactivar «Guardar»
  // mientras la nueva sigue leyendo.
  const turnoLecturaRef = useRef(0);

  const leer = async (nuevoPdf: File | null, nuevoXml: File | null) => {
    const turno = ++turnoLecturaRef.current;
    if (!nuevoPdf && !nuevoXml) {
      setLeyendo(false);
      setLectura(null);
      setErrorArchivo(null);
      return;
    }
    setLeyendo(true);
    setErrorArchivo(null);
    const res = await leerArchivoFactura({ pdf: nuevoPdf, xml: nuevoXml });
    if (turno !== turnoLecturaRef.current) return;
    setLeyendo(false);
    if (res.ok) {
      aplicarLectura(res.data);
    } else {
      setLectura(null);
      setErrorArchivo(`No pude leer el archivo: ${res.error} Captura los datos a mano.`);
    }
  };

  const recibirArchivos = (lista: FileList | File[] | null) => {
    const archivos = Array.from(lista ?? []);
    if (archivos.length === 0) return;
    const c = clasificarArchivosFactura(archivos);
    if (c.error) {
      setErrorArchivo(c.error);
      return;
    }
    const nuevoPdf = c.pdf ?? pdf;
    const nuevoXml = c.xml ?? xml;
    setPdf(nuevoPdf);
    setXml(nuevoXml);
    void leer(nuevoPdf, nuevoXml);
  };

  const quitarArchivo = (tipo: "pdf" | "xml") => {
    const nuevoPdf = tipo === "pdf" ? null : pdf;
    const nuevoXml = tipo === "xml" ? null : xml;
    setPdf(nuevoPdf);
    setXml(nuevoXml);
    // Lo ya prellenado se queda (Mari lo puede corregir; el prellenado nunca
    // pisa lo que ya tiene valor). Sin archivos, la comparación «el PDF
    // dice…» deja de tener sentido; con UNO que queda se vuelve a leer: la
    // lectura anterior era de los DOS (su «ya está registrada», su «El XML
    // dice…» y su emisor ya no describen lo que se va a subir).
    void leer(nuevoPdf, nuevoXml);
  };

  // ------------------------------------------------------ banners derivados
  const yaRegistrada =
    lectura?.ya_registrada && !(editar && factura && lectura.ya_registrada.id === factura.id)
      ? lectura.ya_registrada
      : null;
  const fuenteLectura = lectura?.fuente.xml ? "El XML" : "El PDF";
  const diferencias = lectura
    ? diferenciasLecturaVsFormulario(lectura.campos, valoresEfectivos, fuenteLectura)
    : [];
  const emisorLeido = lectura
    ? [lectura.campos.emisor_nombre, lectura.campos.emisor_rfc ? `RFC ${lectura.campos.emisor_rfc}` : null]
        .filter(Boolean)
        .join(" · ")
    : "";

  // --------------------------------------------------------------- guardar
  const guardar = async () => {
    const errs = validarFormularioFactura(valoresEfectivos);
    if (Object.values(errs).some(Boolean)) {
      setErrores(errs);
      setErrorGuardar("Revisa los campos marcados en rojo.");
      return;
    }
    let datos = datosDeFormulario(
      valoresEfectivos,
      vuelos.map((v) => v.id),
    );
    if (editar && factura) {
      datos = cambiosDeEdicion(factura, datos);
      if (Object.keys(datos).length === 0 && !pdf && !xml) {
        toast.info("No hay cambios que guardar.");
        onOpenChange(false);
        return;
      }
    }
    setGuardando(true);
    setErrorGuardar(null);
    setExistente(null);
    const res = await guardarFacturaEmitida({
      id: editar ? factura?.id : null,
      datos,
      pdf,
      xml,
    });
    setGuardando(false);
    if (!res.ok) {
      setErrorGuardar(res.error);
      const det = res.details as { existente?: FacturaExistente } | undefined;
      if (
        (res.code === "FACTURA_DUPLICADA" || res.code === "UUID_DUPLICADO") &&
        det?.existente
      ) {
        setExistente(det.existente);
      }
      return;
    }
    const { factura: guardada, avisos } = res.data;
    toast.success(
      editar ? `Factura ${guardada.etiqueta} actualizada` : `Factura ${guardada.etiqueta} registrada`,
    );
    avisos.forEach((a: AvisoFactura) => toast.warning(a.mensaje, { duration: 10_000 }));
    onGuardada?.(res.data);
    avisarCambioPorFacturar();
    const ids = [...new Set([...guardada.vuelos.map((v) => v.id), ...(factura?.vuelos.map((v) => v.id) ?? [])])];
    void refrescarFacturasEmitidasAction(ids);
    onOpenChange(false);
    router.refresh();
  };

  // ---------------------------------------------------------------- render
  const opcionesEmisora = [
    ...emisoras.map((e) => ({ value: e.id, label: e.razon_social })),
    { value: EMISORA_OTRA, label: "Otra / no es de VuelaTour" },
  ];
  const opcionesCliente = [
    { value: "", label: "Sin cliente" },
    ...clientes.map((c) => ({
      value: c.id,
      label: c.nombre,
      description: c.rfc ? `RFC ${c.rfc}` : undefined,
    })),
  ];
  const bloqueado = guardando;
  const deshabilitarGuardar = guardando || leyendo || !!yaRegistrada;
  const tituloGuardar = yaRegistrada
    ? "Esta factura ya está registrada"
    : leyendo
      ? "Espera a que termine de leer el archivo"
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !guardando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editar ? `Editar factura ${factura?.etiqueta}` : "Registrar factura"}</DialogTitle>
          <DialogDescription>
            {editar
              ? "Corrige los datos o liga otros vuelos. Si subes un PDF nuevo, reemplaza al actual (el anterior se guarda por seguridad)."
              : "Suelta el PDF de la factura (y el XML si lo tienes): los datos se llenan solos y tú los revisas antes de guardar."}
          </DialogDescription>
        </DialogHeader>

        {/* ---------------- Archivos ---------------- */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (!bloqueado) recibirArchivos(e.dataTransfer.files);
          }}
          className={`rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors ${
            arrastrando ? "border-brand-500 bg-brand-500/5" : "border-border"
          }`}
        >
          <ArrowUpTrayIcon className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-1 text-sm">Suelta aquí el PDF de la factura (y el XML si lo tienes)</p>
          <p className="text-[11px] text-muted-foreground">Un PDF y un XML como máximo · hasta 10 MB cada uno</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={bloqueado}
            onClick={() => inputArchivoRef.current?.click()}
          >
            Elegir archivos
          </Button>
          <input
            ref={inputArchivoRef}
            type="file"
            multiple
            accept=".pdf,.xml,application/pdf,text/xml,application/xml"
            className="hidden"
            aria-label="Elegir el PDF y el XML de la factura"
            onChange={(e) => {
              recibirArchivos(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {editar && factura && (factura.pdf || factura.xml) && !pdf && !xml && (
          <p className="text-[11px] text-muted-foreground">
            Archivos actuales:{" "}
            {[factura.pdf ? `PDF ${factura.pdf.nombre ?? ""}`.trim() : null, factura.xml ? `XML ${factura.xml.nombre ?? ""}`.trim() : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {(pdf || xml) && (
          <ul className="space-y-1">
            {[
              { tipo: "pdf" as const, f: pdf },
              { tipo: "xml" as const, f: xml },
            ]
              .filter((a) => a.f)
              .map(({ tipo, f }) => (
                <li
                  key={tipo}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium uppercase">{tipo}</span> · {f?.name} ·{" "}
                    {megasDe(f?.size ?? 0)} MB
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 text-muted-foreground"
                    onClick={() => quitarArchivo(tipo)}
                    disabled={bloqueado}
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Quitar
                  </Button>
                </li>
              ))}
          </ul>
        )}

        {leyendo && (
          <p className="text-xs text-muted-foreground" role="status">
            Leyendo la factura…
          </p>
        )}
        {errorArchivo && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {errorArchivo}
          </p>
        )}

        {yaRegistrada && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <p className="font-medium">{yaRegistrada.mensaje}</p>
            <Link
              href={`/admin/facturas-emitidas?q=${encodeURIComponent(yaRegistrada.etiqueta)}`}
              className="underline underline-offset-2"
              onClick={() => onOpenChange(false)}
            >
              Verla en el registro
            </Link>
          </div>
        )}

        {lectura && lectura.avisos.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {lectura.avisos.map((a, i) => (
              <li key={`${a.code}-${i}`} className="flex gap-1.5">
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{a.mensaje}</span>
              </li>
            ))}
          </ul>
        )}

        {emisorLeido && (
          <p className="text-[11px] text-muted-foreground">
            Emisor en el {lectura?.fuente.xml ? "XML" : "PDF"}: {emisorLeido}
          </p>
        )}

        {/* ---------------- Datos ---------------- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            label="Razón social que emite"
            hint={
              emisoras.length >= 2 && !valoresEfectivos.emisora_id
                ? "Elige quién la emitió: cada razón social lleva su propia numeración."
                : undefined
            }
          >
            <SearchableSelect
              options={opcionesEmisora}
              value={valoresEfectivos.emisora_id}
              onChange={(v) => cambiar("emisora_id", v)}
              placeholder="Elige la razón social"
              disabled={bloqueado}
            />
          </Campo>
          <CampoTexto
            label="Serie"
            valor={valores.serie}
            onCambio={(v) => cambiar("serie", v.toUpperCase())}
            placeholder="Ej. A"
            error={errores.serie}
            disabled={bloqueado}
            maxLength={25}
          />
          <CampoTexto
            label="Folio"
            requerido
            valor={valores.folio}
            onCambio={(v) => cambiar("folio", v)}
            placeholder="Ej. 123"
            error={errores.folio}
            disabled={bloqueado}
            maxLength={40}
            mono
          />
          <CampoTexto
            label="Folio fiscal (UUID)"
            valor={valores.uuid}
            onCambio={(v) => cambiar("uuid", v.toUpperCase())}
            placeholder="8-4-4-4-12"
            error={errores.uuid}
            disabled={bloqueado}
            maxLength={36}
            mono
          />
          <CampoTexto
            label="Fecha de emisión"
            requerido
            tipo="date"
            valor={valores.fecha_emision}
            onCambio={(v) => cambiar("fecha_emision", v)}
            error={errores.fecha_emision}
            disabled={bloqueado}
          />
          <Campo
            label="Cliente"
            hint={
              sugeridoPor
                ? sugeridoPor === "RFC"
                  ? "Sugerido por el RFC del receptor"
                  : "Sugerido por el nombre del receptor"
                : undefined
            }
          >
            <SearchableSelect
              options={opcionesCliente}
              value={valores.cliente_id}
              onChange={(v) => cambiar("cliente_id", v)}
              placeholder="Elige el cliente"
              disabled={bloqueado}
            />
          </Campo>
          <CampoTexto
            label="RFC receptor"
            valor={valores.receptor_rfc}
            onCambio={(v) => cambiar("receptor_rfc", v.toUpperCase())}
            error={errores.receptor_rfc}
            disabled={bloqueado}
            maxLength={16}
            mono
          />
          <CampoTexto
            label="Nombre del receptor"
            valor={valores.receptor_nombre}
            onCambio={(v) => cambiar("receptor_nombre", v)}
            disabled={bloqueado}
            maxLength={300}
          />
          <Campo label="Moneda" requerido error={errores.moneda}>
            <SearchableSelect
              options={[
                { value: "MXN", label: "MXN · pesos" },
                { value: "USD", label: "USD · dólares" },
              ]}
              value={valores.moneda}
              onChange={(v) => cambiar("moneda", v as ValoresFormularioFactura["moneda"])}
              placeholder="Elige la moneda"
              disabled={bloqueado}
            />
          </Campo>
          <Campo label="Método de pago">
            <SearchableSelect
              options={[
                { value: "", label: "—" },
                { value: "PUE", label: "PUE · una sola exhibición" },
                { value: "PPD", label: "PPD · parcialidades o diferido" },
              ]}
              value={valores.metodo_pago}
              onChange={(v) => cambiar("metodo_pago", v as ValoresFormularioFactura["metodo_pago"])}
              placeholder="—"
              disabled={bloqueado}
            />
          </Campo>
          <CampoTexto
            label="Subtotal"
            valor={valores.subtotal}
            onCambio={(v) => cambiar("subtotal", v)}
            error={errores.subtotal}
            disabled={bloqueado}
            decimal
          />
          <CampoTexto
            label="IVA"
            valor={valores.iva}
            onCambio={(v) => cambiar("iva", v)}
            error={errores.iva}
            disabled={bloqueado}
            decimal
          />
          <CampoTexto
            label="Total"
            requerido
            valor={valores.total}
            onCambio={(v) => cambiar("total", v)}
            error={errores.total}
            disabled={bloqueado}
            decimal
          />
          <CampoTexto
            label="Forma de pago"
            valor={valores.forma_pago}
            onCambio={(v) => cambiar("forma_pago", v)}
            placeholder="Ej. 03, 99"
            error={errores.forma_pago}
            disabled={bloqueado}
            maxLength={2}
          />
        </div>

        <div className="flex items-start gap-3">
          <Switch
            id={idParcial}
            checked={valores.es_parcial}
            onCheckedChange={(v) => cambiar("es_parcial", v === true)}
            disabled={bloqueado}
          />
          <div>
            <Label htmlFor={idParcial} className="text-sm font-normal">
              Factura parcial (anticipo o finiquito)
            </Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Márcala si el vuelo lleva más de una factura a propósito.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Vuelos que cubre</p>
          <SelectorVuelosFactura
            seleccionados={vuelos}
            onChange={(v) => {
              // El primer vuelo elegido llena el cliente si sigue vacío.
              if (vuelos.length === 0 && v[0]?.cliente_id && !valores.cliente_id && !tocados.has("cliente_id")) {
                setValores((prev) => ({ ...prev, cliente_id: v[0].cliente_id as string }));
              }
              setVuelos(v);
            }}
            disabled={bloqueado}
          />
          {vuelos.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Sin vuelo ligado: la factura queda con la alerta «Sin vuelo» hasta que la ligues.
            </p>
          )}
        </div>

        <CampoTexto
          label="Notas"
          valor={valores.notas}
          onCambio={(v) => cambiar("notas", v)}
          error={errores.notas}
          disabled={bloqueado}
          multilinea
          maxLength={1000}
        />

        {diferencias.length > 0 && !yaRegistrada && (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {diferencias.map((d) => (
              <li key={d} className="flex gap-1.5">
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}

        {errorGuardar && (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            <p className="font-medium">{errorGuardar}</p>
            {existente && (
              <Link
                href={`/admin/facturas-emitidas?q=${encodeURIComponent(existente.etiqueta)}`}
                className="underline underline-offset-2"
                onClick={() => onOpenChange(false)}
              >
                Verla en el registro
              </Link>
            )}
          </div>
        )}

        {/* Pie STICKY: «Guardar» siempre a la vista aunque el diálogo desplace. */}
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-popover p-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={deshabilitarGuardar}
            title={tituloGuardar}
            className="gap-1.5"
          >
            <DocumentPlusIcon className="h-4 w-4" />
            {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar factura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Etiqueta + control + ayuda/error para los selectores (sin `htmlFor`: el
 *  disparador del SearchableSelect no es un input al que ligarse). */
function Campo({
  label,
  requerido,
  hint,
  error,
  children,
}: {
  label: string;
  requerido?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {label}
        {requerido && <span className="ml-0.5 text-destructive">*</span>}
      </p>
      {children}
      {(error || hint) && (
        <p
          role={error ? "alert" : undefined}
          className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function CampoTexto({
  label,
  valor,
  onCambio,
  requerido,
  placeholder,
  error,
  disabled,
  maxLength,
  mono,
  decimal,
  tipo = "text",
  multilinea,
}: {
  label: string;
  valor: string;
  onCambio: (v: string) => void;
  requerido?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  mono?: boolean;
  decimal?: boolean;
  tipo?: "text" | "date";
  multilinea?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {requerido && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {multilinea ? (
        <Textarea
          id={id}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          rows={2}
          aria-invalid={error ? true : undefined}
        />
      ) : (
        <Input
          id={id}
          type={tipo}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          inputMode={decimal ? "decimal" : undefined}
          className={`${mono ? "font-mono" : ""} ${decimal ? "tabular-nums" : ""} ${tipo === "date" ? "cursor-pointer" : ""}`.trim()}
          aria-invalid={error ? true : undefined}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Botón que abre «Registrar factura» (encabezado del registro, «Por
 * facturar» y la burbuja del vuelo). El diálogo se monta solo al abrir: así
 * cada apertura arranca limpia y no se cargan catálogos de más.
 */
export function RegistrarFacturaBoton({
  label = "Registrar factura",
  variant = "default",
  size = "default",
  className,
  ...props
}: Omit<RegistrarFacturaDialogProps, "open" | "onOpenChange" | "modo"> & {
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={`gap-1.5 ${className ?? ""}`.trim()}
        onClick={() => setAbierto(true)}
      >
        <DocumentPlusIcon className="h-4 w-4" />
        {label}
      </Button>
      {abierto && (
        <RegistrarFacturaDialog
          {...props}
          open={abierto}
          onOpenChange={setAbierto}
          modo="crear"
        />
      )}
    </>
  );
}
