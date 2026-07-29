import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // (app)/layout.tsx ja garante login e mustChangePassword=false antes de chegar aqui -
  // esta checagem e so o papel de admin, especifica desta secao.
  if (session?.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
