"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  PhotoIcon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { uploadAircraftImage } from "@/lib/storage/aircraft-images";
import {
  deleteAircraftImageAction,
  registerAircraftImageAction,
  updateAircraftImageAction,
} from "@/app/admin/aircraft/actions";
import type { AeronaveImagen } from "@/types/aircraft";

interface AircraftImagesCardProps {
  aircraftId: string;
  matricula: string;
  imagenes: AeronaveImagen[];
}

export function AircraftImagesCard({
  aircraftId,
  matricula,
  imagenes,
}: AircraftImagesCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleSelectFiles = () => inputRef.current?.click();

  const handleFiles = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const files = Array.from(filesList);
    setUploading(true);
    let ok = 0;
    let err = 0;
    for (const file of files) {
      try {
        const uploaded = await uploadAircraftImage(aircraftId, file);
        const res = await registerAircraftImageAction(aircraftId, {
          storage_path: uploaded.storage_path,
          url: uploaded.url,
          size_bytes: uploaded.size_bytes,
          content_type: uploaded.content_type,
          alt_text: `${matricula} — ${file.name}`,
        });
        if (res.ok) ok++;
        else {
          err++;
          toast.error(`${file.name}: ${res.error ?? "Error al registrar"}`);
        }
      } catch (e) {
        err++;
        toast.error(
          `${file.name}: ${e instanceof Error ? e.message : "Error al subir"}`,
        );
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(
        `${ok} ${ok === 1 ? "imagen subida" : "imágenes subidas"}${err > 0 ? `, ${err} con error` : ""}`,
      );
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <PhotoIcon className="h-4 w-4 text-muted-foreground" />
            Imágenes
          </CardTitle>
          <CardDescription>
            {imagenes.length === 0
              ? "Sube fotos de la aeronave. Se guardan en Supabase Storage y se reusan en cotizaciones y landing."
              : `${imagenes.length} ${imagenes.length === 1 ? "imagen" : "imágenes"}. La marcada como principal se usa como portada.`}
          </CardDescription>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectFiles}
            disabled={uploading}
            className="gap-1.5 shrink-0"
          >
            <ArrowUpTrayIcon className="h-3.5 w-3.5" />
            {uploading ? "Subiendo…" : "Subir imágenes"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {imagenes.length === 0 ? (
          <EmptyState onPick={handleSelectFiles} disabled={uploading} />
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {imagenes.map((img) => (
              <ImageTile
                key={img.id}
                aircraftId={aircraftId}
                image={img}
                disabled={uploading}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border-2 border-dashed border-border py-10",
        "flex flex-col items-center justify-center gap-2",
        "text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <ArrowUpTrayIcon className="h-7 w-7" />
      <p className="text-sm font-medium">Click para subir imágenes</p>
      <p className="text-[11px]">JPG, PNG, WebP o AVIF · máx 10 MB c/u</p>
    </button>
  );
}

function ImageTile({
  aircraftId,
  image,
  disabled,
}: {
  aircraftId: string;
  image: AeronaveImagen;
  disabled: boolean;
}) {
  const router = useRouter();
  const [openDelete, setOpenDelete] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSetPrincipal = () => {
    if (image.es_principal) return;
    startTransition(async () => {
      const res = await updateAircraftImageAction(aircraftId, image.id, {
        es_principal: true,
      });
      if (res.ok) {
        toast.success("Marcada como principal");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteAircraftImageAction(aircraftId, image.id);
      if (res.ok) {
        toast.success("Imagen eliminada");
        setOpenDelete(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  };

  return (
    <>
      <div className="group/tile relative rounded-lg overflow-hidden border border-border bg-muted/30 aspect-[4/3]">
        {/* Plain <img> a proposito: la URL viene de un host externo (Supabase
            Storage) y no queremos cargar la config de next/image domains. El
            bucket es publico y entrega buenos cache headers. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt_text ?? "Aeronave"}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {image.es_principal && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-brand-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <StarSolidIcon className="h-3 w-3" />
            Principal
          </div>
        )}
        <div className="absolute top-1 right-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={disabled || pending}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-background/80 hover:bg-background transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring backdrop-blur-sm"
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
              <span className="sr-only">Acciones de la imagen</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleSetPrincipal}
                disabled={image.es_principal || pending}
                className="gap-2"
              >
                <StarIcon className="h-4 w-4" />
                Marcar como principal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
                <PencilIcon className="h-4 w-4" />
                Editar texto alternativo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setOpenDelete(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <TrashIcon className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {image.alt_text && (
          <p className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] text-white bg-gradient-to-t from-black/70 to-transparent line-clamp-2">
            {image.alt_text}
          </p>
        )}
      </div>

      <AltTextSheet
        open={openEdit}
        onOpenChange={setOpenEdit}
        aircraftId={aircraftId}
        image={image}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar imagen?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra del bucket de Storage y de la base de datos. La acción no
              se puede deshacer. Si era la imagen principal, la siguiente quedará
              como principal automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AltTextSheet({
  open,
  onOpenChange,
  aircraftId,
  image,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aircraftId: string;
  image: AeronaveImagen;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(image.alt_text ?? "");

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateAircraftImageAction(aircraftId, image.id, {
        alt_text: value.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Texto alternativo actualizado");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar");
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md sm:w-[420px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Texto alternativo</SheetTitle>
          <SheetDescription>
            Descripción accesible de la imagen. Se muestra cuando la imagen no
            puede cargarse y la usan lectores de pantalla.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <Label className="text-sm font-medium">Alt text</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            placeholder="Ej. N621TX en pista de Cancún al atardecer"
          />
          <p className="text-xs text-muted-foreground">
            {value.length}/200
          </p>
        </div>
        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
