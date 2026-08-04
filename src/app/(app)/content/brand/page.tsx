import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BrandForm } from "@/components/content/brand-form";

export default async function ContentBrandPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marca"
        description="Cores, tom de voz e regras da sua marca — usadas em toda peça gerada pela IA."
      />
      <BrandForm />
    </div>
  );
}
