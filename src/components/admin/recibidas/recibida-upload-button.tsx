"use client";

import { useRef, useState } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createRecibidaAction } from "@/app/admin/facturas-recibidas/actions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(file);
  });
}

export function RecibidaUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const onFiles = async (files: FileList) => {
    setLoading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          const b64 = await fileToBase64(file);
          const res = await createRecibidaAction(b64);
          if (res.ok) ok += 1;
          else toast.error(`${file.name}: ${res.error ?? "no se pudo registrar"}`);
        } catch {
          toast.error(`${file.name}: no se pudo leer`);
        }
      }
      if (ok > 0) toast.success(`${ok} factura(s) registrada(s)`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={loading} className="gap-2">
        <ArrowUpTrayIcon className="h-4 w-4" />
        {loading ? "Procesando…" : "Subir XML"}
      </Button>
    </>
  );
}
