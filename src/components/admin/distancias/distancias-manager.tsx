"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import {
  deleteDistanciaAction,
  importDistanciasAction,
  upsertDistanciaAction,
  type DistanciaTramo,
} from "@/app/admin/distancias/actions";

/**
 * Catálogo de distancias por aerovía. La alta hace upsert por par (editar un
 * par existente = volver a capturarlo). El import acepta el archivo de
 * referencia pegado como texto: una línea por tramo "ORIGEN DESTINO NM"
 * (separado por espacios, comas o tabs).
 */
export function DistanciasManager({ initial }: { initial: DistanciaTramo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [nm, setNm] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [toDelete, setToDelete] = useState<DistanciaTramo | null>(null);

  const handleAdd = () => {
    const millas = Number(nm.replace(",", "."));
    if (origen.trim().length < 3 || destino.trim().length < 3 || !(millas > 0)) {
      toast.error("Captura origen, destino (IATA) y millas náuticas válidas");
      return;
    }
    startTransition(async () => {
      const res = await upsertDistanciaAction({
        origen_iata: origen.trim().toUpperCase(),
        destino_iata: destino.trim().toUpperCase(),
        millas_nauticas: millas,
      });
      if (res.ok) {
        toast.success(`${origen.toUpperCase()} → ${destino.toUpperCase()}: ${millas} NM guardadas`);
        setOrigen("");
        setDestino("");
        setNm("");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  const parseImport = (text: string) => {
    const tramos: { origen_iata: string; destino_iata: string; millas_nauticas: number }[] = [];
    const errores: string[] = [];
    for (const [i, lineaRaw] of text.split("\n").entries()) {
      const linea = lineaRaw.trim();
      if (!linea || linea.startsWith("#")) continue;
      const partes = linea.split(/[\s,;\t]+/).filter(Boolean);
      const millas = Number((partes[2] ?? "").replace(",", "."));
      if (partes.length < 3 || partes[0].length < 3 || partes[1].length < 3 || !(millas > 0)) {
        errores.push(`Línea ${i + 1}: "${linea}"`);
        continue;
      }
      tramos.push({
        origen_iata: partes[0].toUpperCase(),
        destino_iata: partes[1].toUpperCase(),
        millas_nauticas: millas,
      });
    }
    return { tramos, errores };
  };

  const handleImport = () => {
    const { tramos, errores } = parseImport(importText);
    if (tramos.length === 0) {
      toast.error("No se reconoció ningún tramo. Formato: ORIGEN DESTINO NM (uno por línea).");
      return;
    }
    startTransition(async () => {
      const res = await importDistanciasAction(tramos);
      if (res.ok) {
        toast.success(
          `${res.data?.imported ?? tramos.length} tramos cargados${
            errores.length ? ` · ${errores.length} líneas ignoradas` : ""
          }`,
        );
        setImportOpen(false);
        setImportText("");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo importar");
      }
    });
  };

  const handleDelete = () => {
    if (!toDelete) return;
    startTransition(async () => {
      const res = await deleteDistanciaAction(toDelete.id);
      if (res.ok) {
        toast.success(`${toDelete.origen_iata} → ${toDelete.destino_iata} eliminada`);
        setToDelete(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    });
  };

  const columns: Array<DataTableColumn<DistanciaTramo>> = [
    {
      key: "origen",
      header: "Origen",
      cellClassName: "font-mono text-sm",
      cell: (d) => d.origen_iata,
    },
    {
      key: "destino",
      header: "Destino",
      cellClassName: "font-mono text-sm",
      cell: (d) => d.destino_iata,
    },
    {
      key: "nm",
      header: "NM (aerovía)",
      headClassName: "text-right",
      cellClassName: "text-right font-mono",
      cell: (d) =>
        Number(d.millas_nauticas).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        }),
    },
    {
      key: "fuente",
      header: "Fuente",
      cellClassName: "text-xs text-muted-foreground",
      cell: (d) => d.fuente,
    },
    {
      key: "eliminar",
      header: "",
      headClassName: "w-10",
      cell: (d) => (
        <button
          type="button"
          onClick={() => setToDelete(d)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Eliminar"
          aria-label={`Eliminar distancia ${d.origen_iata} a ${d.destino_iata}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Agregar / corregir distancia</CardTitle>
          <CardDescription className="text-xs">
            Upsert por par: capturar un par existente lo actualiza. El cotizador
            usa este catálogo antes que cualquier aproximación.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Origen</Label>
            <Input
              value={origen}
              onChange={(e) => setOrigen(e.target.value.toUpperCase())}
              placeholder="CUN"
              maxLength={4}
              className="w-24 font-mono uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Destino</Label>
            <Input
              value={destino}
              onChange={(e) => setDestino(e.target.value.toUpperCase())}
              placeholder="MID"
              maxLength={4}
              className="w-24 font-mono uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Millas náuticas (aerovía)</Label>
            <Input
              value={nm}
              onChange={(e) => setNm(e.target.value)}
              placeholder="156.5"
              className="w-36 font-mono"
            />
          </div>
          <Button onClick={handleAdd} disabled={pending} className="gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Guardar
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Importar lista
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {initial.length} {initial.length === 1 ? "tramo" : "tramos"} en catálogo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {initial.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin tramos — importa la lista de referencia.
            </p>
          ) : (
            <DataTable
              columns={columns}
              rows={initial}
              rowKey={(d) => d.id}
              searchText={(d) => `${d.origen_iata} ${d.destino_iata}`}
              searchPlaceholder="Filtrar por IATA…"
            />
          )}
        </CardContent>
      </Card>

      {/* Import */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Importar lista de distancias</AlertDialogTitle>
            <AlertDialogDescription>
              Pega el archivo de referencia (distancias por aerovía): una línea
              por tramo con <span className="font-mono">ORIGEN DESTINO NM</span>{" "}
              separados por espacios, comas o tabs. Los pares existentes se
              actualizan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"CUN MID 156.5\nCUN CZM 31\nCUN HUX 540.2"}
            className="font-mono text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleImport();
              }}
              disabled={pending}
            >
              {pending ? "Importando…" : "Importar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {toDelete?.origen_iata} → {toDelete?.destino_iata}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El autollenado de millas dejará de usar este par (caerá a rutas
              guardadas o a la aproximación directa).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
