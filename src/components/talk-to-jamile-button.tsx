"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJamileChat } from "@/components/jamile-launcher";

/** Abre o popup flutuante da JAMILE (chat por usuario) - usado em botoes de
 * "Falar com a JAMILE" fora do proprio popup, ex: no cabecalho da pagina de marca. */
export function TalkToJamileButton() {
  const { openChat } = useJamileChat();
  return (
    <Button size="sm" onClick={openChat}>
      <MessageCircle />
      Falar com a JAMILE
    </Button>
  );
}
