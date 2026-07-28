import { BrandForm } from "@/components/brand-form";

export default function NewBrandPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova marca</h1>
        <p className="text-sm text-muted-foreground">
          A marca entra em status Onboarding até ter identidade, contas e credenciais configuradas.
        </p>
      </div>
      <BrandForm
        mode="create"
        initial={{ slug: "", name: "", priorityOrder: 0, topicKeywords: [], excludedKeywords: [] }}
      />
    </div>
  );
}
