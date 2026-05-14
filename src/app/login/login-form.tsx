"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/icons/google";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        toast.error("No se pudo iniciar sesión con Google", {
          description: error.message,
        });
        setLoading(false);
      }
      // Si tuvo éxito, el navegador redirige a Google — no llegamos a setLoading(false).
    } catch (err) {
      toast.error("Error inesperado", {
        description: err instanceof Error ? err.message : String(err),
      });
      setLoading(false);
    }
  }

  return (
    <div className="vt-card p-8 space-y-6">
      <div className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="h-12 w-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white text-lg font-bold tracking-tight">
            VT
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Vuelatour Admin</h1>
        <p className="text-sm text-muted-foreground">
          Sistema de Control Financiero y Operativo
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full h-11 gap-3 text-sm font-medium"
        disabled={loading}
        onClick={handleGoogle}
      >
        <GoogleIcon className="h-5 w-5" />
        {loading ? "Conectando…" : "Continuar con Google"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Al continuar aceptas el acceso al sistema operativo de Aero Charter Cancún.
      </p>
    </div>
  );
}
