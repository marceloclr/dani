# Dani: Construction 4D Studio

Aplicação web estática que transforma um modelo de residência (IFC) e o cronograma da obra numa simulação 4D navegável: a casa surge etapa por etapa, dia a dia. Tudo é processado no navegador; nenhum arquivo sai do dispositivo.

**Estado:** incrementos 1, 2 e 3 implementados:
- IFC → 3D → cronograma → mapeamento → timeline → simulação 4D;
- quatro modos de animação, presets e roteiro de câmera, e geração de vídeo real;
- projetos salvos no navegador, arquivo `.4dstudio`, cronograma em XLSX, edição de tarefas na tela e modo paramétrico para obras sem IFC.

Ficam para depois (`[FUTURO]` na [especificação](docs/especificacao.md)): fotos da obra, planta sobreposta, planejado × real, relatório PDF e IA.

![Prévia da simulação](docs/demo-etapas.png)

## Instalar e executar

Requer Node.js 20.19+ ou 22.12+.

```bash
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:5173
npm run build      # verifica os tipos e gera dist/
npm run preview    # serve o build em http://localhost:4173
```

Testes:

```bash
npm test                          # unidade, câmeras, animação e leitura de IFC (Vitest, Node, fuso America/Fortaleza)
npx playwright install chromium   # uma vez
npm run e2e                       # aceitação no Chromium (usa o build); os testes de vídeo usam o ffprobe
npm run tudo                      # os três em sequência
```

## Publicar

**No ar:** https://marceloclr.github.io/dani/ (publicado a cada push na `main` por `.github/workflows/pages.yml`, que roda os testes e o build).

O build é estático. Para um subcaminho, como o GitHub Pages em `https://<usuário>.github.io/dani/`:

```bash
BASE=/dani/ npm run build
```

e publique a pasta `dist/` (GitHub Pages, Cloudflare Pages, Netlify ou Vercel). Sem `BASE`, o build usa caminhos relativos e funciona em qualquer pasta. Os arquivos `.wasm` do web-ifc vão junto, em `dist/wasm/`; nada é carregado de CDN.

## Como usar

1. **Carregar IFC**, **Criar modelo paramétrico** (sem IFC: terreno, área, 1 ou 2 pavimentos, pé-direito e cobertura) ou **Abrir demonstração** (casa térrea com sala de pé-direito duplo e cronograma de 180 dias).
2. **Carregar cronograma** (CSV, XLSX ou JSON) ou **Criar cronograma** na tela. Os elementos são ligados às tarefas automaticamente, pela coluna `categoria`. Tarefas podem ser incluídas, editadas e excluídas na aba Tarefas.
3. Use a timeline: ▶ reproduz, o cursor pode ser arrastado e a data pode ser digitada.
4. Para corrigir o mapeamento, clique num elemento (modo **Selecionar**) e use **Excluir** ou **Incluir** na aba Elemento.
5. Escolha a **Animação** na timeline: Aparecimento, Fade-in, Crescimento (paredes, pilares e esquadrias sobem da base) ou Por fases (um a um, de baixo para cima e da frente para o fundo).
6. Na aba **Vídeo**, escolha formato (16:9, 9:16 ou 1:1), fps e duração, ajuste o roteiro de câmera (presets ou a câmera atual, capturada pela prévia) e gere o arquivo. O painel mostra o progresso, permite cancelar e, ao fim, pré-visualizar e baixar.
7. **Projetos**, no alto: o projeto é salvo sozinho neste navegador (a demonstração só com "Salvar cópia"). Dali se abre, duplica, exporta e importa `.4dstudio`, e se exportam o cronograma (JSON ou CSV para o Excel) e o mapeamento (JSON).

Na cena, os elementos em execução aparecem em latão; os concluídos, com a cor do material; os que nenhuma tarefa faz surgir ficam translúcidos ("fantasma"). Paredes mudam de cor quando o reboco e a pintura terminam.

## Formatos aceitos

| Tipo | Formato |
|------|---------|
| Modelo | `.ifc` (IFC2x3, IFC4, IFC4x3) |
| Cronograma | `.csv` com colunas `id, nome, inicio, fim, categoria` (e `progresso` opcional); separador `,` `;` ou tabulação; UTF-8 (com ou sem BOM) ou Windows-1252; datas `aaaa-mm-dd` ou `dd/mm/aaaa`; fim inclusivo |
| Cronograma | `.xlsx`: primeira planilha, mesmas colunas; datas do Excel ou em texto (SheetJS 0.20.3) |
| Projeto | `.4dstudio`: ZIP com `project.json`, `schedule.json`, `mappings.json`, `settings.json` e `assets/modelo.ifc` |
| Cronograma | `.json`: lista de tarefas, `{ "tarefas": [...] }` ou `{ "schedule": { "tasks": [...] } }`, com os mesmos campos (aceita também `name`, `startDate`, `endDate`, `category`) |

Categorias com regra automática: `terreno`, `fundacao`, `estrutura`, `alvenaria`, `laje`, `cobertura`, `instalacoes`, `reboco`, `esquadrias`, `revestimento`, `pintura`, `loucas`, `paisagismo` (regras no ADR-02 de [docs/adrs.md](docs/adrs.md)).

