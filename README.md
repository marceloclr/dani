# Dani: Construction 4D Studio

Aplicação web estática que transforma um modelo de residência (IFC) e o cronograma da obra numa simulação 4D navegável: a casa surge etapa por etapa, dia a dia. Tudo é processado no navegador; nenhum arquivo sai do dispositivo.

**Estado:** incremento 1 implementado (IFC → 3D → cronograma → mapeamento → timeline → simulação 4D). Câmeras animadas e vídeo vêm no incremento 2; persistência, XLSX e modo paramétrico no 3 (ver [especificação](docs/especificacao.md)).

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
npm test                          # unidade e leitura de IFC (Vitest, Node, fuso America/Fortaleza)
npx playwright install chromium   # uma vez
npm run e2e                       # roteiro de aceitação no Chromium (usa o build)
npm run tudo                      # os três em sequência
```

## Publicar

O build é estático. Para um subcaminho, como o GitHub Pages em `https://<usuário>.github.io/dani/`:

```bash
BASE=/dani/ npm run build
```

e publique a pasta `dist/` (GitHub Pages, Cloudflare Pages, Netlify ou Vercel). Sem `BASE`, o build usa caminhos relativos e funciona em qualquer pasta. Os arquivos `.wasm` do web-ifc vão junto, em `dist/wasm/`; nada é carregado de CDN.

## Como usar

1. **Carregar IFC** ou **Abrir demonstração** (casa térrea com sala de pé-direito duplo e cronograma de 180 dias).
2. **Carregar cronograma** (CSV ou JSON). Os elementos são ligados às tarefas automaticamente, pela coluna `categoria`.
3. Use a timeline: ▶ reproduz, o cursor pode ser arrastado e a data pode ser digitada.
4. Para corrigir o mapeamento, clique num elemento (modo **Selecionar**) e use **Excluir** ou **Incluir** na aba Elemento.

Na cena, os elementos em execução aparecem em latão; os concluídos, com a cor do material; os que nenhuma tarefa faz surgir ficam translúcidos ("fantasma"). Paredes mudam de cor quando o reboco e a pintura terminam.

## Formatos aceitos

| Tipo | Formato |
|------|---------|
| Modelo | `.ifc` (IFC2x3, IFC4, IFC4x3) |
| Cronograma | `.csv` com colunas `id, nome, inicio, fim, categoria` (e `progresso` opcional); separador `,` `;` ou tabulação; UTF-8 (com ou sem BOM) ou Windows-1252; datas `aaaa-mm-dd` ou `dd/mm/aaaa`; fim inclusivo |
| Cronograma | `.json`: lista de tarefas, `{ "tarefas": [...] }` ou `{ "schedule": { "tasks": [...] } }`, com os mesmos campos (aceita também `name`, `startDate`, `endDate`, `category`) |

Categorias com regra automática: `terreno`, `fundacao`, `estrutura`, `alvenaria`, `laje`, `cobertura`, `instalacoes`, `reboco`, `esquadrias`, `revestimento`, `pintura`, `loucas`, `paisagismo` (regras no ADR-02 de [docs/adrs.md](docs/adrs.md)).

## Limitações conhecidas (incremento 1)

- Animação só por **aparecimento**; fade, crescimento vertical e construção por fases chegam no incremento 2.
- Ainda não há câmeras animadas, geração de vídeo nem exportação de quadros.
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
| [public/samples/](public/samples/) | Casa de demonstração e cronograma |
| [tools/](tools/) | Gerador do IFC de demonstração, prévia estática e cópia do wasm |

Interface no padrão [Papel e Tinta](https://github.com/marceloclr/design-system).

## Estrutura do código

```
src/
├── app/          App, ações de carga (IFC, cronograma, demonstração)
├── bim/          parseIfc (web-ifc → metadados e malhas), Web Worker, ModelAdapter
├── fourd/        tempo (dias civis), regras (mapeamento), simulacao (avaliar), validacao
├── importers/    CSV/JSON do cronograma, decodificação de texto
├── rendering/    Cena (Three.js, câmera, seleção, camadas de visibilidade)
├── components/   tela inicial, viewport, timeline, painel lateral, erros
├── state/        projectStore (Zustand)
├── estilos/      tokens do design system e layout
└── utils/        dicas com fórmula
tests/            Vitest (núcleo e leitura do IFC de demonstração)
e2e/              Playwright (roteiro de aceitação)
```

`src/fourd/` não importa Three.js nem o DOM e roda no Node.

## Casa de demonstração

Gerada por script (ADR-08). Para regenerar:

```bash
python -m venv .venv && .venv/bin/pip install ifcopenshell==0.9.0 matplotlib
.venv/bin/python tools/gerar_demo_ifc.py   # public/samples/demo.ifc
.venv/bin/python tools/previa_demo.py      # docs/demo-etapas.png
```
