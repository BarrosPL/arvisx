import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBrandThread } from "@/lib/agent/orchestrator";
import { ChatPanel, type ChatMessageView } from "@/components/chat-panel";

interface PageProps {
  params: Promise<{ brandSlug: string }>;
}

export default async function BrandChatPage({ params }: PageProps) {
  const { brandSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    notFound();
  }

  const access = await prisma.brandAccess.findUnique({
    where: { userId_brandId: { userId: session.user.id, brandId: brand.id } },
  });
  if (!access) {
    notFound();
  }

  const thread = await getOrCreateBrandThread(brand.id, session.user.id);
  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });

  const messageViews: ChatMessageView[] = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    toolName: message.toolName,
    createdAt: message.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Chat com a JAMILE</h2>
        <p className="text-sm text-muted-foreground">Conversa contínua para a marca {brand.name}.</p>
      </div>
      <ChatPanel brandId={brand.id} initialMessages={messageViews} />
    </div>
  );
}