## Saídas de vídeo

| Saída | Quando aparece | Observação |
|-------|----------------|------------|
| MP4 (H.264) | Navegador com WebCodecs e codificador H.264 (Chrome e Edge, em geral) | Quadro a quadro, determinístico |
| WebM (VP9 ou VP8) | Navegador com WebCodecs | Quadro a quadro, determinístico |
| WebM em tempo real | Sem WebCodecs, com MediaRecorder | Leva a duração do vídeo; a fluidez depende do computador |
| Quadros PNG em ZIP | Sempre | Traz um LEIAME com o comando do ffmpeg para montar o vídeo |

Só aparecem as saídas que o navegador consegue produzir com a resolução e o fps escolhidos (`canEncodeVideo`). Sem MP4, o painel avisa: «Seu navegador não oferece suporte à codificação MP4 neste modo. O sistema produzirá WebM ou imagens sequenciais.»

## Limitações conhecidas

- A saída MP4 não foi exercitada nos testes automáticos: o Chromium do Playwright não traz codificador H.264, então os testes geram WebM (VP9) e conferem o arquivo com o ffprobe.
- O cronograma é por categoria: uma tarefa de alvenaria levanta as paredes de todos os pavimentos ao mesmo tempo. Para separar pavimentos, use exceções (aba Elemento) ou tarefas com categoria "Outra".
- O modo paramétrico tem uma planta-tipo fixa (dois cômodos na frente, sala e cozinha no fundo, escada na lateral) e não tem instalações nem louças; é para animar, não é projeto (ADR-12).
- Os projetos ficam no navegador em que foram criados; para levar a outro computador, exporte o `.4dstudio`.
- O vídeo não tem áudio nem legendas; vídeos longos em 1080p ficam na memória até o download (≈ 10 MB por 15 s em VP9).
- O projeto não é salvo: ao recarregar a página, o modelo, o cronograma e as exceções se perdem (IndexedDB no incremento 3).
- XLSX e edição de tarefas na tela ainda não existem; edite o CSV e carregue de novo.
- Calendário corrido (sem dias úteis nem feriados) e sem predecessoras.
- Modelos grandes (milhares de elementos) funcionam, mas sem LOD nem instancing (ADR-01).

## Navegadores

Chrome, Edge ou Brave atualizados (testado no Chromium 153 do Playwright). Firefox e Safari recentes devem funcionar, pois o app só usa WebGL 2, Web Workers e WebAssembly, mas não foram testados neste incremento.

## Documentos

| Arquivo | Conteúdo |
|---------|----------|
| [prompt-mestre-original.md](prompt-mestre-original.md) | Prompt mestre original, 68 seções |
| [docs/avaliacao.md](docs/avaliacao.md) | Avaliação do prompt |
| [docs/especificacao.md](docs/especificacao.md) | Especificação etiquetada por incremento |
| [docs/adrs.md](docs/adrs.md) | Decisões técnicas, versões e licenças |
| [prompts/incremento-1.md](prompts/incremento-1.md) | Prompt do incremento 1 |
| [prompts/incremento-2.md](prompts/incremento-2.md) | Prompt do incremento 2 |
| [prompts/incremento-3.md](prompts/incremento-3.md) | Prompt do incremento 3 |
| [public/samples/](public/samples/) | Casa de demonstração e cronograma |
| [tools/](tools/) | Gerador do IFC de demonstração, prévia estática e cópia do wasm |

Interface no padrão [Papel e Tinta](https://github.com/marceloclr/design-system).

## Estrutura do código

```
src/
├── app/          App, carga, projetos (gravação automática), estadoCena (camadas da viewport e do vídeo)
├── bim/          parseIfc (web-ifc → metadados e malhas), Web Worker, ModelAdapter, parametrico
├── fourd/        tempo (dias civis), regras (mapeamento), simulacao (avaliar), animacao (modos), validacao
├── importers/    CSV, XLSX e JSON do cronograma, decodificação de texto
├── storage/      IndexedDB e arquivo .4dstudio
├── rendering/    Cena (Three.js, seleção, camadas), cameras (presets e roteiro, puro), VideoRenderer
├── components/   tela inicial, viewport, timeline, painel lateral, painel de vídeo, erros
├── state/        projectStore e uiStore (Zustand)
├── estilos/      tokens do design system e layout
└── utils/        dicas com fórmula
tests/            Vitest (núcleo, animação, câmeras, IFC, paramétrico, XLSX, .4dstudio, edição)
e2e/              Playwright (aceitação dos incrementos 1, 2 e 3)
```

`src/fourd/` não importa Three.js nem o DOM e roda no Node.

## Casa de demonstração

Gerada por script (ADR-08). Para regenerar:

```bash
python -m venv .venv && .venv/bin/pip install ifcopenshell==0.9.0 matplotlib
.venv/bin/python tools/gerar_demo_ifc.py   # public/samples/demo.ifc
.venv/bin/python tools/previa_demo.py      # docs/demo-etapas.png
```
