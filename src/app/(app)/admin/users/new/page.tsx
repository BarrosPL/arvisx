import { PageHeader } from "@/components/page-header";
import { NewUserForm } from "@/components/admin/new-user-form";

export default function NewAdminUserPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nova conta"
        description="A conta nasce com uma senha temporária, que você repassa manualmente — a pessoa é obrigada a trocá-la no primeiro login."
      />
      <div className="max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <NewUserForm />
      </div>
    </div>
  );
}
