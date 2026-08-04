# SPEC FUNCIONAL — Módulos de Conteúdo Social com IA

**Versão:** 2.0 (funcional)
**Data:** 03/08/2026
**Escopo:** apenas as funcionalidades de produto.

---

## PREMISSAS

Estes módulos acoplam a um **sistema já em implementação**. Ficam **fora de escopo**, assumidos como prontos: autenticação, contas e usuários, multi-tenancy e isolamento, PostgreSQL, storage de mídia com CDN, fila de jobs e worker, deploy e observabilidade.

O contrato entre os módulos e o sistema hospedeiro está na seção seguinte. **Comece por ela** — se alguma porta não existir no seu sistema, é isso que precisa ser resolvido antes de qualquer módulo.

O que este spec entrega são os **7 módulos funcionais**:

| ID | Módulo |
|---|---|
| F1 | Identidade de Marca Automática |
| F2 | Geração de Conteúdo com IA |
| F3 | Formatos e Motor de Templates |
| F4 | Editor de Design com IA |
| F5 | Planejamento, Ideias e Calendário |
| F6 | Publicação e Agendamento Nativo (IG / FB / LinkedIn) |
| F7 | Links — Bio Page com Captura de Leads |
| F8 | Créditos por ação (transversal) |

**Duas premissas técnicas que atravessam tudo:**

1. **O design é um scene graph JSON, nunca uma imagem.** O mesmo JSON é editado no browser e renderizado no servidor. Usar o mesmo motor nos dois lados (Fabric.js v6 no cliente, Fabric.js v6 + `node-canvas` no worker) e fontes auto-hospedadas nos dois. Se o motor divergir, o post publicado deixa de ser o post aprovado — é o defeito mais caro deste tipo de produto.
2. **A IA não desenha, a IA preenche.** O LLM devolve conteúdo estruturado e escolhe um arquétipo. O encaixe, o auto-fit e a marca são determinísticos.

---

# ARQUITETURA MODULAR E CONTRATOS COM O SISTEMA HOSPEDEIRO

Estes 7 módulos **acoplam ao seu sistema existente**. A regra que faz isso funcionar sem contaminar o que já está de pé: **os módulos dependem de interfaces, nunca da sua implementação concreta.**

## M.1 Portas que o sistema hospedeiro precisa expor

Cada módulo consome só isto. Se o seu sistema já tem equivalentes, o trabalho é escrever adaptadores, não reimplementar.

```typescript
interface HostContext {
  identity: IdentityPort;
  tenant:   TenantPort;
  storage:  StoragePort;
  queue:    QueuePort;
  notify:   NotificationPort;
  secrets:  SecretsPort;
  credits?: CreditsPort;      // opcional — ver M.4
  events:   EventPort;
}

interface IdentityPort {
  currentUser(): { userId: string; accountId: string; role: Role };
}

interface TenantPort {
  // Lança se o usuário não tem acesso. Todo módulo chama antes de qualquer operação.
  assertBrandAccess(brandId: string, minRole?: Role): Promise<void>;
  listBrands(): Promise<Array<{ id: string; name: string }>>;
}

interface StoragePort {
  put(key: string, data: Buffer, opts: {
    contentType: string;
    public: boolean;          // true = precisa de URL pública permanente
  }): Promise<{ key: string; publicUrl: string }>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

interface QueuePort {
  enqueue(job: string, payload: unknown, opts?: {
    startAfter?: Date;
    singletonKey?: string;    // idempotência de enfileiramento
    retryLimit?: number;
  }): Promise<string>;
  cancel(jobId: string): Promise<void>;
  registerHandler(job: string, handler: (payload: unknown) => Promise<void>): void;
  schedule(job: string, cron: string): void;
}

interface NotificationPort {
  notify(userId: string, template: string, data: Record<string, unknown>): Promise<void>;
}

interface SecretsPort {
  encrypt(plain: string): Promise<string>;
  decrypt(cipher: string): Promise<string>;
}

interface EventPort {
  emit(event: DomainEvent): Promise<void>;
}
```

**Requisito duro do `StoragePort`:** `put({ public: true })` precisa devolver uma URL **permanente e sem autenticação**. A Meta baixa a mídia do seu servidor para publicar — signed URL de curta duração quebra a publicação agendada. TTL mínimo prático: 48 h.

**Requisito duro do `QueuePort`:** precisa suportar `startAfter` com precisão de minuto e um processo vivo consumindo. Se o seu agendador hoje for cron de minuto em minuto varrendo tabela, serve — só ajuste o desvio máximo aceito no critério de aceite do F6.

## M.2 O que cada módulo possui e o que consome

**Namespacing recomendado:** schema Postgres dedicado (`content`), prefixo de rota (`/api/content/*`), prefixo de job (`content.*`). Evita colisão com o que já existe e permite remover o conjunto inteiro sem cirurgia.

| Módulo | Tabelas próprias | Rotas | Jobs | Consome |
|---|---|---|---|---|
| F1 Brand Kit | `brands`, `fonts` | `/api/content/brands/*` | `content.brand.onboard` | identity, tenant, storage |
| F2 Geração | `contents`, `content_slides`, `media_assets` | `/api/content/contents/*` | `content.generate`, `content.render` | F1, F3, storage, queue, credits |
| F3 Formatos | `formats`, `templates` | `/api/content/templates/*` | — | — (é a base) |
| F4 Editor | — (escreve em `content_slides`) | `/api/content/contents/:id/edit*` | `content.render` | F2, F3 |
| F5 Planejamento | `content_ideas`, `calendar_plans`, `brand_blackout_dates` | `/api/content/calendar/*` | `content.daily-ideas` | F1, F2 |
| F6 Publicação | `social_accounts`, `publications` | `/api/content/social/*`, `/api/content/publications/*` | `content.publish`, `content.token-refresh`, `content.token-health` | F2, secrets, queue, notify |
| F7 Links | `bio_pages`, `bio_blocks`, `lead_forms`, `leads`, `bio_events` | `/api/content/bio/*`, `/p/:slug` | `content.webhook-dispatch`, `content.retention` | F1 (só tema), storage, notify |
| F8 Créditos | `credit_ledger` | — | — | identity |

**Regra de fronteira:** nenhum módulo lê tabela de outro diretamente. F6 não faz `SELECT` em `contents` — chama `ContentModule.getForPublishing(contentId)`. Isso é o que permite trocar ou remover um módulo sem quebrar os outros.

## M.3 Grafo de dependências

```
        F3 Formatos/Templates
              │
              ▼
        F1 Brand Kit ──────────────┐
              │                    │
              ▼                    ▼
        F2 Geração IA          F7 Links
         │    │    │            (só tema)
    ┌────┘    │    └────┐
    ▼         ▼         ▼
  F4 Editor  F5 Plan.  F6 Publicação
```

