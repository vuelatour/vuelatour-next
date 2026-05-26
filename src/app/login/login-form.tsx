"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/icons/google";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setPwdLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error("No se pudo iniciar sesión", { description: error.message });
        setPwdLoading(false);
        return;
      }
      // Navegación completa para que el servidor lea la cookie de sesión.
      window.location.assign(next);
    } catch (err) {
      toast.error("Error inesperado", {
        description: err instanceof Error ? err.message : String(err),
      });
      setPwdLoading(false);
    }
  }

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

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">o con tu correo</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handlePassword} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium">
            Correo
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" size="lg" className="w-full h-11" disabled={pwdLoading}>
          {pwdLoading ? "Entrando…" : "Iniciar sesión"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Al continuar aceptas el acceso al sistema operativo de Aero Charter Cancún.
      </p>
    </div>
  );
}
