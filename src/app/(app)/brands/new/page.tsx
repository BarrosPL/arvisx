import { BrandForm } from "@/components/brand-form";
import { PageHeader } from "@/components/page-header";

export default function NewBrandPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nova marca"
        description="A marca entra em status Onboarding até ter identidade, contas e credenciais configuradas. Contas de anúncio conectadas em Conexões já viram marca automaticamente — use esta página só para criar uma marca sem conta vinculada ainda."
      />
      <div className="max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
        <BrandForm
          mode="create"
          initial={{ slug: "", name: "", priorityOrder: 0, topicKeywords: [], excludedKeywords: [] }}
        />
      </div>
    </div>
  );
}