**Dois fatos práticos que saem daí:**

**F7 (Links) é independente de todo o resto.** Só toca o Brand Kit para herdar tema — e mesmo isso é opcional na v1. **É o módulo mais rápido de entregar e o único que gera resultado enquanto o App Review da Meta está pendente.** Se quiser valor no sistema em semanas em vez de meses, comece por ele.

**F3 é a base de tudo e não depende de nada.** Pode ser construído e validado em paralelo com qualquer outra frente do seu sistema.

## M.4 Módulo de créditos — provavelmente você já tem

Se o seu sistema já possui billing, saldo ou limites de uso, **F8 não é um módulo novo — é um adaptador.** Implemente a porta:

```typescript
interface CreditsPort {
  // Debita ANTES de executar. Lança se não houver saldo.
  reserve(accountId: string, action: string, amount: number,
          ref: { type: string; id: string }): Promise<string>;  // → reservationId
  commit(reservationId: string): Promise<void>;
  refund(reservationId: string, reason: string): Promise<void>;
  balance(accountId: string): Promise<number>;
}
```

Nesse caso, mantenha só a **tabela de custos** da F8.1 e descarte a tabela `credit_ledger` e a função de débito. Se não tiver nada de billing hoje, implemente o módulo completo.

## M.5 Eventos publicados

Cada módulo emite; o sistema hospedeiro decide o que fazer. Isso substitui integração ponto a ponto:

```typescript
type DomainEvent =
  | { type:'content.generated';      payload:{ contentId:string; brandId:string } }
  | { type:'content.published';      payload:{ publicationId:string; permalink:string; network:string } }
  | { type:'content.publish_failed'; payload:{ publicationId:string; reason:string; retryable:boolean } }
  | { type:'brand.onboarded';        payload:{ brandId:string } }
  | { type:'social.token_expiring';  payload:{ socialAccountId:string; expiresAt:string } }
  | { type:'lead.captured';          payload:{ leadId:string; brandId:string; formId:string } }
  | { type:'credits.depleted';       payload:{ accountId:string } };
```

## M.6 Ordem de acoplamento sem quebrar o que existe

| Etapa | Entrega | Independente? |
|---|---|---|
| 0 | Submeter App Meta + aplicar LinkedIn Partner | ✅ paralelo a tudo |
| 1 | **F7 Links** — entrega valor imediato, zero dependência | ✅ |
| 2 | F3 Formatos + motor de render | ✅ |
| 3 | F1 Brand Kit | depende de F3 |
| 4 | F2 Geração | depende de F1, F3 |
| 5 | F8 Créditos (ou adaptador) | depende de F2 |
| 6 | F4 Editor | depende de F2 |
| 7 | F6 Publicação | depende de F2 + aprovações |
| 8 | F5 Planejamento | depende de F2 |

Cada etapa é entregável e utilizável isoladamente. Nenhuma exige refatorar a anterior — é isso que a fronteira do M.2 compra.

---

# F1 — IDENTIDADE DE MARCA AUTOMÁTICA

## F1.1 Requisitos

| ID | Requisito |
|---|---|
| RF-1.1 | Informar o @ do Instagram (ou URL do site) e o sistema monta o Brand Kit sozinho |
| RF-1.2 | Extrair logo, paleta, tipografia provável, tom de voz, nicho e contatos |
| RF-1.3 | Toda peça gerada aplica cores, logo e contato automaticamente |
| RF-1.4 | Todo elemento extraído é editável pelo usuário |
| RF-1.5 | Tela de revisão obrigatória antes da marca ficar ativa |
| RF-1.6 | Fallback manual em no máximo 3 passos quando a extração falhar |
| RF-1.7 | Alterar a paleta re-renderiza todas as peças em rascunho |

## F1.2 Estrutura do Brand Kit

```typescript
type BrandKit = {
  // Visual
  logoPrimary: string;        // colorido, fundo transparente
  logoSecondary: string;      // monocromático / negativo
  logoIcon: string;           // símbolo isolado
  palette: {
    primary: string; secondary: string; accent: string;
    neutralDark: string; neutralLight: string;
    textOnPrimary: string;    // calculado por contraste, não escolhido
    textOnLight: string;
  };
  typography: {
    headingFontId: string; bodyFontId: string;
    headingWeight: number; bodyWeight: number;
    headingCase: 'none' | 'uppercase';
  };

  // Verbal
  voiceTone: string;
  voiceAttributes: string[];      // ['autoridade','acolhimento','clareza']
  forbiddenTerms: string[];       // a IA nunca usa
  mandatoryTerms: Record<string,string>;  // grafia exata obrigatória
  languageDefault: string;

  // Negócio
  industry: string;
  targetAudience: string;
  valueProposition: string;
  contentPillars: string[];
  contactInfo: {
    whatsapp?: string; instagram?: string; email?: string;
    site?: string; showOnArt: boolean;
  };
  legalDisclaimer?: string;       // rodapé obrigatório em peças
};
```

## F1.3 Pipeline de extração

```
[input: @username ou URL]
   │
   ├─ FONTE A — Instagram Business Discovery
   │    GET /{ig-user-id}?fields=business_discovery.username(USER)
   │        {profile_picture_url,biography,website,followers_count,
   │         media.limit(24){media_url,caption,like_count}}
   │    ⚠ exige token de alguma conta IG Business já conectada ao app
   │
   ├─ FONTE B (fallback) — scraping do site
   │    og:image, favicon, /logo.svg, texto institucional
   │
   ├─ PALETA
   │    1. logo → remoção de fundo → k-means (k=5) no espaço LAB
   │    2. últimos 24 posts → k-means agregado, peso por engajamento
   │    3. descartar clusters com saturação < 8% (fundos neutros)
   │    4. ordenar por frequência × saturação → primary, secondary, accent
   │    5. textOnPrimary calculado por contraste WCAG AA (≥ 4.5:1)
   │
   ├─ TIPOGRAFIA
   │    classificação (serif / sans / display / script) nos posts
   │    → mapear para a biblioteca própria de fontes licenciadas
   │    ⚠ nunca prometer "sua fonte exata"; prometer "fonte compatível"
   │
   └─ VERBAL (LLM)
        input: bio + 24 legendas + texto do site
        output: { industry, targetAudience, valueProposition,
                  voiceTone, voiceAttributes[], mandatoryTerms{},
                  contentPillars[] }
```

## F1.4 Aplicação da marca — regra do token

Nenhum template guarda valor literal de cor, fonte ou logo. Só tokens:

