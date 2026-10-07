# Prompt — Incremento 4: acompanhamento da obra e modelos de arquivo

Você vai construir o quarto incremento do **Construction 4D Studio**. Os incrementos 1 a 3 estão prontos, testados (`npm run tudo`) e publicados em https://marceloclr.github.io/dani/.

Leia antes de começar: `docs/especificacao.md`, `docs/adrs.md` (inclusive as decisões novas abaixo), `README.md` e o design system Papel e Tinta.

Este incremento tira do `[FUTURO]` os itens de acompanhamento da obra: §29 (planta), §30 (fotos), §31 e §58 (planejado × real) e §59 (relatório). IA (§57), PWA (§46), cronograma automático (§13) e multiusuário (§60) continuam fora.

## Decisões deste incremento

**ADR-13 — Dados reais da obra.**
- Cada tarefa ganha campos opcionais: `realIni` e `realFim` (índice de dia, como `ini` e `fim`) e `avanco` (0 a 1, avanço físico informado).
- No CSV, XLSX e JSON, as colunas são `inicio_real`, `fim_real` e `avanco` (aceita "45%", "0,45" ou "45"). Não alteram a simulação planejada.
- A **simulação real** usa as datas reais. Tarefa sem início real ainda não começou; tarefa com início e sem fim real está em execução até a **data de status**: a última data real informada ou a data da última foto, o que for maior.
- O modo **Comparar** mostra o real e marca cada elemento por desvio: atrasado (devia existir pelo planejado e ainda não existe, em carmim translúcido), adiantado (existe antes do previsto, em ardósia) ou em dia (cores normais).
- **Avanço planejado** no dia d = soma das durações já decorridas ÷ soma das durações. **Avanço real** = média dos `avanco` ponderada pela duração. Quando a tarefa não tem `avanco`, ele é deduzido das datas reais (1 se terminou, fração do tempo se está em execução).

**ADR-14 — Anexos: fotos e planta.**
- Fotos: JPEG, PNG ou WebP, com data, local, descrição e etapa (ID da tarefa). A data vem do EXIF (`DateTimeOriginal`) quando houver; senão, da data do arquivo, e pode ser editada.
- Um `fotos.csv` opcional (`arquivo;data;local;descricao;etapa`) enviado junto preenche os dados pelo nome do arquivo.
- Planta: PNG, JPG ou PDF (primeira página, pelo pdf.js 6.4.299, com o worker servido pelo app). Vira textura num plano horizontal sob o modelo, com escala, deslocamento, rotação e opacidade ajustáveis. É só referência visual (§29): nada é convertido em BIM.
- Os anexos ficam no IndexedDB (depósito novo `anexos`) e vão no `.4dstudio`, que passa à versão 2 com `assets/fotos/*`, `assets/planta.*` e `attachments.json`. A versão 1 continua sendo lida.

**ADR-15 — Relatório PDF.**
- Gerado com jsPDF 4.2.1 (MIT), em A4 retrato, com a fonte Helvetica do próprio PDF (cobre os acentos do português; a IBM Plex fica para quando houver TTF local).
- Conteúdo:
  - cabeçalho com projeto e data;
  - imagem da obra na data, renderizada na hora em 1600 × 900;
  - avanço planejado e real;
  - etapas concluídas, em andamento e próximas;
  - desvios;
  - até 4 fotos dos 30 dias anteriores.
- O rodapé diz se os dados são de demonstração ou se o modelo é paramétrico.

## Escopo fechado

1. **Planejado × real:**
   - campos reais no editor de tarefa e na importação;
   - na timeline, uma barra fina do real sob a barra do planejado, mais a data de status;
   - seletor de visão na viewport: Planejado, Real ou Comparar, com legenda de desvio;
   - indicadores de avanço planejado e real, com dica de fórmula.
2. **Fotos (§30):**
   - aba **Obra** com envio múltiplo (mais o `fotos.csv` opcional), miniaturas, edição dos dados e exclusão;
   - marcadores de foto na timeline, que abrem a foto;
   - opção "Mostrar fotos na simulação", que exibe no canto da viewport a foto mais recente até a data atual.
3. **Planta sobreposta (§29):** carregar, ajustar (escala em metros, deslocamento, rotação e opacidade), "Ajustar à casa", mostrar e ocultar.
4. **Relatório PDF (§59)** da data da simulação, pela aba Obra.
5. **Modelos de arquivo para download, com exemplos preenchidos:**
   - `cronograma-modelo.csv` (padrão Excel brasileiro: `;`, `dd/mm/aaaa`, UTF-8 com BOM), `cronograma-modelo.xlsx` (planilha "Cronograma" primeiro e "Instruções" depois) e `cronograma-modelo.json`, os três com planejado e real;
   - `fotos-modelo.csv`;
   - `casa-exemplo.ifc`, a casa da demonstração;
   - `exemplo.4dstudio`, a demonstração com dados reais, para importar.

   Todos gerados por script (`tools/gerar-modelos.mjs`) em `public/modelos/`, listados num diálogo **Modelos de arquivo** acessível da tela inicial e do menu Projetos, com a descrição das colunas. Os modelos de cronograma são importados nos testes, para nunca saírem do formato aceito.

## Testes

- Vitest:
  - colunas reais e o formato de avanço;
  - simulação real e data de status;
  - comparação (atrasado, adiantado, em dia);
  - indicadores de avanço;
  - EXIF;
  - `fotos.csv`;
  - `.4dstudio` v2 de ida e volta com fotos e planta, e a leitura da v1;
  - todos os modelos de `public/modelos/` importam sem erro.
- Playwright:
  - importar `exemplo.4dstudio` e ver Comparar com elementos atrasados;
  - enviar fotos com `fotos.csv` e ver o marcador na timeline e a foto na viewport;
  - carregar planta PNG e PDF;
  - gerar o relatório PDF e conferir o arquivo (assinatura `%PDF`, páginas e texto);
  - baixar cada modelo do diálogo.

## Critério de aceitação

1. `npm run tudo` verde e deploy do Pages verde.
2. Com o `exemplo.4dstudio`, o modo Comparar mostra atrasos coerentes com as datas reais.
3. Fotos aparecem na timeline e na simulação; planta aparece sob o modelo.
4. O relatório PDF abre e traz imagem, avanço, etapas, desvios e fotos.
5. Cada modelo de arquivo baixado pelo diálogo é aceito pelo app sem ajuste.

Ao terminar, liste o que foi feito, o resultado de cada item e as limitações conhecidas. Não declare pronto o que não foi verificado.
