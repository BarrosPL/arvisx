# Spec: Agente de Gestão de Tráfego Inteligente (Segmentação por Temperatura de Público)

## Contexto
Esta spec traduz os requisitos de negócio definidos por Renan Perrotti (CEO) para o comportamento esperado de um agente/sistema de gestão de tráfego pago (Meta Ads), aplicável a todos os produtos e marcas do ecossistema (Você na Europa, VEM DE VISTO, Nesso Viaggi, Alvance, CAPUS, etc).

## Objetivo
Garantir que **todo lançamento de campanha**, independente do produto, siga uma estrutura mínima de segmentação por temperatura de público, com progressão automática do lead pelo funil e sem repetição de conteúdo já consumido.

---

## 1. Estrutura mínima de campanhas por produto

Todo produto lançado deve ter, no mínimo, as seguintes campanhas ativas simultaneamente:

| Camada | Público | Objetivo |
|---|---|---|
| **Frio** | Público amplo / interesse | Apresentação, quebra de objeção inicial, geração de awareness |
| **Morno** | Quem já viu conteúdo frio | Educar, mostrar a dor, aprofundar a oferta |
| **Quente** | Quem engajou com o morno | Levar à tomada de decisão (oferta, prova social, urgência) |
| **Remarketing** | Quem viu mas não converteu | Reforço em janelas de 20, 60 e 120 dias |
| **1%** | Lookalike da base de clientes/convertidos | Escala de aquisição |

## 2. Regra de progressão automática de público (funil dinâmico)

O sistema deve simular uma esteira de avanço do lead, evitando que ele receba conteúdo repetido:

1. Lead novo → entra em **Frio**.
2. Após período de exposição (ex.: 15 dias) ou engajamento → move para **Morno**.
   - A partir desse momento, **para de receber vídeos de Frio**.
3. Se engajar com Morno (visualização, clique, etc.) → move para **Quente**.
   - Para de receber vídeos de Morno.
4. Se visualizar Quente e **não converter** → entra em **Remarketing**.
   - Remarketing tem sub-janelas: **20 dias / 60 dias / 120 dias**, com mensagens diferentes a cada etapa (não é repetição do mesmo anúncio).
5. Se não converter após o ciclo de remarketing → **não deve mais ver os vídeos anteriores**; o sistema deve sinalizar necessidade de **nova estratégia/criativo** para tentar recuperar esse lead.
6. Todo lead que "já viu e não converteu em determinada etapa" deve ser **negativado** (excluído via públicos personalizados de exclusão) das camadas anteriores.

> Regra-chave citada literalmente: *"já viu, não deu certo, já nega o lead do frio, do morno, do quente — ele não vai ver de novo esses vídeos."*

## 3. Segmentação de criativos por "gancho" dentro de cada produto

Para cada produto, a régua de criativos deve cobrir os diferentes ganchos/personas de entrada, não apenas um vídeo genérico. 

**Exemplo dado (Nacionalidade Portuguesa):**
- Vídeo para neto
- Vídeo para bisneto
- Vídeo para casamento
- Vídeo para JD (Jus Diversitatis) ou outro
- Vídeo para tempo de residência

Cada um desses ganchos deve ter sua própria variação de Frio/Morno/Quente — não é obrigatório multiplicar todas as camadas por todos os ganchos ao mesmo tempo, mas o banco de criativos precisa cobrir essas personas.

## 4. Inteligência competitiva e histórico (obrigatório antes de cada lançamento)

Antes de subir uma campanha nova, o sistema/agente deve:

1. **Analisar concorrentes**: buscar na Biblioteca de Anúncios (Meta Ad Library) o que concorrentes diretos estão publicando atualmente.
2. **Identificar ganchos virais/notícias recentes** que possam ser aproveitados no criativo.
3. **Analisar histórico próprio** em múltiplas janelas de lookback, não apenas 30 dias:
   - 30 / 60 / 90 / 120 / 360 / 720 dias.
   - Motivo: o mercado é cíclico — um criativo/estratégia que funcionou há mais tempo pode voltar a funcionar e não deve ser descartado só por estar "parado".
4. **Avaliar performance passada**: o que funcionou, o que pode melhorar, o que precisa ser recriado.
5. Regra de agilidade: se um criativo não estiver performando, deve ser **trocado rapidamente** — não manter anúncio estático esperando.

## 5. Regras de exclusão / públicos negativos

- Manter sempre as **listas de exclusão atualizadas** por camada (quem já está em Morno não deve ser alvo de Frio; quem já está em Quente não deve ser alvo de Morno; etc.).
- Excluir de remarketing quem já converteu.
- Excluir de todas as camadas anteriores quem completou o ciclo sem conversão e entrou em "nova estratégia".

## 6. Aplicabilidade

Esta estrutura é **padrão obrigatório** para qualquer produto/serviço lançado no ecossistema, incluindo mas não se limitando a:
- Cidadania Portuguesa
- Cidadania Italiana
- Vistos (VEM DE VISTO)
- Nesso Viaggi
- Alvance (Seguros/Consórcio)
- CAPUS (curso)

## 7. Critérios de aceite (para o desenvolvimento do agente)

- [ ] Toda campanha nova criada automaticamente já contempla as 4-5 camadas (Frio, Morno, Quente, Remarketing 20/60/120, 1%).
- [ ] Sistema move automaticamente o lead entre camadas conforme regra de engajamento/tempo.
- [ ] Sistema aplica exclusão automática do público já avançado na camada anterior.
- [ ] Antes de sugerir/lançar campanha, o agente traz um resumo de: concorrentes ativos (Ad Library), ganchos/notícias do momento, e performance histórica em múltiplas janelas (30/60/90/120/360/720 dias).
- [ ] Alerta automático quando um criativo cai de performance, sugerindo substituição.
- [ ] Banco de criativos organizado por gancho/persona dentro de cada produto (ex.: neto, bisneto, casamento, JD, tempo de residência).

---

## Transcrição original (referência)

> Lembra o que eu espero, um gestor de tráfego de muita inteligência, que ele tenha sempre uma campanha direcionada ao público frio, uma campanha público morno, pelo menos, e uma campanha público quente. É uma campanha de remarketing para aquelas pessoas que já viram a gente, em 20 dias, 60 dias, 120 dias, e uma campanha de 1%. [...] Então já viu para o PPP, não deu certo, já negativa o Lucas não frio no morno no quente. Ele não vai remarquetar esses vídeos. É isso que eu quero. Só que isso é para a portuguesa, para a italiana, para tudo que a gente for vender, essa mesma base.

*(transcrição resumida/organizada a partir do áudio enviado em 03/08/2026)*