```json
{ "type": "rect",    "fill": "{{brand.palette.primary}}" }
{ "type": "textbox", "fontFamily": "{{brand.typography.headingFont}}",
                     "fill": "{{brand.palette.textOnPrimary}}",
                     "text": "{{slots.headline}}" }
{ "type": "image",   "src": "{{brand.logoSecondary}}",
                     "meta": { "role": "logo", "brandLocked": true } }
```

O `BrandResolver` substitui os tokens antes de qualquer render. É isso que faz RF-1.7 funcionar de graça.

## F1.5 Critérios de aceite

- Brand Kit montado em **< 25 s** a partir de um @ público Business
- `textOnPrimary` com contraste ≥ 4.5:1 sobre `primary` em **100%** dos casos
- Falha de extração **nunca** bloqueia o usuário — cai para wizard manual

---

# F2 — GERAÇÃO DE CONTEÚDO COM IA

## F2.1 Requisitos

| ID | Requisito |
|---|---|
| RF-2.1 | Gerar post completo (arte + legenda + hashtags + alt text) a partir de uma ideia em texto |
| RF-2.2 | Gerar N variações numa chamada (padrão 4, máx 12) |
| RF-2.3 | Aceitar imagem de referência para guiar a estética |
| RF-2.4 | Aceitar imagens próprias do usuário como conteúdo da peça |
| RF-2.5 | Controlar o comprimento da legenda (curta / média / longa) |
| RF-2.6 | Gerar em 15+ idiomas mantendo a voz de marca |
| RF-2.7 | "Melhorar prompt" — refinar brief vago, custo 0 créditos |
| RF-2.8 | Gerar carrossel com narrativa conectada entre slides |
| RF-2.9 | Regenerar só a legenda, sem refazer a arte |
| RF-2.10 | Ideias diárias por nicho, custo 0 créditos |

## F2.2 Pipeline

```
BRIEF
{ brandId, formatId, idea, archetype?, objective?, captionLength,
  language, variations: 4, referenceImageUrl?, userAssetIds[] }
      │
      ▼
[1] ENRICHMENT  (0 créditos, modelo barato)
    LLM + Brand Kit → normaliza objetivo, sugere arquétipo,
    expande brief vago em brief acionável
      │
      ▼
[2] COPY  (structured output obrigatório)
    system: voz de marca + termos proibidos + termos obrigatórios
            + guardrails de compliance (F2.5)
            + maxChars de CADA slot do formato alvo
      │
      ▼
[3] TEMPLATE MATCHING  (determinístico, sem LLM)
    filtra por formatId + archetype + styleTags ∩ marca
    score = compatSlots×0.5 + diversidade×0.3 + performance×0.2
    seleciona N templates DISTINTOS para as N variações
      │
      ▼
[4] MÍDIA
    prioridade: userImages > biblioteca da marca > geração IA > stock
    geração IA: prompt derivado do brief + estética da marca
                + referenceImage (image-to-image, strength 0.35)
      │
      ▼
[5] RESOLUÇÃO DA CENA
    BrandResolver (tokens) → SlotFiller (copy) → AutoFit (texto)
      │
      ▼
[6] RENDER → PNG por slide → assets + slides
      │
      ▼
CONTENT (status = draft) com N variações
```

## F2.3 Contrato de saída do LLM

Schema único, usado como tool schema, validador da resposta e tipo do cliente:

```typescript
{
  archetype: 'promocao'|'dica'|'fato'|'noticia'|'lancamento'|'depoimento'
           |'carrossel_narrativo'|'pergunta'|'antes_depois'|'checklist'
           |'citacao'|'erro_comum',
  hook: string,              // max 80
  headline: string,          // max 62  ← vem do slot, não fixo
  subheadline?: string,      // max 90
  bodyPoints?: string[],
  cta: string,               // max 32
  slides?: Array<{           // só carrossel
    position: number,
    role: 'cover'|'body'|'cta',
    headline: string,        // max 48
    body?: string            // max 220
  }>,
  caption: string,
  hashtags: string[],        // max 30
  altText: string            // max 200
}
```

**Os `maxChars` vêm do template selecionado e entram no prompt.** Prevenção é melhor que truncamento — é o que evita arte com texto estourado.

Se o `safeParse` falhar: **uma** retentativa com o erro de validação no prompt. Segunda falha → erro e estorno de crédito.

## F2.4 Auto-fit de texto

Algoritmo determinístico, roda depois do preenchimento:

```
1. medir com o fontSize declarado no slot
2. se não couber:
   a. reduzir fontSize de 2 em 2px até minFontSize
   b. reduzir lineHeight até 0.95
   c. truncar por PALAVRA + reticências
   d. registrar overflowWarning no slide
3. se sobrar > 35% de espaço vertical:
   aumentar fontSize até maxFontSize  (evita peça "vazia")
4. respeitar SEMPRE a safeArea do formato
```

Todo slot de texto declara: `minFontSize`, `maxFontSize`, `maxChars`, `maxLines`.

## F2.5 Guardrails de compliance — obrigatório

Camada fixa no system prompt, parametrizada por marca:

```
REGRAS INEGOCIÁVEIS:
- Nunca prometer resultado, prazo ou aprovação de processo.
- Nunca usar os termos: {brand.forbiddenTerms}
- Grafia exata obrigatória: {brand.mandatoryTerms}
- Incluir o disclaimer {brand.legalDisclaimer} quando existir.
- Não citar preço, prazo ou percentual que não esteja no brief.
- Não afirmar fato jurídico, médico ou financeiro sem fonte no brief.
```

Validação **pós-geração** (determinística, não confia no LLM): varredura por `forbiddenTerms` e por padrões de promessa (`garantid*`, `100%`, `em X meses`, `aprovação certa`). Match → regenera uma vez; segundo match → devolve para revisão humana com o trecho destacado.

> Em operação regulada, esta camada é o que separa marketing de infração disciplinar. Não é opcional e não pode viver só no prompt.

## F2.6 Critérios de aceite

- 4 variações completas (copy + arte renderizada) em **< 40 s**
- Zero peças com texto estourando a caixa em 200 gerações de amostra
- Zero ocorrências de `forbiddenTerms` no conteúdo entregue ao usuário
- As 4 variações usam **4 templates distintos**

---

# F3 — FORMATOS E MOTOR DE TEMPLATES

## F3.1 Matriz de formatos

⚠ **Correção de premissa importante:** o "carrossel do LinkedIn" que aparece nas ferramentas de mercado **não é carrossel swipeable**. O LinkedIn removeu o carrossel multi-imagem orgânico; hoje carrossel real é documento PDF/PPTX, e a documentação oficial declara que via API só existe carrossel **patrocinado**. O que a API suporta organicamente é **multi-image post**. Não prometa carrossel swipeable automático no LinkedIn.

