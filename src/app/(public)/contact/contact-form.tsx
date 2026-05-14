"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    // TODO: cablear a la server action / API real cuando exista.
    await new Promise((r) => setTimeout(r, 700));
    setState("success");
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-500/10 text-green-600">
          <CheckCircle2 className="size-7" />
        </div>
        <h3 className="mt-4 text-xl font-semibold">Message sent</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Thanks — we'll reply within 2 hours during operating hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name *" name="name" autoComplete="name" required />
        <Field
          label="Email *"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" />
        <FieldSelect
          label="Interested in"
          name="interest"
          options={[
            "Charter flight",
            "Air tour",
            "Custom route",
            "Other",
          ]}
        />
      </div>
      <Field
        label="Message *"
        name="message"
        as="textarea"
        rows={5}
        required
      />

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          By submitting, you agree to our{" "}
          <a
            href="/privacy"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            privacy policy
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={state === "submitting"}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state === "submitting" ? "Sending…" : "Send message"}
          <ArrowRight className="size-4" />
        </button>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  as?: "input" | "textarea";
  rows?: number;
};

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  as = "input",
  rows,
}: FieldProps) {
  const baseClass = cn(
    "w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground",
    "transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500",
    "placeholder:text-muted-foreground",
  );
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {as === "textarea" ? (
        <textarea
          name={name}
          required={required}
          rows={rows}
          className={cn(baseClass, "mt-2 resize-y")}
        />
      ) : (
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          className={cn(baseClass, "mt-2")}
        />
      )}
    </label>
  );
}

function FieldSelect({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue=""
        className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="" disabled>
          Choose one…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
