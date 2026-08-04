import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ContentChatPanel } from "@/components/content/content-chat-panel";
import { getActiveContentThread } from "@/lib/contentAgent/threads";
import { toContentChatMessageViews } from "@/lib/contentAgent/orchestrator";

export default async function ContentChatPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const thread = await getActiveContentThread(session.user.id);
  const messages = await prisma.contentMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title="Chat de Conteúdo" description="Peça peças de conteúdo em português — o assistente gera seguindo o Brand Kit da sua marca." />
      <div className="h-[calc(100vh-13rem)] min-h-[420px]">
        <ContentChatPanel initialMessages={toContentChatMessageViews(messages)} />
      </div>
    </div>
  );
}