| formatId | Rede | Placement | Tipo | Dimensão | Slides | API |
|---|---|---|---|---|---|---|
| `ig_feed_square` | Instagram | Feed | single | 1080×1080 | 1 | ✅ |
| `ig_feed_portrait` | Instagram | Feed | single | 1080×1350 | 1 | ✅ |
| `ig_feed_landscape` | Instagram | Feed | single | 1080×566 | 1 | ✅ |
| `ig_carousel_square` | Instagram | Feed | carousel | 1080×1080 | 2–10 | ✅ |
| `ig_carousel_portrait` | Instagram | Feed | carousel | 1080×1350 | 2–10 | ✅ |
| `ig_story` | Instagram | Stories | single | 1080×1920 | 1 | ✅ |
| `ig_story_sequence` | Instagram | Stories | sequência | 1080×1920 | 2–10 | ⚠ N posts consecutivos |
| `fb_feed_square` | Facebook | Feed | single | 1080×1080 | 1 | ✅ |
| `fb_feed_portrait` | Facebook | Feed | single | 1080×1350 | 1 | ✅ |
| `fb_feed_landscape` | Facebook | Feed | single | 1200×630 | 1 | ✅ |
| `fb_multiphoto` | Facebook | Feed | carousel | 1080×1080 | 2–10 | ✅ |
| `fb_story` | Facebook | Stories | single | 1080×1920 | 1 | ✅ |
| `li_feed_square` | LinkedIn | Feed | single | 1200×1200 | 1 | ✅ |
| `li_feed_portrait` | LinkedIn | Feed | single | 1080×1350 | 1 | ✅ |
| `li_feed_landscape` | LinkedIn | Feed | single | 1200×627 | 1 | ✅ |
| `li_multiimage` | LinkedIn | Feed | multi-image | 1200×1200 | 2–9 | ✅ |
| `li_document` | LinkedIn | Feed | carousel PDF | 1080×1080 | 2–20 | ❌ export manual |

**Safe areas obrigatórias:**

| Contexto | Topo | Base | Laterais |
|---|---|---|---|
| Stories (IG/FB) | 250px | 250px | 60px |
| Feed Instagram | 60px | 60px | 60px |
| Feed Facebook | 60px | 60px | 60px |
| Feed LinkedIn | 80px | 80px | 60px |

`ig_story_sequence`: **não existe carrossel de Stories na API.** Implementar como N publicações consecutivas com intervalo de 3–5 s, agrupadas numa mesma `content`.

## F3.2 Estrutura de um template

```json
{
  "formatId": "ig_carousel_portrait",
  "archetype": "carrossel_narrativo",
  "styleTags": ["editorial", "autoridade"],
  "slidePattern": ["cover", "body*", "cta"],
  "slots": {
    "cover": {
      "headline": { "maxChars": 62, "maxLines": 3,
                    "minFontSize": 44, "maxFontSize": 88 },
      "eyebrow":  { "maxChars": 24, "maxLines": 1 },
      "image":    { "required": false, "fit": "cover" }
    },
    "body": {
      "headline": { "maxChars": 48, "maxLines": 2 },
      "body":     { "maxChars": 220, "maxLines": 7 }
    },
    "cta": {
      "headline": { "maxChars": 40 },
      "ctaText":  { "maxChars": 32 }
    }
  },
  "sceneByRole": { "cover": {...}, "body": {...}, "cta": {...} }
}
```

## F3.3 Meta obrigatória em cada objeto da cena

```json
"meta": {
  "slotKey": "headline",
  "role": "text|image|logo|decoration|background",
  "editable": true,
  "brandLocked": false,   // true = usuário não altera (logo, disclaimer)
  "autoFit": true,
  "zLock": false
}
```

## F3.4 Estratégia de biblioteca

12 arquétipos × 4 estilos × 17 formatos ≈ 240 templates. Desenhar tudo à mão é inviável.

**Abordagem:** desenhar **12 sistemas de layout paramétricos** (grid, proporção, hierarquia tipográfica, posição do logo) e derivar variações por combinação estilo × formato. Reduz o trabalho manual a ~48 peças-base.

## F3.5 Critérios de aceite

- Render do browser e do servidor com diferença visual < 1% (comparação `pixelmatch` em 50 cenas de referência, no CI)
- Nenhum elemento fora da safe area em 100% dos templates
- Todo template renderiza sem erro em todos os Brand Kits de teste (paletas claras, escuras e monocromáticas)

---

# F4 — EDITOR DE DESIGN COM IA

## F4.1 Requisitos

| ID | Requisito |
|---|---|
| RF-4.1 | Editar texto, fonte, cor, tamanho, posição, opacidade e ordem de camadas |
| RF-4.2 | Upload de imagem própria com crop dentro de frame |
| RF-4.3 | Biblioteca de mídia: assets da marca + gerados + stock |
| RF-4.4 | Remoção de fundo em 1 clique |
| RF-4.5 | Chat de edição em linguagem natural |
| RF-4.6 | Edição de imagem por IA (inpainting, expand, troca de fundo) |
| RF-4.7 | Undo/redo com histórico de 50 passos |
| RF-4.8 | Snap, guias de alinhamento e réguas |
| RF-4.9 | Trocar de template preservando o conteúdo |
| RF-4.10 | Aplicar uma alteração a todos os slides do carrossel |
| RF-4.11 | Preview por rede (como aparece no feed real) |

## F4.2 Chat de edição — arquitetura

**O LLM nunca manipula o canvas.** Ele emite comandos tipados, validados por schema:

```typescript
type EditCommand =
  | { op:'setText';      slotKey:string; value:string }
  | { op:'setStyle';     slotKey:string;
      props: Partial<{ fontSize:number; fill:string; fontWeight:number;
                       textAlign:string; fontFamily:string; opacity:number }> }
  | { op:'move';         slotKey:string; dx:number; dy:number }
  | { op:'resize';       slotKey:string; scale:number }
  | { op:'setImage';     slotKey:string; assetId:string }
  | { op:'reorderLayer'; slotKey:string; direction:'up'|'down'|'front'|'back' }
  | { op:'setPalette';   role:'primary'|'secondary'|'accent'; hex:string }
  | { op:'swapTemplate'; templateId:string }
  | { op:'applyToAll';   command: EditCommand };
```

```
mensagem do usuário
   → LLM (tool calling) → EditCommand[]
   → validate(schema)
   → guards
   → apply(scene) → autoFit() → render preview → persist + histórico
```

## F4.3 Guards antes de aplicar — obrigatórios

| Condição | Ação |
|---|---|
| Objeto com `brandLocked: true` | rejeita e explica ao usuário |
| Objeto sairia da safe area | clampa para dentro |
| Contraste texto/fundo < 4.5:1 | aplica, mas emite aviso visível |
| `fontSize` fora de `[min,max]` do slot | clampa |
| Comando referencia `slotKey` inexistente | rejeita silenciosamente e pede esclarecimento |

