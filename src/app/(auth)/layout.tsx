import { AuthIdentityPanel } from "@/components/auth-identity-panel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-1 flex-col lg:flex-row">
      <AuthIdentityPanel />
      <div className="flex flex-1 items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
