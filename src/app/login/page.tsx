import { Suspense } from "react";
import { VtSpinner } from "@/components/ui/vt-loader";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="vt-card p-8 h-72 flex items-center justify-center">
              <VtSpinner className="h-8 w-8 text-brand-600" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