## F4.4 Histórico

Não guardar cópia da cena inteira a cada passo. Guardar **patches JSON (RFC 6902)** em memória no cliente, com snapshot completo a cada 10 operações. Persistir apenas snapshots.

## F4.5 Critérios de aceite

- Comando em linguagem natural aplicado corretamente em ≥ 90% de um conjunto de 50 frases de teste
- Nenhum comando consegue alterar elemento `brandLocked`
- Undo/redo sem perda de estado em 200 operações encadeadas
- Preview do editor idêntico ao PNG exportado

---

# F5 — PLANEJAMENTO, IDEIAS E CALENDÁRIO

## F5.1 Requisitos

| ID | Requisito |
|---|---|
| RF-5.1 | Ideias diárias de conteúdo por nicho (0 créditos) |
| RF-5.2 | Gerar calendário editorial de 7 / 15 / 30 dias com tema e formato por dia |
| RF-5.3 | Visualização mês/semana com drag-and-drop para reagendar |
| RF-5.4 | Sugerir melhor horário por rede |
| RF-5.5 | Converter ideia → conteúdo em 1 clique |
| RF-5.6 | Pilares de conteúdo configuráveis por marca |
| RF-5.7 | Datas de bloqueio (feriados, luto, blackout) por marca |

## F5.2 Geração de calendário

```
INPUT: { brandId, periodDays, objective, cadencePerWeek, networks[], pillars[] }

[1] carregar Brand Kit + pilares + histórico dos últimos 60 dias
[2] LLM → plano estruturado:
      [{ date, pillar, archetype, formatId, title, angle,
         rationale, suggestedTime }]
[3] REGRAS DETERMINÍSTICAS aplicadas DEPOIS do LLM:
      - nunca dois dias seguidos com o mesmo arquétipo
      - nenhum pilar abaixo de 15% da distribuição
      - no máximo 1 peça promocional a cada 4 (regra 80/20)
      - respeitar datas sazonais e blackout dates da marca
      - respeitar cadência por rede
[4] persistir como ideias + plano
```

O passo [3] é o que impede o calendário genérico que todo gerador entrega. O LLM propõe, o motor corrige.

## F5.3 Melhores horários

**v1 — heurística por rede**, no fuso do público-alvo (não do usuário):

| Rede | Janelas |
|---|---|
| Instagram | 11h–13h · 18h–21h |
| Facebook | 9h–11h · 19h–21h |
| LinkedIn | ter–qui · 8h–10h e 17h–18h |

**v2 —** percentil de engajamento dos últimos 90 dias do próprio perfil (depende de módulo de analytics).

## F5.4 Critérios de aceite

- Calendário de 30 dias gerado em < 30 s
- Nenhum pilar abaixo de 15% em 20 calendários de amostra
- Drag-and-drop reagenda a publicação atrelada sem recriar o conteúdo

---

# F6 — PUBLICAÇÃO E AGENDAMENTO NATIVO

## F6.1 Bloqueantes externos — começar na semana 1

**Nada aqui funciona sem aprovação de terceiros. Prazos reais:**

| Rede | Requisito | Prazo |
|---|---|---|
| Meta | App + Business Verification | 1–3 semanas |
| Meta | App Review: `instagram_business_basic`, `instagram_business_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management` | 2–4 semanas **por submissão** |
| Meta | Advanced Access (publicar em Pages de terceiros) | +1–2 semanas |
| LinkedIn | **Community Management API** — produto restrito, exige aprovação de parceria | 4–8 semanas, **com risco real de negativa** |
| LinkedIn | Scopes `w_member_social` e `w_organization_social` | junto do acima |

**Motivo nº 1 de reprovação no App Review da Meta: justificativa genérica.** Escrever citando o fluxo exato — *"O app permite que equipes de marketing agendem e publiquem posts na sua Página do Facebook a partir de um calendário editorial. `pages_manage_posts` é necessário para criar o post na Página quando o horário agendado chega."* — e gravar screencast do fluxo real funcionando.

**Plano B enquanto não há aprovação:** modo **Publicação Assistida** — o sistema renderiza, prepara a legenda e envia notificação com a peça e o texto prontos para colar. Mantém o produto utilizável durante a espera e vale como fallback permanente para `li_document`.

## F6.2 Requisitos

| ID | Requisito |
|---|---|
| RF-6.1 | Conectar contas de Instagram, Facebook Page e LinkedIn via OAuth |
| RF-6.2 | Publicar imediatamente ou agendar data/hora com fuso |
| RF-6.3 | Publicar o mesmo conteúdo em várias contas numa ação |
| RF-6.4 | Editar ou cancelar publicação agendada até o disparo |
| RF-6.5 | Renderizar a arte **no momento da publicação**, não no agendamento |
| RF-6.6 | Retry automático com backoff e limite de 3 tentativas |
| RF-6.7 | Notificar o usuário em falha permanente ou token expirado |
| RF-6.8 | Verificação diária de saúde dos tokens |
| RF-6.9 | Guardar o permalink do post publicado |
| RF-6.10 | Download da peça para publicação manual |

**RF-6.5 é regra, não preferência.** Renderizar no agendamento significa que qualquer edição posterior é perdida. Renderizar no disparo permite editar até o último minuto.

## F6.3 Instagram — fluxo

Modelo de **container em 3 passos**. Exige conta Professional (Business ou Creator) vinculada a uma Página do Facebook. **A mídia precisa estar numa URL pública** — o Instagram baixa do seu CDN, não aceita upload de arquivo.

**Post único:**
```
POST /{ig-user-id}/media?image_url={publicUrl}&caption={caption}&alt_text={alt}
  → creationId
GET  /{creationId}?fields=status_code     → poll até FINISHED
POST /{ig-user-id}/media_publish?creation_id={creationId}
  → mediaId
```

**Carrossel:**
```
para cada slide (2 a 10):
  POST /{ig-user-id}/media?image_url={url}&is_carousel_item=true → childId

POST /{ig-user-id}/media
     ?media_type=CAROUSEL
     &children=id1,id2,id3        ← STRING com vírgulas, NÃO array JSON
     &caption={caption}           ← legenda só no container PAI
  → parentId
poll parentId até FINISHED
POST /{ig-user-id}/media_publish?creation_id={parentId}
```

**Stories:** `media_type=STORIES`. O campo `caption` é **ignorado**.

