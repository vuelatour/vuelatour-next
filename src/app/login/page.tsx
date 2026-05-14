import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="vt-card p-8 animate-pulse h-72" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
