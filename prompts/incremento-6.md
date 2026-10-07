# Prompt — Incremento 6: cronograma estimado automaticamente e envio pelo WhatsApp no computador

Você vai construir o sexto incremento do **Construction 4D Studio**: o cronograma automático do §13, tarefas por pavimento e o envio de vídeo pelo WhatsApp a partir do computador.

Pedidos do usuário: "siga com o cronograma automático" e "por que não temos opção de WhatsApp na versão notebook?". A resposta: o botão Compartilhar usa a Web Share API com arquivos, que no computador só existe no Windows, no ChromeOS e no macOS (Safari), e nenhum site pode anexar arquivo no WhatsApp Web sozinho.

## Decisões

**ADR-18 — Cronograma estimado (§13).**
- Entradas:
  - área construída e número de pavimentos, que vêm do modelo quando possível: no paramétrico, os parâmetros; no IFC, os pavimentos com paredes e a área de piso estimada;
  - tipo de estrutura (concreto armado, alvenaria estrutural ou estrutura metálica);
  - data de início e prazo total.
- **Prazo sugerido:** (60 + 0,9 × área) dias, × 1,15 por pavimento adicional, × 1,0 / 0,9 / 0,8 conforme a estrutura (concreto / alvenaria estrutural / metálica). Arredondado para dias inteiros e editável.
- As etapas seguem frações do prazo típicas de obra residencial, com sobreposição. O bloco estrutural (estrutura, alvenaria e laje) se repete por pavimento, de baixo para cima. Cada etapa tem no mínimo um dia.
- O cronograma fica marcado como **estimado**:
  - selo ESTIMATIVA no cabeçalho;
  - aviso no relatório PDF;
  - o arquivo de origem é "estimativa automática".
- A marca só sai quando outro cronograma é importado ou criado do zero. Editar tarefas não a remove (§13: não apresentar estimativa como cronograma executivo).

**ADR-19 — Tarefa por pavimento.**
- A tarefa ganha o campo opcional `pavimento`, e as regras automáticas dessa tarefa passam a valer só para os elementos desse pavimento (`FiltroRegra.pavimento`).
- O campo entra no CSV, no XLSX e no JSON (coluna `pavimento`), no editor de tarefas, nas exportações e nos modelos de arquivo.
- Sem o campo, nada muda: a tarefa vale para o prédio inteiro.

**ADR-20 — WhatsApp no computador.**
- Quando o aparelho não compartilha arquivos (`navigator.canShare` falso), o painel Vídeo mostra **Enviar pelo WhatsApp**: baixa o arquivo e abre `https://web.whatsapp.com/` numa aba nova, com a instrução de arrastar o arquivo baixado para a conversa.
- Nada é enviado pelo app: é só um atalho, dito com clareza (§43).
- Com Web Share disponível, o botão Compartilhar continua sendo o caminho.

## Escopo

1. Gerador puro `src/fourd/estimativa.ts` (sem DOM), com prazo sugerido, etapas e pavimentos.
2. Diálogo **Gerar cronograma estimado**:
   - parâmetros, prévia em tabela com datas e substituição do cronograma atual (com confirmação, porque as exceções se perdem);
   - acessível pela tela inicial, pela linha do tempo vazia e pela aba Tarefas.
3. Campo `pavimento` (ADR-19) de ponta a ponta.
4. Botão Enviar pelo WhatsApp (ADR-20).

## Testes

- Vitest:
  - prazo sugerido;
  - etapas em ordem, sobrepostas e dentro do prazo;
  - um bloco estrutural por pavimento;
  - duração mínima;
  - regras filtradas por pavimento;
  - no sobrado paramétrico com a estimativa, as paredes de cima não aparecem durante a alvenaria do térreo;
  - importação da coluna pavimento.
- Playwright:
  - gerar a estimativa para um sobrado paramétrico (selo ESTIMATIVA, tarefas por pavimento, paredes de cima ocultas na alvenaria do térreo);
  - substituir um cronograma existente com confirmação;
  - no Chromium de computador, o botão Enviar pelo WhatsApp baixa o vídeo e abre o WhatsApp Web.

## Critério de aceitação

`npm run tudo` verde; deploy do Pages verde.