**Armadilhas confirmadas:**
- `VIDEO` está depreciado para post único — usar `REELS`. Continua válido para filhos de carrossel.
- Publicar container ainda `IN_PROGRESS` **falha**. Sempre fazer poll.
- **Container expira (~24h).** Criar o container **no momento do disparo**, nunca no agendamento. Se criar antes, ter lógica de recriação.
- Limite: **50–100 publicações / 24h por conta**, contado no `media_publish` (não na criação de container). Carrossel conta como 1.
- Rate limit prático: ~200 requisições/hora por conta.
- `alt_text` só para imagens — não suportado em Reels e Stories.

## F6.4 Facebook Page — fluxo

Publica **apenas em Páginas**. Perfil pessoal foi removido da API em 2018 (`publish_actions`), sem substituto.

```
# Texto / link
POST /{page-id}/feed?message={texto}&link={url}
     [&published=false&scheduled_publish_time={unix}]

# Foto única
POST /{page-id}/photos?url={publicUrl}&caption={texto}

# Multi-foto
1) para cada imagem: POST /{page-id}/photos?url={url}&published=false → photoId
2) POST /{page-id}/feed?message={texto}
        &attached_media[0]={"media_fbid":"id1"}
        &attached_media[1]={"media_fbid":"id2"}

# Stories
POST /{page-id}/photo_stories   (ou /video_stories)
⚠ a mídia NÃO pode ter sido usada em post já publicado
```

**Agendamento nativo disponível:** `published=false` + `scheduled_publish_time` (UNIX), janela de 10 minutos a 6 meses. **Manter como modo opcional**, não padrão — usar a fila própria mantém consistência de UX, cancelamento e RF-6.5 nas três redes.

**Token:** Page Access Token derivado de long-lived user token **não expira**, mas é invalidado se o usuário trocar a senha, revogar o app ou perder o papel na Página. Daí RF-6.8.

## F6.5 LinkedIn — fluxo

Endpoint único: `POST /rest/posts` (a UGC Posts API está depreciada).
Headers obrigatórios: `LinkedIn-Version: YYYYMM` e `X-Restli-Protocol-Version: 2.0.0`.
Autor: `urn:li:person:{id}` ou `urn:li:organization:{id}`.

```
POST /rest/images?action=initializeUpload
  { "initializeUploadRequest": { "owner": "urn:li:organization:123" } }
  → { uploadUrl, image: "urn:li:image:XXX", uploadUrlExpiresAt }

PUT {uploadUrl}   (binário)

POST /rest/posts
{
  "author": "urn:li:organization:123",
  "commentary": "texto do post",
  "visibility": "PUBLIC",
  "distribution": { "feedDistribution": "MAIN_FEED",
                    "targetEntities": [], "thirdPartyDistributionChannels": [] },
  "content": { "media": { "id": "urn:li:image:XXX", "altText": "..." } },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
→ 201, ID no header x-restli-id
```

**Multi-imagem:** `content.multiImage.images[]`, de 2 a 9.

**Restrições confirmadas:**
- ❌ Carrossel orgânico — não suportado via API (só patrocinado)
- ❌ Artigos e newsletters — só pela interface web
- ❌ Enquetes
- ❌ **Não há agendamento nativo** — 100% pela sua fila
- ⚠ Documento/PDF: tratar como export manual na v1
- Rate limit: ~100 chamadas/dia por membro
- **Token de 60 dias, refresh de 365** → job de refresh automático é obrigatório. É a causa nº 1 de falha silenciosa em integrações LinkedIn.

## F6.6 Máquina de estados

```
scheduled ──► rendering ──► uploading ──► processing ──► published
     │            │             │              │
     │            └─────────────┴──────────────┘
     │                          ▼
     └──► cancelled          failed ──(retry ≤3)──► rendering
                                │
                                └──(esgotado)──► failed_permanent
```

Backoff: 1 min → 5 min → 20 min.

## F6.7 Job de publicação

```typescript
async function publishJob(publicationId: string) {
  const pub = await lockPublication(publicationId);   // FOR UPDATE SKIP LOCKED
  if (pub.status !== 'scheduled') return;

  // 1. Saúde do token ANTES de gastar CPU renderizando
  const account = await getSocialAccount(pub.socialAccountId);
  if (!(await isTokenHealthy(account))) {
    return fail(pub, 'TOKEN_INVALID', { notifyUser: true, retryable: false });
  }

  // 2. Render agora — RF-6.5
  await setStatus(pub, 'rendering');
  const assets = await renderContent(pub.contentId);  // → CDN, URL pública, TTL ≥ 48h

  // 3. Adapter por rede
  await setStatus(pub, 'uploading');
  const result = await adapters[account.network].publish({
    account, content: pub.content, assets, idempotencyKey: pub.idempotencyKey
  });

  await markPublished(pub, result.externalId, result.permalink);
}
```

**Idempotência:** `idempotencyKey = sha256(contentId + socialAccountId + scheduledFor)`. Antes de publicar, consultar os últimos posts da conta e comparar hash de mídia — cobre o caso de timeout na resposta com sucesso do lado da rede.

**Rate limit por conta:** token bucket com chave `socialAccountId`. IG: 50 publish/24h, 200 req/h. LinkedIn: 100 chamadas/dia. Estourar limite de rede gera bloqueio que você não reverte rápido.

## F6.8 Critérios de aceite

- Publicação dispara com desvio ≤ 60 s do horário agendado
- **Zero posts duplicados** em 1.000 publicações com falhas de rede injetadas
- Token expirado gera notificação **antes** do horário agendado
- Fuso horário correto inclusive em transição de horário de verão (armazenar `timestamptz` + IANA tz, nunca offset fixo)

---

# F7 — LINKS: BIO PAGE COM CAPTURA DE LEADS

## F7.1 Requisitos

| ID | Requisito |
|---|---|
| RF-7.1 | Página pública em `/{slug}` + domínio customizado |
| RF-7.2 | Blocos ordenáveis por drag-and-drop |
| RF-7.3 | Formulário de captura com consentimento RGPD |
| RF-7.4 | Tema herdado automaticamente do Brand Kit |
| RF-7.5 | Analytics: views, cliques por bloco, taxa de conversão, origem |
| RF-7.6 | Pixels (Meta, GA4, TikTok) com Consent Mode |
| RF-7.7 | Webhook de saída assinado por lead capturado |
| RF-7.8 | Agendamento de blocos (aparecem/somem por data) |
| RF-7.9 | Bloco de WhatsApp com mensagem pré-preenchida e UTM |
| RF-7.10 | Export de leads em CSV |

## F7.2 Tipos de bloco

