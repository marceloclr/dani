# Prompt — Incremento 1: IFC → 3D → cronograma → mapeamento → simulação 4D

Você vai construir o primeiro incremento do **Construction 4D Studio**, uma aplicação web estática que mostra a construção de uma residência ao longo do tempo a partir de um modelo IFC e de um cronograma.

Leia antes de começar, neste repositório:
- `docs/especificacao.md`: requisitos com etiqueta. Implemente **só** os `[INC-1]` e respeite os `[SEMPRE]`.
- `docs/adrs.md`: decisões já tomadas. Não as reabra. Se encontrar um impedimento real, pare e descreva-o em vez de improvisar outra arquitetura.

## Escopo fechado

Construir:
1. Projeto Vite + React + TypeScript, com as versões exatas da tabela do ADR-09.
2. Carregamento de `.ifc` com web-ifc num Web Worker, com barra de progresso. Uma malha por elemento e metadados (GUID, classe, `PredefinedType`, pavimento, nome, material, caixa envolvente). Os `.wasm` saem de `public/wasm/` (ADR-07).
3. Viewport Three.js: orbit, pan, zoom, seleção por clique, foco, reset, vistas superior, frontal, lateral e isométrica, e os botões CASA INTEIRA, OCULTAR e MOSTRAR.
4. Importação de cronograma CSV e JSON, com as regras de data e codificação do ADR-05, e painel de validação.
5. Mapeamento por regras-padrão (ADR-02), aplicado sem clique, mais exceções manuais por seleção no 3D. Painel por tarefa com contagem de elementos.
6. `avaliar(dia)` como função pura (ADR-03), com estados oculto, em execução, concluído e fantasma, e as políticas de sobreposição e de camadas do ADR-02.
7. Timeline inferior: barras por tarefa, cursor arrastável, campo de data, ir ao início e ao fim, play, pausa e velocidades 0,25×, 0,5×, 1×, 2×, 4× e 8×. Animação só por aparecimento.
8. Botão DEMONSTRAÇÃO, que carrega `public/samples/demo.ifc` e `public/samples/demo-cronograma.csv`, com o selo DEMONSTRAÇÃO visível enquanto estiver ativa. Se o arquivo de demonstração ainda não existir, o botão não aparece.
9. Erros em português simples, com "Detalhes técnicos" recolhido.

Não construir neste incremento, nem como botão desativado: câmeras animadas, vídeo, exportação de quadros, IndexedDB, XLSX, edição manual de tarefas, modo paramétrico, fotos, PWA.

## Estrutura

Use a estrutura do §7 do prompt original, com `src/bim/ModelAdapter.ts` como fronteira entre o web-ifc e o resto do app. `src/fourd/` não pode importar nada de Three.js nem do DOM, para ser testável no Node.

## Testes (Vitest)

- `avaliar`: antes da tarefa → oculto; no primeiro e no último dia → em execução (fim inclusivo); dia seguinte → concluído; elemento sem tarefa → política configurada; duas tarefas no mesmo elemento → regra de precedência.
- Regras de mapeamento: `IfcSlab` BASESLAB vai para fundação, FLOOR para laje e ROOF para cobertura.
- CSV: separador `;`, data `15/03/2026`, arquivo Windows-1252 com BOM, fim antes do início gera erro de validação.
- Datas: `2026-01-01` continua sendo 1º de janeiro no fuso `America/Fortaleza` (rodar o teste com `TZ=America/Fortaleza`).
- IFC: o arquivo de demonstração carrega e um arquivo inválido é rejeitado com mensagem amigável.

## Entrega

Código completo em `src/`, `public/`, `package.json` e `README.md` (instalar, `npm run dev`, `npm run build`, `npm run preview`, publicar no GitHub Pages, formatos aceitos, limitações, navegadores). O `vite.config.ts` precisa de `base` configurável para o subcaminho do Pages.

## Critério de aceitação

O incremento só está pronto quando este roteiro roda de ponta a ponta no Chromium:

1. `npm run build && npm run preview` sem erros, e `npm test` verde.
2. DEMONSTRAÇÃO → a casa aparece em 3D com o selo visível.
3. O cronograma da demo aparece na timeline e as regras já vincularam os elementos (nenhuma tarefa estrutural com zero elementos).
4. PLAY → fundação, estrutura, alvenaria, cobertura, esquadrias e acabamento surgem nessa ordem.
5. Arrastar o cursor e digitar uma data mudam a geometria na hora.
6. Selecionar uma parede, excluí-la da alvenaria → ela passa a fantasma no período da alvenaria.
7. Carregar um `.txt` renomeado para `.ifc` → mensagem amigável, sem quebrar a tela.

Ao terminar, liste o que foi feito, o resultado de cada item acima e as limitações conhecidas. Não declare pronto o que não foi verificado.