| Tipo | Config |
|---|---|
| `link` | `{label, url, icon, style, highlight}` |
| `whatsapp` | `{phone, prefilledMessage, utmSource}` |
| `lead_form` | `{leadFormId, mode:'inline'\|'modal', buttonLabel}` |
| `video` | `{provider, url, autoplay:false}` |
| `text` | `{markdown}` |
| `image` | `{assetId, linkUrl?, alt}` |
| `social_icons` | `{networks:[{network,url}]}` |
| `faq` | `{items:[{q,a}]}` |
| `countdown` | `{targetAt, label, onExpire}` |
| `product_card` | `{title, price, image, ctaUrl}` |
| `calendar_embed` | `{provider, url}` |
| `divider` | `{style}` |

## F7.3 Performance — requisito, não otimização

A bio page é o destino de tráfego pago. Cada 100 ms custa conversão.

- SSG/ISR com revalidação de 60 s
- **Sem framework pesado no público**: HTML + CSS + ~4 KB de JS para tracking e formulário
- Imagens em WebP/AVIF com `srcset`
- `font-display: swap`, preload só do peso principal
- **Meta: LCP < 1,2 s em 4G**

## F7.4 Conformidade RGPD — obrigatório

Operação atinge titulares na UE; RGPD é norma primária.

1. **Consentimento (art. 4(11) e 7):** checkbox **não pré-marcado**; texto do consentimento salvo como **snapshot no registro do lead** — a prova é da versão aceita naquele momento, não da versão atual da página; timestamp e finalidade registrados.
2. **Separação de finalidades:** contato sobre o serviço ≠ marketing. Dois checkboxes quando houver duas finalidades.
3. **Minimização (art. 5(1)(c)):** só campos com finalidade declarada. **IP hasheado**, nunca em claro.
4. **Direitos do titular:** acesso, retificação, apagamento e portabilidade. Job de retenção que apaga leads após período configurável por marca.
5. **Pixels:** nenhum dispara antes do aceite. Banner com granularidade (necessários / analytics / marketing). Meta Pixel em Consent Mode v2.
6. **Política de Privacidade:** link obrigatório e validado — o campo é `not null` por design.
7. **Transferência internacional:** se o CRM de destino estiver fora do EEE, documentar a base legal (SCCs).

## F7.5 Fluxo de submissão

```
POST /api/public/forms/{formId}/submit
{ fields, consent: true, utm, honeypot: "", turnstileToken }
   │
   ├─ honeypot vazio + rate limit por hash de IP + Turnstile
   ├─ valida campos obrigatórios contra o schema do formulário
   ├─ exige consent === true quando consentRequired
   ├─ grava lead + consentTextSnapshot + consentAt + ipHash
   ├─ se doubleOptin → email de confirmação, status 'pending'
   ├─ dispara webhook de saída (assíncrono, HMAC, retry 5×)
   ├─ registra evento 'form_submit'
   └─ retorna successAction
```

**Anti-spam:** honeypot + rate limit + Turnstile invisível. Nunca reCAPTCHA v2 visível — mata conversão.

## F7.6 Critérios de aceite

- LCP < 1,2 s em 4G simulado
- 100% dos leads com snapshot de consentimento e timestamp
- Nenhum pixel dispara antes do aceite (verificável no DevTools)
- Webhook entregue ou marcado como falho após 5 tentativas, com log consultável

---

# F8 — CRÉDITOS POR AÇÃO

## F8.1 Tabela de custos

Crédito **por ação**, não por post. Ações de planejamento custam 0 — reduz atrito e aumenta engajamento.

| Ação | Créditos |
|---|---|
| `generate_post` (até 4 variações) | 15 |
| `generate_variation_extra` (por variação adicional) | 4 |
| `generate_carousel` (por slide após o 3º) | 3 |
| `generate_image_ai` | 8 |
| `edit_image_ai` | 6 |
| `remove_background` | 2 |
| `regenerate_caption` | 2 |
| `generate_idea` | 0 |
| `generate_calendar` | 0 |
| `improve_prompt` | 0 |
| `chat_editor` | 0 |
| `render` / `publish` / `download` | 0 |

**Custo real estimado por geração completa:** ~$0,05–0,09 (enrichment + copy 4 variações + 1 imagem IA + render). Precificar o crédito com margem mínima de **4×**.

## F8.2 Regras

- **Reservar antes de executar.** Debitar → chamar LLM → estornar em caso de falha. Debitar depois abre brecha para consumo infinito em requisições concorrentes.
- **Estorno automático** em falha de sistema, com `action = 'refund:{acaoOriginal}'`.
- **Sem estorno** quando a falha é de conteúdo bloqueado nos guardrails de compliance.
- Débito atômico com verificação de saldo na mesma operação — nunca `SELECT` seguido de `UPDATE`.

---

# ANEXO A — ENDPOINTS

```
# Marca
POST   /api/brands/onboard              { instagramUsername | websiteUrl }
GET    /api/brands/:id
PATCH  /api/brands/:id
POST   /api/brands/:id/reprocess-palette

# Geração
POST   /api/contents/generate           → 202 { jobId }
GET    /api/jobs/:id                    → { status, progress, result }
GET    /api/jobs/:id/stream             → SSE
POST   /api/contents/:id/regenerate-caption
POST   /api/prompts/improve             { text } → { improved }   (0 créditos)

# Edição
GET    /api/contents/:id
PATCH  /api/contents/:id/slides/:pos    { scene }
POST   /api/contents/:id/chat-edit      { message, targetSlide? }
POST   /api/contents/:id/swap-template  { templateId }
POST   /api/assets/remove-background    { assetId }
POST   /api/assets/generate             { prompt, aspectRatio, reference? }

# Render
POST   /api/contents/:id/render         { format?: 'png'|'jpg'|'pdf' }
GET    /api/contents/:id/download

# Planejamento
POST   /api/brands/:id/ideas/generate   { count, pillars? }
POST   /api/brands/:id/calendar/generate{ periodDays, objective, cadence }
GET    /api/brands/:id/calendar         ?from=&to=

# Contas sociais
GET    /api/brands/:id/social-accounts
POST   /api/social/:network/oauth/start → { redirectUrl }
GET    /api/social/:network/oauth/callback
DELETE /api/social-accounts/:id
POST   /api/social-accounts/:id/health-check

# Publicação
POST   /api/publications                { contentId, targets[], timezone }
GET    /api/publications                ?status=&from=&to=
PATCH  /api/publications/:id            { scheduledFor }
DELETE /api/publications/:id
POST   /api/publications/:id/retry

# Links
GET    /api/bio-pages/:id
PATCH  /api/bio-pages/:id
POST   /api/bio-pages/:id/blocks
PATCH  /api/bio-pages/:id/blocks/reorder { order: [blockId...] }
GET    /api/bio-pages/:id/analytics      ?from=&to=
GET    /api/leads                        ?formId=&from=&to=
GET    /api/leads/export                 → CSV

# Público (sem auth, rate-limited)
GET    /p/:slug
POST   /api/public/forms/:id/submit
POST   /api/public/events
```

---

# ANEXO B — TABELAS ESPECÍFICAS DOS MÓDULOS

Apenas o que estes módulos adicionam ao schema existente.

```sql
-- F1
brands(id, account_id, name, slug,
       logo_primary_url, logo_secondary_url, logo_icon_url,
       palette jsonb, typography jsonb,
       voice_tone, voice_attributes text[], forbidden_terms text[],
       mandatory_terms jsonb, language_default,
       industry, target_audience, value_proposition, content_pillars text[],
       contact_info jsonb, legal_disclaimer,
       source_ig_username, onboarding_status, created_at)

fonts(id, family, weight, style, file_url_woff2, file_url_ttf,
      license, is_global, brand_id)

-- F3
formats(id text pk, network, placement, kind, width, height,
        aspect_ratio, max_slides, safe_area jsonb, active)

templates(id, format_id, archetype, style_tags text[],
          slots jsonb, scene_by_role jsonb, slide_pattern text[],
          preview_url, is_public, brand_id, version)

-- F2 / F4
contents(id, brand_id, created_by, title, format_id, archetype,
         status, brief jsonb, generation jsonb,
         caption, hashtags text[], language, created_at, updated_at)

content_slides(id, content_id, position, template_id,
               scene jsonb, render_url, render_hash,
               unique(content_id, position))

media_assets(id, brand_id, kind, url, public_url,
             width, height, mime_type, bytes, source_meta jsonb, created_at)

-- F5
content_ideas(id, brand_id, title, angle, archetype, rationale,
              source, suggested_for date, used_content_id, created_at)

calendar_plans(id, brand_id, period_start, period_end,
               objective, cadence jsonb, status)

brand_blackout_dates(id, brand_id, date, reason)

-- F6
social_accounts(id, brand_id, network, external_id, username,
                display_name, avatar_url,
                access_token_enc, refresh_token_enc, token_expires_at,
                scopes text[], linked_page_id, status, last_error jsonb,
                connected_at, unique(brand_id, network, external_id))

publications(id, content_id, social_account_id, scheduled_for, timezone,
             status, attempt_count, idempotency_key unique,
             external_post_id, external_permalink, container_ids text[],
             error jsonb, published_at, created_at)

-- índice do scheduler
create index on publications (status, scheduled_for)
  where status in ('scheduled','failed');

-- F7
bio_pages(id, brand_id, slug unique, custom_domain unique,
          title, headline, bio, avatar_url, cover_url,
          theme jsonb, seo jsonb, pixels jsonb, is_published, created_at)

bio_blocks(id, bio_page_id, position, type, config jsonb,
           is_active, schedule_from, schedule_to)

lead_forms(id, bio_page_id, brand_id, name, fields jsonb,
           consent_text, consent_required, privacy_policy_url,
           success_action jsonb, webhook_url, webhook_secret_enc, double_optin)

leads(id, lead_form_id, brand_id, data jsonb,
      consent_given, consent_text_snapshot, consent_at,
      ip_hash, user_agent, utm jsonb, referrer,
      status, synced_to jsonb, created_at)

bio_events(id bigserial, bio_page_id, block_id, event,
           session_hash, utm jsonb, country, device, created_at)

-- F8
credit_ledger(id bigserial, account_id, delta, action,
              ref_type, ref_id, balance_after, metadata jsonb, created_at)
```

---

# ANEXO C — ORDEM DE IMPLEMENTAÇÃO

Ver **M.6** para a ordem de acoplamento e o que é independente. Critérios de saída de cada etapa:

| Ordem | Módulo | Gate |
|---|---|---|
| 0 | Submeter App Meta + aplicar LinkedIn Partner | protocolado |
| 1 | F7 Links | LCP < 1,2 s · 100% dos leads com snapshot de consentimento |
| 2 | F3 Formatos + motor de render | diff visual browser↔servidor < 1% em 50 cenas |
| 3 | F1 Brand Kit | onboarding < 25 s · contraste WCAG AA em 100% |
| 4 | F2 Geração com IA | 4 variações < 40 s · zero texto estourado em 200 amostras |
| 5 | F8 Créditos (módulo ou adaptador) | débito atômico sem race em teste de concorrência |
| 6 | F4 Editor | chat ≥ 90% de acerto em 50 frases · `brandLocked` inviolável |
| 7 | F6 Publicação | 1.000 publicações, zero duplicatas com falhas injetadas |
| 8 | F5 Planejamento | nenhum pilar abaixo de 15% em 20 calendários |

**F3 antes de F1, F2 e F4 é regra, não sugestão.** Sem o motor de render validado, tudo depois é construído sobre base possivelmente instável — e refazer o motor com o editor pronto custa o editor inteiro.

---

# ANEXO D — RISCOS FUNCIONAIS

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | LinkedIn nega o Community Management API | Alta | Alto | Lançar IG+FB; LinkedIn como Publicação Assistida |
| 2 | App Review da Meta reprovado | Média | Crítico | Screencast do fluxo real, justificativa específica, 2 ciclos no cronograma |
| 3 | Editor renderiza diferente do servidor | Alta | Alto | Mesmo motor + fontes próprias + regressão visual no CI |
| 4 | Texto estourando a arte | Alta | Médio | `maxChars` no prompt + auto-fit determinístico |
| 5 | Token do LinkedIn expira em silêncio (60d) | Alta | Alto | Refresh diário + health-check 6/6h + aviso ao usuário |
| 6 | Post duplicado por timeout de rede | Média | Alto | Idempotency key + verificação de hash de mídia antes de publicar |
| 7 | Container do Instagram expirado no disparo | Média | Médio | Criar container só no momento da publicação |
| 8 | Custo de IA acima da margem | Média | Alto | Cache, modelo barato no enrichment, crédito com margem 4× |
| 9 | Fonte sem licença comercial na biblioteca | Média | Alto | Só SIL-OFL/Apache; campo `license` obrigatório |
| 10 | Conteúdo gerado com promessa de resultado | Média | Crítico | Guardrails F2.5 + validação determinística pós-geração |

---

# PONTOS EM ABERTO

1. **Vídeo/Reels na v1 ou fase 2?** É o formato central da operação de conteúdo hoje. Entra no motor de render (FFmpeg), muda o custo de storage e processamento em ~10×.
2. **Multi-idioma na v1 (pt/en/es/it) ou só pt-BR?** O comprimento de texto varia ~30% entre idiomas — impacta os `maxChars` de todos os templates e o volume de QA.
3. **LinkedIn: seguir com o pedido de parceria ou entregar como Publicação Assistida desde o início?**
4. **Uso interno das suas marcas ou SaaS de mercado?** Se for SaaS, Advanced Access e Business Verification são obrigatórios e mudam o cronograma do módulo F6.
