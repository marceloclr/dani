# Registros de decisão (ADRs) — Construction 4D Studio

Decisões fixadas antes da implementação, para que a IA de programação não as reabra a cada ciclo.
Versões e licenças conferidas no registro npm em 2026-10-07.

| # | Decisão | Status |
|---|---------|--------|
| 01 | Motor BIM: web-ifc direto, uma malha por elemento | Aceita |
| 02 | Mapeamento por regras + exceções manuais | Aceita |
| 03 | Simulação como função pura sobre índice de dia | Aceita |
| 04 | Vídeo: WebCodecs + Mediabunny → MediaRecorder → PNG em ZIP | Aceita |
| 05 | Datas como índice de dia inteiro | Aceita |
| 06 | Persistência em IndexedDB | Aceita (incremento 3) |
| 07 | Ativos WASM servidos localmente | Aceita |
| 08 | IFC de demonstração próprio, gerado por script | Aceita |
| 09 | Versões fixas e licenças | Aceita |
| 10 | Reprodução: 1× = 6 dias por segundo | Aceita |
| 11 | Ciclo de vida do projeto e gravação automática | Aceita |
| 12 | Modo paramétrico com as mesmas classes IFC | Aceita |
| 13 | Dados reais da obra e comparação | Aceita |
| 14 | Anexos: fotos e planta | Aceita |
| 15 | Relatório PDF com jsPDF | Aceita |
| 16 | Vídeo para compartilhar (MP4 para WhatsApp, GIF) | Aceita |
| 17 | Revelação progressiva como padrão | Aceita |
| 18 | Cronograma estimado (§13) | Aceita |
| 19 | Tarefa por pavimento | Aceita |
| 20 | WhatsApp no computador | Aceita |
| 21 | Aparência realista | Aceita |

---

## ADR-01 — Motor BIM

**Contexto.** O prompt cita "web-ifc + That Open + Three.js" sem escolher entre eles. O Fragments da That Open consolida a geometria, o que atrapalha o crescimento vertical por elemento (§16.3) e a troca de material por estado. Há também conflito entre §16.3 e §35 (instancing).

**Decisão.** No MVP, usar `web-ifc` direto: uma `THREE.Mesh` por produto IFC, com materiais compartilhados por categoria e estado. Toda a leitura passa por uma interface `ModelAdapter`, para permitir trocar por Fragments depois.

```ts
interface ModelAdapter {
  load(file: ArrayBuffer, onProgress: (p: number) => void): Promise<void>;
  elements(): ElementMeta[];               // guid, ifcType, predefinedType, storey, name, bbox
  object(guid: string): THREE.Object3D | undefined;
  dispose(): void;
}
```

**Consequências.** Bom para residências (centenas a poucos milhares de elementos). Modelos grandes (§36) ficam para um adaptador Fragments numa fase posterior. Instancing (§35) não se aplica no MVP.

## ADR-02 — Mapeamento tarefa ↔ elemento

**Contexto.** Uma parede participa de alvenaria, reboco, revestimento e pintura. A lista `task.elements[]` do §9 só sabe "aparecer". O mapeamento manual de centenas de elementos (§14) é inviável para leigos, e listas de GUID quebram quando o IFC é reexportado.

**Decisão.** Relação muitos-para-muitos com tipo de ação, gerada por regras e corrigida por exceções.

```ts
type TaskAction = 'construct' | 'finish' | 'install' | 'temporary' | 'remove';

interface MappingRule {            // sobrevive à reexportação do IFC
  taskId: string;
  action: TaskAction;
  where: { ifcType?: string[]; predefinedType?: string[]; storey?: string[]; nameContains?: string };
  appearance?: AppearanceKey;      // ex.: 'bloco-cru', 'rebocado', 'pintado'
}

interface MappingOverride {        // exceção manual por elemento
  taskId: string;
  guid: string;
  action: TaskAction;
  mode: 'include' | 'exclude';
}
```

Regras-padrão, que o usuário pode editar:

| Etapa | Regra |
|-------|-------|
| Fundação | `IfcFooting`, `IfcPile`, `IfcSlab` com `PredefinedType = BASESLAB` |
| Estrutura | `IfcColumn`, `IfcBeam` |
| Alvenaria | `IfcWall`, `IfcWallStandardCase` (construct) |
| Laje | `IfcSlab` com `PredefinedType = FLOOR` |
| Cobertura | `IfcSlab` com `PredefinedType = ROOF`, partes de `IfcRoof`, `IfcCovering` com `ROOFING` |
| Esquadrias | `IfcDoor`, `IfcWindow` (install) |
| Instalações | `IfcPipeSegment`, `IfcTank`, `IfcElectricDistributionBoard` (install) |
| Reboco / Pintura | `IfcWall`, `IfcColumn`, `IfcBeam` (finish): troca de aparência, sem mudar a visibilidade (pilares e vigas incluídos em 2026-10-07, ADR-21) |
| Revestimento de pisos | `IfcCovering` com `PredefinedType = FLOORING` (construct: o piso é um elemento próprio, construído nessa tarefa) |
| Louças e metais | `IfcSanitaryTerminal` (install) |
| Terreno | `IfcGeographicElement` com `PredefinedType = TERRAIN` |
| Paisagismo | `IfcGeographicElement` com `ObjectType = PAISAGISMO` |

As regras se ligam à tarefa pelo campo `categoria` do cronograma (`terreno`, `fundacao`, `estrutura`, `alvenaria`, `laje`, `cobertura`, `instalacoes`, `reboco`, `esquadrias`, `revestimento`, `pintura`, `loucas`, `paisagismo`). Categorias sem regra (como `limpeza` e `entrega`) geram o aviso de tarefa sem elementos (§41), o que é esperado.

`IfcRoof` costuma ser só um agregado das lajes ROOF; a regra deve descer até as partes.

**Políticas.**
- Elemento sem tarefa: mostrado como "fantasma" translúcido por padrão. O usuário pode trocar para oculto ou sempre visível.
- Tarefas sobrepostas no mesmo elemento: prevalece a ação de maior ordem (`construct` < `finish` < `install`), e entre ações iguais a tarefa que começou por último.
- Camadas de visibilidade: estado 4D < override do usuário (OCULTAR/MOSTRAR, §19) < isolamento de seleção.

## ADR-03 — Simulação como função pura

**Decisão.** `avaliar(dia: number): Map<guid, EstadoElemento>`, sem estado incremental. A câmera segue a mesma lógica: `camera(tVideo)` por interpolação de keyframes.

```ts
interface EstadoElemento {
  visivel: boolean;
  fase: 'oculto' | 'em-execucao' | 'concluido' | 'fantasma';
  aparencia: AppearanceKey;
  progresso: number;               // 0..1 dentro da tarefa, usado por fade/crescimento
}
```

**Consequências.** Arrastar a timeline, saltar para uma data e renderizar quadros de forma determinística ficam triviais, e a lógica é testável no Node sem WebGL.

## ADR-04 — Exportação de vídeo

**Contexto.** O §24 pede renderização em Web Worker, o que exige OffscreenCanvas e não combina com bibliotecas que dependem do DOM. O `mp4-muxer`/`webm-muxer` foi descontinuado ("This library is superseded by Mediabunny").

**Decisão.**
1. Renderizar quadro a quadro no fluxo principal, fora do tempo real e de forma determinística, num renderer dedicado com a resolução do vídeo (independente da viewport), cedendo o controle entre quadros para a interface não travar.
2. Codificar com `VideoEncoder` e montar o arquivo com **Mediabunny** (MP4 ou WebM).
3. Controlar a contrapressão: aguardar enquanto `encoder.encodeQueueSize` passar de um limite (por exemplo, 8).
4. Antes de oferecer cada opção, consultar `VideoEncoder.isConfigSupported()` (por exemplo, `avc1.640028` para H.264 1080×1920, `vp09.00.10.08` para VP9). Só mostrar as opções aceitas.
5. A implementação usa o `CanvasSource` do Mediabunny, que encapsula o `VideoEncoder` e devolve uma promessa por quadro que só resolve quando o codificador aceita mais trabalho: é o controle de contrapressão do item 3. O teste de codec usa `canEncodeVideo` do Mediabunny, que consulta `VideoEncoder.isConfigSupported()`.
6. Hierarquia de fallback:
   1. WebCodecs + Mediabunny → MP4 (ou WebM);
   2. `MediaRecorder` + `canvas.captureStream()` → WebM em tempo real, menos preciso, mas é vídeo de verdade;
   3. sequência de PNGs num ZIP (fflate).

## ADR-05 — Datas

**Contexto.** `new Date('2026-01-01')` vira meia-noite UTC e aparece como 31/12 no fuso de Fortaleza (UTC−3).

**Decisão.** Internamente, toda data é um índice de dia inteiro contado a partir do início da obra. A conversão para texto só acontece na borda (importação e exibição). O `endDate` é inclusivo. Calendário corrido no MVP, declarado na interface. Dias úteis ficam para depois. O campo `progress` é ignorado pela simulação planejada.

**Importação CSV.** Detectar `;` ou `,`, datas `dd/mm/aaaa` ou ISO, codificação UTF-8 ou Windows-1252 e BOM (PapaParse resolve boa parte). XLSX fica para o incremento 3, com a versão do SheetJS distribuída pelo CDN do próprio projeto, já que o pacote `xlsx` do npm está defasado.

## ADR-06 — Persistência (incremento 3)

IndexedDB via `idb` (ISC). O IFC original fica guardado como Blob, com `navigator.storage.persist()`, para não reprocessar a cada abertura. O formato `.4dstudio` é um ZIP (fflate) que **embute** o IFC, para ser portátil.

## ADR-07 — Ativos WASM

Os `.wasm` do web-ifc são copiados para `public/wasm/` no build e carregados com `import.meta.env.BASE_URL`, o que funciona no subcaminho do GitHub Pages. Nada vem de CDN em tempo de execução (§43, §46).

## ADR-08 — IFC de demonstração

**Contexto.** O §55 exige uma demo de casa térrea, mas o modo paramétrico só chega na fase 13. A residência de teste clássica, AC20-FZK-Haus (KIT), não declara licença (o repositório buildingSMART/Sample-Test-Files responde `NOASSERTION`) e tem dois pavimentos.

**Decisão.** IFC próprio, gerado por `tools/gerar_demo_ifc.py` com IfcOpenShell 0.9.0 (LGPL, usado só no desenvolvimento; o app não depende dele). A casa se inspira na "Residência simétrica do nascente" do repositório **plantas**:

- térrea, 10,00 × 18,00 m, num lote de 13,30 × 30,00 m (recuos laterais de 1,65 m);
- duas suítes com banho na frente, vestíbulo no eixo, **sala de 60 m² com pé-direito duplo** (5,40 m livres, platibanda a 6,00 m), cozinha, WC e serviço no fundo;
- IFC4, unidades em metro, GUIDs determinísticos (o arquivo sai idêntico a cada execução);
- 146 elementos com geometria: 35 `IfcFooting` (PAD e STRIP), 19 `IfcColumn`, 18 `IfcBeam`, 16 `IfcWall` com 23 vãos, 9 `IfcDoor`, 13 `IfcWindow`, `IfcSlab` BASESLAB, FLOOR (2) e ROOF (3, agregados num `IfcRoof`), 9 `IfcCovering` FLOORING, 8 `IfcSanitaryTerminal`, instalações (`IfcTank`, `IfcPipeSegment`, `IfcElectricDistributionBoard`), terreno escavado (`IfcGeographicElement` TERRAIN) e paisagismo (`IfcGeographicElement` USERDEFINED, `ObjectType = PAISAGISMO`).

O cronograma `public/samples/demo-cronograma.csv` tem 15 etapas e 180 dias (05/01 a 03/07/2026). Conferido em 2026-10-07: validação de esquema sem erros no IfcOpenShell; web-ifc 0.0.78 no Node gera as 146 malhas; as regras do ADR-02 vinculam os 146 elementos. `tools/previa_demo.py` desenha a simulação em seis datas (`docs/demo-etapas.png`).

![Prévia da simulação](demo-etapas.png)

## ADR-09 — Versões e licenças

Versões fixas no `package.json`, em vez de pedir à IA que "confirme a API atual" (§68 é inexequível sem rede).

| Pacote | Versão | Licença |
|--------|--------|---------|
| three | 0.186.1 | MIT |
| web-ifc | 0.0.78 | **MPL-2.0** |
| mediabunny | 1.61.3 | **MPL-2.0** |
| react | 19.3.0 | MIT |
| vite | 8.3.3 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| zustand | 5.0.15 | MIT |
| date-fns | 4.4.0 | MIT |
| papaparse | 5.7.0 | MIT |
| fflate | 0.8.3 | MIT |
| idb | 8.0.4 | ISC |
| vitest | 5.0.3 | MIT |
| @playwright/test | 1.63.0 | Apache-2.0 |
| @thatopen/components | 3.4.9 | MIT (fora do MVP, ver ADR-01) |
| @fontsource/ibm-plex-sans, -serif, -mono | 5.3.0 | OFL-1.1 (fontes do design system servidas localmente, para funcionar offline) |
| @vitejs/plugin-react | 6.1.2 | MIT |
| jspdf | 4.2.1 | MIT |
| pdfjs-dist | 6.4.299 | Apache-2.0 |
| h264-mp4-encoder | 1.0.12 (minih264, domínio público; libmp4v2, MPL 1.1) | MIT |
| gifenc | 1.0.3 | MIT |
| xlsx (SheetJS) | 0.20.3, do tarball https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz | Apache-2.0 |
| @mediapipe/tasks-vision | 1.1.0 (e o modelo `selfie_segmenter.tflite`) | Apache-2.0 (ADR-24) |
| @mediabunny/aac-encoder | 1.61.3 (codificador AAC do FFmpeg em WebAssembly) | MPL-2.0; o FFmpeg embutido é LGPL-2.1+ (ADR-24) |
| Texturas do Poly Haven | `public/texturas/` | CC0 (ADR-23 e ADR-24) |

MPL-2.0 é copyleft por arquivo: pode ser usada sem problema, desde que alterações nos próprios arquivos da biblioteca sejam publicadas. O §44 passa a citá-la explicitamente.

Testes: lógica, parsing de CSV e de IFC no Vitest (Node). Exportação de vídeo só em navegador real (Playwright + Chromium), nunca em jsdom.

## ADR-10 — Velocidade de reprodução

**Decisão.** 1× = 6 dias de obra por segundo, para que a obra-padrão de 180 dias dure 30 s, a duração-padrão do vídeo (§22, §23). As velocidades do §17 multiplicam esse valor (0,25× = 1,5 dia/s; 8× = 48 dias/s). A fórmula aparece na dica do seletor de velocidade.

## ADR-11 — Ciclo de vida do projeto

**Decisão.**
- Projeto = modelo (IFC ou parâmetros) + cronograma + exceções + política + modo de animação + configuração do vídeo.
- Carregar um IFC ou criar um modelo paramétrico cria um projeto com o nome do arquivo, gravado automaticamente no IndexedDB (banco `c4d`, depósitos `projetos` e `modelos`) 600 ms depois de cada mudança.
- A demonstração não é gravada sozinha; "Salvar cópia" a transforma em projeto comum, mantendo o selo DEMONSTRAÇÃO, porque os dados continuam fictícios.
- Na primeira gravação, o app pede `navigator.storage.persist()` e mostra o resultado.
- O arquivo `.4dstudio` é um ZIP com `project.json`, `schedule.json`, `mappings.json`, `settings.json` e `assets/modelo.ifc`. As regras não são gravadas: derivam das categorias (ADR-02) e só as exceções vão no arquivo.

## ADR-12 — Modo paramétrico

**Decisão.**
- O gerador (`src/bim/parametrico.ts`) produz diretamente metadados e malhas com as mesmas classes IFC do modo BIM, para as regras do ADR-02 valerem sem mudança.
- É determinístico; o projeto guarda só os parâmetros e regenera ao abrir.
- Planta-tipo, a mesma em todos os pavimentos:
  - frente com dois cômodos separados por uma parede no eixo;
  - parede transversal a 45% da profundidade;
  - fundo livre (sala e cozinha), com a escada encostada na lateral quando há dois pavimentos;
  - recuos de 5 m na frente, 3 m no fundo e 1,5 m nas laterais.
- Coberturas: laje plana com platibanda, telhado de uma água (15%) ou de duas águas (30%), sempre sobre laje de forro.
- Na interface o modelo é marcado como PARAMÉTRICO: representação simplificada para animação, não é projeto executivo.

## ADR-13 — Dados reais da obra

- Cada tarefa ganha campos opcionais: `realIni` e `realFim` (índice de dia, como `ini` e `fim`) e `avanco` (0 a 1, avanço físico informado).
- No CSV, XLSX e JSON, as colunas são `inicio_real`, `fim_real` e `avanco` (aceita "45%", "0,45" ou "45"). Não alteram a simulação planejada.
- A **simulação real** usa as datas reais. Tarefa sem início real ainda não começou; tarefa com início e sem fim real está em execução até a **data de status**: a última data real informada ou a data da última foto, o que for maior.
- O modo **Comparar** mostra o real e marca cada elemento por desvio: atrasado (devia existir pelo planejado e ainda não existe, em carmim translúcido), adiantado (existe antes do previsto, em ardósia) ou em dia (cores normais).
- **Avanço planejado** no dia d = soma das durações já decorridas ÷ soma das durações. **Avanço real** = média dos `avanco` ponderada pela duração. Quando a tarefa não tem `avanco`, ele é deduzido das datas reais (1 se terminou, fração do tempo se está em execução).

## ADR-14 — Anexos: fotos e planta

- Fotos: JPEG, PNG ou WebP, com data, local, descrição e etapa (ID da tarefa). A data vem do EXIF (`DateTimeOriginal`) quando houver; senão, da data do arquivo, e pode ser editada.
- Um `fotos.csv` opcional (`arquivo;data;local;descricao;etapa`) enviado junto preenche os dados pelo nome do arquivo.
- Planta: PNG, JPG ou PDF (primeira página, pelo pdf.js 6.4.299, com o worker servido pelo app). Vira textura num plano horizontal sob o modelo, com escala, deslocamento, rotação e opacidade ajustáveis. É só referência visual (§29): nada é convertido em BIM.
- Os anexos ficam no IndexedDB (depósito novo `anexos`) e vão no `.4dstudio`, que passa à versão 2 com `assets/fotos/*`, `assets/planta.*` e `attachments.json`. A versão 1 continua sendo lida.

## ADR-15 — Relatório PDF

- Gerado com jsPDF 4.2.1 (MIT), em A4 retrato, com a fonte Helvetica do próprio PDF (cobre os acentos do português; a IBM Plex fica para quando houver TTF local).
- Conteúdo:
  - cabeçalho com projeto e data;
  - imagem da obra na data, renderizada na hora em 1600 × 900;
  - avanço planejado e real;
  - etapas concluídas, em andamento e próximas;
  - desvios;
  - até 4 fotos dos 30 dias anteriores.
- O rodapé diz se os dados são de demonstração ou se o modelo é paramétrico.


## ADR-16 — Vídeo para compartilhar

- **MP4 para WhatsApp e celulares** (recomendado e padrão):
  - H.264 perfil Baseline, 4:2:0 e no máximo 1280 px no lado maior (720p), a resolução que o WhatsApp mantém;
  - taxa fixa e `moov` no início (pronto para streaming);
  - codificado em WebAssembly (minih264, domínio público, e libmp4v2, MPL 1.1, pelo pacote `h264-mp4-encoder` 1.0.12, MIT), servido pelo próprio app, para o arquivo sair igual em qualquer navegador, com ou sem codificador H.264 nativo;
  - sem áudio: o WhatsApp aceita vídeo sem trilha de áudio.
- **MP4 alta qualidade (1080p)** pelo WebCodecs, com perfil Main fixado (`avc1.4d0028`), quando o navegador tiver H.264.
- **WebM** (VP9 ou VP8), **WebM em tempo real** (sem WebCodecs), **GIF animado** (gifenc, MIT; 480 px, 10 fps, para mensageiros e apresentações) e **quadros PNG em ZIP**.
- O MP4 para WhatsApp é reescrito com o índice (`moov`) no início, sem recodificar (Mediabunny), para tocar antes de baixar o arquivo inteiro.
- No cancelamento, o codificador é finalizado antes de ser descartado: descartá-lo sem finalizar aborta o WebAssembly.
- Depois de gerar: botão **Compartilhar** (Web Share API com arquivo) quando o aparelho permitir, que leva direto ao WhatsApp no celular.

## ADR-17 — Revelação progressiva como padrão

- Novo modo de animação **Progressivo**, padrão em projetos novos:
  - cada tarefa revela os seus elementos um a um, de baixo para cima e da frente para o fundo, ao longo de toda a duração;
  - cada elemento se forma durante a sua vez, conforme o tipo:
    - paredes, pilares, escadas e estacas sobem a partir da base;
    - lajes, vigas, baldrames, pisos e telhados avançam no maior eixo horizontal;
    - portas, janelas, louças, instalações, terreno e paisagismo aparecem aos poucos (fade).
- Tarefa com um só elemento (ex.: o contrapiso) se forma ao longo da tarefa inteira.
- Cada elemento ganha a cor final assim que termina de se formar, sem esperar o fim da tarefa. Antes, todos ficavam em "em execução" até o último dia e mudavam juntos, o que dava a impressão de a fase surgir de uma vez no fim do prazo.
- Os modos anteriores continuam disponíveis.


## ADR-18 — Cronograma estimado (§13)

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

## ADR-19 — Tarefa por pavimento

- A tarefa ganha o campo opcional `pavimento`, e as regras automáticas dessa tarefa passam a valer só para os elementos desse pavimento (`FiltroRegra.pavimento`).
- O campo entra no CSV, no XLSX e no JSON (coluna `pavimento`), no editor de tarefas, nas exportações e nos modelos de arquivo.
- Sem o campo, nada muda: a tarefa vale para o prédio inteiro.

## ADR-20 — WhatsApp no computador

- Quando o aparelho não compartilha arquivos (`navigator.canShare` falso), o painel Vídeo mostra **Enviar pelo WhatsApp**: baixa o arquivo e abre `https://web.whatsapp.com/` numa aba nova, com a instrução de arrastar o arquivo baixado para a conversa.
- Nada é enviado pelo app: é só um atalho, dito com clareza (§43).
- Com Web Share disponível, o botão Compartilhar continua sendo o caminho.


## ADR-21 — Aparência realista

- A viewport, o vídeo e o relatório passam a ter duas aparências: **Realista** (padrão) e **Técnica**, que mantém as cores lisas de antes.
- **Materiais no modo Realista:**
  - texturas procedurais desenhadas no próprio navegador, sem baixar imagens: tijolo cerâmico, reboco, pintura, concreto, telha cerâmica, telha metálica, madeira, porcelanato, louça, vidro, terra, grama e folhagem;
  - as texturas ficam em escala real (metros) graças a coordenadas de textura projetadas pela normal de cada face (projeção em caixa);
  - o gerador é determinístico (semente fixa), para o vídeo sair igual a cada geração;
  - o material vem do nome do material IFC; quando ele não diz, da classe IFC e, por último, da cor do IFC.
- **Luz:** sol com sombras suaves (mapa de sombras ajustado à casa), céu em degradê, luz de ambiente do céu, reflexos de ambiente (RoomEnvironment) e mapeamento de tons ACES.
- **Oclusão de ambiente** (GTAO) por pós-processamento na viewport, no relatório e no vídeo, que escurece os cantos e os encontros de paredes e lajes.
- No Realista, o que está em execução não ganha a cor de latão: a revelação progressiva já mostra o avanço. O modo Comparar e o fantasma continuam técnicos, porque precisam destacar.
- Reboco e pintura alcançam também pilares e vigas (regras do ADR-02), para a estrutura não aparecer como faixas cinzentas nas fachadas acabadas.
- O sol vem da frente e da direita, para as fachadas da frente ficarem iluminadas e as sombras caírem à vista da câmera isométrica.
- O ambiente de reflexos é um alvo de renderização: cada renderizador (viewport, vídeo, relatório) gera o seu.
- A aparência é gravada no projeto (`settings.json` do `.4dstudio`).
- **Limite honesto:** é renderização em tempo real (rasterização), não fotografia. Para um quadro fotorrealista, com luz indireta e reflexos verdadeiros, seria preciso um traçador de caminhos (path tracer), mais lento; ele fica como possível passo seguinte.

## ADR-22 — Dias úteis pelo calendário oficial do Ceará

- A estimativa (ADR-18) mostra, para cada etapa e para a obra inteira, **dias corridos** e **dias úteis**. As datas das tarefas continuam em dias corridos (ADR-05); os dias úteis são só contagem.
- **Dia útil:** segunda a sexta, fora os feriados que valem no município da obra:
  - nacionais (Leis 662/1949, 6.802/1980, 9.093/1995 e 14.759/2023), com a Sexta-feira Santa calculada pela Páscoa;
  - estadual: Data Magna do Ceará, 25 de março (Constituição do Ceará, art. 18, parágrafo único, EC 73/2011);
  - segunda e terça de Carnaval: ponto facultativo federal, mas a obra para;
  - municipais (Lei 9.093/1995): aniversário do município e até quatro religiosos. São José (19/3) **não** é feriado estadual; só conta onde a lei municipal o adota.
- **Municípios:** os 19 da Região Metropolitana de Fortaleza. Os demais municípios do Ceará usam só nacionais, estaduais e Carnaval.
- **Fontes dos municipais:** lei municipal quando encontrada (Fortaleza: Lei 8.796/2003), calendário 2026 do TRT-CE, Sintracondce e os agregadores iFeriados e feriados.inf.br. Quando as fontes divergem, entram todas as datas: os dias úteis ficam do lado seguro. Datas só de agregador ficam marcadas "a confirmar". Tabela completa em `docs/feriados.md`.
- **Banco:** as regras ficam em `src/fourd/feriados.ts` (função pura, testada no Node). Ao abrir o app, a base de 2026 a 2030 (276 registros) é gravada no IndexedDB, no armazenamento `feriados`, versão 3 do banco `c4d`. Ela só é regravada quando `VERSAO_FERIADOS` muda. Sem IndexedDB (aba privada), a estimativa usa a mesma base em memória.
- O município escolhido fica no cronograma (`municipio`, em `schedule.json`).
- Depois de 2030, a contagem desconta só sábados e domingos, e a tela avisa. Para estender, acrescentar os anos e subir `VERSAO_FERIADOS`.

## ADR-23 — Drone, obra pronta humanizada e ambiente realista

**Pedido.** "Voar por dentro e por fora da construção enquanto ela é montada, como um drone. Depois de montada, girar pelas fachadas e entrar na obra pronta humanizada, inclusive subir e descer as escadas."

- **Navegação a partir do IFC** (`src/rendering/navegacao.ts`, pura e testada no Node):
  - mapa de ocupação de cada pavimento: os triângulos de paredes, pilares, janelas, escadas e móveis são cortados a 0,5 m e a 1,2 m acima do piso; portas, lajes e pisos não barram;
  - folga de 0,25 m do corpo e mapa de distância aos obstáculos; o A* (8 direções, sem cortar quinas) encarece passar a menos de 0,9 m deles, e a simplificação por linha de visada mantém essa margem: a câmera segue pelo meio dos cômodos;
  - portas externas pela normal da folha (para longe do centro da casa); a da frente é a que mais olha para +z;
  - escadas: pé e topo pelos vértices mais baixos e mais altos acima da base, com 0,9 m de patamar antes e depois; no pavimento de cima, o vão da escada é bloqueado.
- **Roteiro** (`src/rendering/drone.ts`): metade do tempo com a obra sendo montada (voo em espiral descendo, entrada pela porta da frente, travessia até a porta dos fundos ou ida e volta, subida e giro alto) e metade com a obra pronta (volta completa pelas fachadas na altura de quem passa na rua, entrada pela porta, subida da escada, ida ao cômodo mais distante, volta, descida e sala). Lente de 50° por fora e 62° a 68° por dentro. Transições suaves; o teste garante saltos menores que 0,5 m entre 2.000 amostras.
- **Humanização:** a mobília do IFC (`IfcFurniture`, `IfcFurnishingElement`) fica fora do mapeamento 4D (não gera aviso de "sem tarefa") e só aparece com a obra concluída (último dia do cronograma). Pessoas estilizadas, determinísticas, ficam na frente da casa e em cada pavimento, perto do caminho da câmera sem cruzar com ele. Os dois modelos de exemplo ganharam mobília (`tools/mobilia.py`), acrescentada no fim dos arquivos para não mudar os GUIDs existentes.
- **Ambiente realista** (`src/rendering/ambiente.ts`):
  - céu físico de Preetham com nuvens procedurais do Three.js, com o sol na mesma direção da luz da cena; o céu é desenhado num cubo (fundo) e pré-filtrado (PMREM) para os reflexos, no lugar do RoomEnvironment;
  - chão até 1,5 km com a grama fotográfica, com um buraco no lugar do lote e uma cava de solo embaixo (a fundação aparece escavada, sem céu por baixo do terreno); a repetição da foto é quebrada misturando-a com ela mesma numa escala 7× maior; neblina leve no horizonte;
  - texturas fotográficas de grama (`sparse_grass`) e solo (`grass_path_2`) do Poly Haven, licença CC0, em `public/texturas/` (1,5 MB); o vídeo e o relatório esperam que elas carreguem;
  - árvores procedurais no lugar das caixas de paisagismo do IFC;
  - madeira com tábuas e veios no lugar das listras.
- **Controles:** botão **Drone** (W A S D/setas, E/Q, arrastar para olhar, roda para a velocidade, Esc; direcional na tela para o toque) e **Voo automático** na viewport; câmera **Drone: voo e passeio** no vídeo, com a obra montada na primeira metade.
- **Marca:** slogan "Produtor de Vídeos das obras da Super Influencer Dani, a engenheira." no cabeçalho, na tela inicial, no rodapé do relatório e numa faixa discreta no canto do vídeo (desligável).
- **Revisão de 2026-10-07 (pedidos: "colide com paredes, atravessa portas, deveria abrir para então entrar"; "humano flutuando do lado de fora"; "a velocidade deve ser sempre a mesma"):**
  - a travessia da obra só usa o interior (a grade fora das paredes fica bloqueada); sem caminho livre não há reta de reserva; a descida aérea termina de frente para a porta de entrada e a subida sai pelo lado da porta usada;
  - o caminho passa pelo meio de cada vão, mantém distância também das folhas fechadas e troca recuos curtos e viradas fechadas por curvas; a meia-volta (no quarto) é uma curva em gota;
  - **portas abrem**: cada passagem por um vão é localizada no tempo do voo; a folha começa a abrir 2,6 m antes, está toda aberta a 1,2 m e fecha depois, girando 90° para o lado em que o drone segue (ele empurra a porta), com a dobradiça do lado oposto ao que ele vira depois do vão; só abrem as portas atravessadas. No drone manual, abrem pela proximidade, com a câmera de frente para o vão;
  - **velocidade constante**: o tempo do voo é refeito pelo comprimento percorrido (tabela de 8.000 amostras); a obra é montada até o ponto do caminho correspondente e a aba Vídeo mostra metros e m/s;
  - **pessoas sobre piso**: só ficam onde há laje ou piso até 35 cm abaixo dos pés;
  - teste: o voo inteiro dos dois modelos não atravessa paredes nem portas (com as folhas giradas no tempo certo) e fica a pelo menos 25 cm da obra.
- **Limites:** escadas em L ou em U são percorridas em linha reta entre o pé e o topo; sem porta externa, o voo fica do lado de fora; o modelo paramétrico ainda não tem mobília.

## ADR-24 — Imagem mais real, marca da cliente e apresentadora em primeiro plano

**Status:** aceito em 2026-10-07 (INC-10).

**Pedido.** "Aprofunde o aprimoramento da imagem do vídeo para melhorar a realidade dos materiais, mesclar com uma imagem de vídeo de uma pessoa real falando em primeiro plano com o vídeo do projeto rodando em segundo plano." A referência de qualidade é um reel de arquitetura (noite, LED quente, pedra, porcelanato), e a identidade é a da engenheira **Daniella Pompeu** (@daniellapompeuengenharia).

**Contexto.**
- O app renderiza em tempo real no navegador (rasterização). Não há placa de vídeo dedicada garantida: a máquina de referência tem GPU integrada Intel.
- Os materiais do ADR-21 eram procedurais e o pós-processamento perdia o antialias.
- Os vídeos saíam mudos.
- Restrição do projeto: nada de CDN em tempo de execução (§43).

**Opções consideradas para o realismo.**

| Opção | Qualidade | Tempo de 30 s em 9:16 | Complexidade |
|---|---|---|---|
| A. Melhorar o tempo real (fotos PBR, MSAA, luz noturna, acabamento) | boa, "Twinmotion simples" | 2 a 10 min | média |
| B. Traçador de caminhos no navegador | ótima, mas ruído e horas por vídeo | horas | alta |
| C. Exportar para o Blender (EEVEE ou Cycles) | a mais próxima do reel | 1 a 2 h (EEVEE) | alta, depende de instalar o Blender |

**Decisão.** Opção A agora. B e C ficam como passo seguinte opcional. O limite principal não é o motor, e sim o detalhe do IFC: um modelo sem acabamento e sem mobiliário não vira fotografia em nenhum motor.

**Materiais.**
- Fotos PBR (cor, relevo e rugosidade) do Poly Haven, CC0, em 1K, para alvenaria, reboco, concreto, telha cerâmica, telha metálica, madeira, porcelanato e pedra em cacos. Os materiais recorrentes nos posts dela são ripado de madeira, pedra, porcelanato claro e tijolo aparente.
- Cada foto é levada ao tom de referência do material (`tingir`, conta feita no espaço linear).
- A pintura usa a cor da tinta com o relevo da foto do reboco. A tinta branca do realista fica um tom abaixo do branco puro, para o relevo aparecer ao sol.
- A quebra de repetição (`semRepeticao`) vale para reboco, concreto, terra e grama. Não vale para tijolo e telha, que têm fiadas.
- Vidro e porcelanato passam a ser materiais físicos: o vidro com reflexo do céu, o porcelanato com verniz leve.
- Sem uma foto (rede falhou), volta a textura procedural. Novas palavras no nome do material: pedra, moledo, cacos, quartzo, bancada, ripado e freijó.

**Imagem.**
- O composer desenha num alvo com MSAA (4 amostras).
- No fim entra um **acabamento de câmera**: curva de contraste suave, saturação de 1,08, vinheta, leve aquecimento e granulação fina com semente pelo número do quadro (o vídeo sai igual a cada geração).
- O brilho (bloom) só fica ligado no entardecer e à noite. De dia, o céu claro passaria do limiar e enevoaria a imagem; o limiar 4, em luz linear, fica acima de uma fachada branca ao sol.

**Luz** (`src/rendering/iluminacao.ts`).
- Três luzes, na viewport, no vídeo e no relatório:
  - **Dia**: sol alto da frente e da direita, exposição de 0,82;
  - **Entardecer**: sol a 6°, cor âmbar, céu de Preetham mais turvo;
  - **Noite**: hora azul, com céu em degradê e estrelas fixas, porque o Preetham fica preto com o sol abaixo do horizonte, e luar.
- **Luminárias** calculadas do IFC: em cada pavimento (térreo e topo de cada escada), as células do mapa de ocupação mais distantes das paredes são o meio dos cômodos.
  - Ficam no máximo 8 por pavimento, com 2,8 m entre si, logo abaixo da laje.
  - Cada uma é uma luz pontual a 2.700 K, mais forte nos cômodos maiores, e um disco aceso no teto.
  - Só acendem com a obra pronta (como a mobília), no entardecer (70 %) e à noite.
- A luz fica em `video.luz` (no `settings.json`). O seletor aparece na viewport (só no Realista) e na aba Vídeo.

**Qualidade Máxima** (aba Vídeo).
- Cada quadro é desenhado a 1,5 × (2,25 vezes os pixels) e reduzido.
- A sombra do sol sobe para 4.096 px e o GTAO usa 24 amostras.
- Leva cerca de 2,5 vezes o tempo da Normal. A viewport não muda.

**Marca** (`src/app/marca.ts`, `src/rendering/marcaVideo.ts`).
- Cores medidas nos posts: dourado `#b88848` e grafite `#2c2c2c`. Caixa-alta espaçada, como no logo.
- O monograma DP é **provisório**, redesenhado em vetor a partir da foto de perfil (`public/marca/monograma-provisorio.svg`), até chegar o arquivo oficial.
- **Assinatura**: faixa grafite com filete dourado, monograma, "DANIELLA POMPEU", "ENGENHARIA QUE TRANSFORMA" e, como linha secundária, o slogan do produto.
- **Vinheta** de abertura e encerramento em ardósia, com o monograma: cheia até 1,2 s e some até 2 s; o inverso no fim. Ocupa o próprio tempo do vídeo e não entra em vídeos com menos de 6 s.
- A tela inicial e o rodapé do relatório trazem a marca dela. O cabeçalho mantém o slogan do produto.
- Os prints do perfil ficam em `docs/referencias/`, fora do git: têm fotos de pessoas e o repositório é público.

**Apresentadora** (`src/rendering/apresentadora.ts`, `src/rendering/composicao.ts`, `src/components/SecaoApresentadora.tsx`).
- **Entrada:** só arquivo enviado (MP4 ou MOV do celular, ou WebM). Ela é decodificada quadro a quadro pelo mediabunny (`CanvasSink.canvasesAtTimestamps`), no tempo do vídeo; sem WebCodecs, um `<video>` com busca por quadro, mais lento.
- **Recorte, à escolha:**
  - **IA**: segmentação de selfie do MediaPipe, com o modelo de 250 KB em `public/mediapipe/` e o wasm copiado no build, carregados só quando usados. A imagem é reduzida para 384 px antes da segmentação, e a máscara é ampliada no shader.
  - **Fundo verde**: chave de croma em (Cb, Cr), que ignora o brilho e por isso apaga também a sombra no pano. Tem tolerância, borda e supressão do verde que vaza, e a cor da chave sai de um conta-gotas no primeiro quadro.
- **Composição** (um só shader): borda suavizada e sombra leve deslocada, para não parecer recortada.
  - Ordem: cena → apresentadora → assinatura → vinheta.
  - A apresentadora fica ancorada embaixo, à esquerda, ao centro ou à direita, com 40 % a 100 % da altura (padrão 72 %).
  - A assinatura vai para o canto oposto ao dela.
- **Duração:** com "acompanhar a fala" (padrão), o vídeo dura o mesmo que a fala, arredondado ao décimo, entre 6 s e 5 min. O voo do drone e o roteiro se ajustam à duração.
- **Áudio da fala** (decodificado pelo `decodeAudioData` e intercalado com os quadros em pedaços de 0,5 s):
  - MP4 alta: AAC;
  - WebM: Opus;
  - MP4 para WhatsApp: o H.264 próprio sai mudo e é **remontado** sem recodificar, com o AAC intercalado e o índice no início;
  - WebM em tempo real (sem WebCodecs): a fala toca num destino de gravação do Web Audio;
  - sem AAC no navegador (Chromium e Brave no Linux): `@mediabunny/aac-encoder`;
  - GIF e PNG: sem som, e a tela avisa.
- **Guarda:** o vídeo fica no IndexedDB (`<projeto>/apresentadora`) e a configuração em `video.apresentadora`. O `.4dstudio` não leva o vídeo, para não ficar pesado. Ao importar, a tela pede o arquivo de novo e mantém a configuração.

**Consequências.**
- Fica mais fácil: vídeo com cara profissional sem sair do navegador, a cliente reconhecível em cada vídeo, Reels com a voz dela.
- Fica mais difícil:
  - mais 2,4 MB de texturas;
  - cerca de 25 MB de wasm do MediaPipe no site publicado (só baixado ao usar o recorte por IA);
  - o vídeo com IA é mais lento (segmentação por quadro).
- **Limites honestos:**
  - continua sendo tempo real, sem luz indireta verdadeira;
  - a IA pode recortar mal cabelos soltos contra fundos parecidos (o fundo verde é a opção limpa);
  - vídeos HEVC do iPhone podem não abrir em todos os navegadores; a orientação é exportar em H.264;
  - o logo é provisório.

**Verificação.**
- Vitest: luminárias nos dois modelos (dentro da casa, longe das paredes, espaçadas), parâmetros de luz, curva de contraste, tingimento, vinheta, layout, chave de croma, derrame e duração pela fala.
- Playwright:
  - luz da noite acendendo as luminárias só com a obra pronta;
  - GIF realista em qualidade Máxima;
  - prévia do fundo verde sem verde e com a figura;
  - MP4 para WhatsApp com H.264 + AAC, 8 s e voz audível (ffprobe/volumedetect);
  - WebM com Opus;
  - recorte por IA sem nenhuma requisição externa.

**Próximos passos possíveis.**
- Exportar a cena para o Blender (render cinematográfico).
- Biblioteca de móveis, luminárias e vegetação CC0 no lugar das caixas.
- Logo oficial.
- Legendas da fala no estilo dos reels dela.


## ADR-25 — Montagem em cenas (Reels) e revelação "terreno real → projeto"

**Status:** aceito em 2026-10-07 (INC-11).

**Contexto.** A meta indicada pelo usuário é um reel de arquitetura de 49 s (referência em `docs/referencias/`, fora do git). Ele tem cortes a cada 2–4 s sobre uma voz contínua; o apresentador é filmado no terreno, e o fundo vira o projeto pronto enquanto ele fala; depois vêm a obra, o 4D aéreo e o logo. O app gerava uma câmera contínua (roteiro de vistas ou drone).

**Decisão.** Nova câmera do vídeo, **Montagem (Reels)**: uma lista de cenas com cortes secos. A fala da apresentadora (ADR-24) segue inteira por baixo dos cortes.

- **Cenas** (`src/rendering/montagem.ts`, puro e testado):
  - **Fala no terreno**: o vídeo original dela em tela cheia (cover), sem cena 3D;
  - **Revelação**: ela continua no mesmo lugar do quadro; o fundo real some de baixo para cima (cortina com borda suave de 12 %) e mostra a obra 3D atrás dela, que **sobe** do terreno à pronta durante a cena (`obra` de 0 a 1, com início e fim suaves);
  - **Obra**: câmera do drone (trecho da montagem ou do passeio pela obra pronta, `trechoDoVoo`) ou um preset com movimento lento (`poseDaCena`: aproximação de 8 % e giro de 3,4°; a órbita anda 15 % da volta); a apresentadora fica oculta, recortada no canto ou em tela cheia, e a assinatura aparece nessas cenas;
  - **Marca**: a vinheta parada, com @daniellapompeuengenharia.
- **Duração:** cada cena tem um peso (parte do vídeo), então as durações acompanham a fala. `normalizar` garante 0,8 s por cena e uma única marca, a última. Sem a fala, ficam só cenas de obra e a marca.
- **Roteiro Reels** (padrão): Fala 15 % → Revelação 25 % → Passeio de drone 40 % → Volta recortada em órbita 12 % → Marca 8 %.
- **Camada da apresentadora:** dois planos com a mesma textura e a mesma máscara: recortado (ADR-24) e tela cheia. O shader do plano cheio aplica a cortina (`cortinaRevelacao`, a mesma conta testada no Node). A segmentação roda uma vez por quadro.
- **Interface:** faixa proporcional das cenas (com a fórmula na dica e a cena da prévia destacada) e lista editável (tipo, segundos, câmera, obra de–até %, pessoa, ordem, excluir, acrescentar, **Roteiro Reels**). Fica gravada em `video.montagem` (null = Roteiro Reels).
- **Aviso honesto:** com recorte por fundo verde, a abertura mostra o pano verde. A revelação pede a fala gravada no terreno, com recorte por IA.
- Com montagem, a vinheta global de abertura e encerramento sai: a marca é uma cena.

**Voo automático (pedido: "a velocidade do voo automático está fora de controle; por padrão gere um tour completo externo, interno e finalize com outro tour externo parando com a visão da fachada frontal").**
- **Antes:** a viewport tocava o voo inteiro em 30 s, qualquer que fosse o comprimento. O sobrado tem 344 m de voo, o que dava 11,5 m/s.
- **Agora:** velocidade de cruzeiro fixa de **2,5 m/s** (`VELOCIDADE_VOO`). A duração é o comprimento ÷ 2,5 m/s, mais a parada final: 2 min 26 s no sobrado e 3 min 27 s na casa térrea. No vídeo, a velocidade continua sendo o comprimento ÷ a duração escolhida.
- **Roteiro da obra pronta:**
  - volta completa por fora;
  - entra pela porta da frente, faz o passeio interno (escada, cômodo mais distante e sala);
  - **sai pela porta da frente** (a folha abre também na saída);
  - **dá outra volta inteira por fora**, subindo um pouco;
  - **para de frente para a fachada frontal** (+z, centrada, afastada como o preset Frontal) nos últimos 6 % do tempo (`PARADA_FINAL`).
- O teste de colisão do voo inteiro continua passando: nem paredes nem portas são atravessadas.

**Barra da viewport:** o seletor de luz fica sempre na barra, inativo na aparência Técnica. Antes ele sumia, e os botões mudavam de lugar ao trocar Realista ↔ Técnica. O teste de navegador confere as posições.

**Correção junto:** o caminho do GIF não aguardava o desenho assíncrono do quadro (INC-10), então quadros com a apresentadora saíam atrasados. O teste de navegador agora confere o conteúdo do GIF por cena.

**Limites.**
- A cortina não casa a perspectiva da filmagem com a câmera 3D: a câmera da revelação é escolhida (frontal por padrão), e a cortina de baixo para cima disfarça a diferença.
- Vídeos muito curtos deixam o passeio do drone rápido e rente às paredes.
- Fotos fotorrealistas, pessoas animadas, legendas, números animados, logo em traço e música ficam para os próximos incrementos (as legendas pela transcrição no navegador e por .srt, escolha do usuário).

**Verificação.**
- Vitest: roteiro (soma 1, com e sem fala), limites de `cenaNoTempo`, normalização (mínimo e marca única), cortina (cheia → vazia, de baixo para cima, monótona), avanço da obra, câmera das cenas e trecho do voo.
- Playwright, com MP4 para WhatsApp e GIF:
  - quadro da abertura com o pano verde;
  - fim da revelação sem verde;
  - passeio sem a pessoa;
  - marca em grafite;
  - voz em AAC audível;
  - edição da lista.

## ADR-26 — Sol real (local, data e orientação), Insolação e ciclo do dia

**Status:** aceito em 2026-10-07 (INC-12).

**Pedidos.**
- "Quero que o voo automático considere a orientação da casa para mostrar o impacto na luz do sol sobre a edificação quando escolher entardecer. Planeje um voo automático passando pelas 3 fases do dia (Dia, Entardecer e Noite), pode adicionar o nascer do sol também, onde exatamente bate o sol considerando a data da simulação/geração do vídeo."
- "Utilizar o mesmo recurso usado no projeto modulus onde mostra a incidência do sol com a projeção das sombras de acordo com a hora do dia, mas sobre a imagem gerada pelo sistema."

**Decisões do usuário:**
- norte: o do IFC e, sem ele, a bússola na tela;
- local: o do IFC, depois o município e, por último, Fortaleza;
- ciclo: time-lapse contínuo.

**Sol** (`src/rendering/sol.ts`, puro):
- fórmulas do NOAA (Meeus: declinação, equação do tempo, ângulo horário e refração), com precisão de cerca de 0,5°;
- hora de Brasília (UTC−3, sem horário de verão);
- nascer e pôr com elevação de −0,833°;
- datas como dia civil (ADR-05).

**Convenção do norte:** `norteGraus` é o rumo para onde a **fachada frontal (+z da cena)** olha. O sol de rumo A fica na direção `(−sin(A−θ)·cos e, sin e, cos(A−θ)·cos e)`. Com a frente ao norte, o leste fica em −x (à esquerda de quem olha a fachada). Fachadas: frontal θ, lateral esquerda θ+90°, fundos θ+180°, lateral direita θ+270°.

**IFC** (`parseIfc.ts`):
- `IfcSite.RefLatitude/RefLongitude` (ângulos compostos);
- `TrueNorth` do contexto geométrico, convertido para a cena: o web-ifc põe Z para cima e −Y do IFC vira +z, que é a frente; o rumo da frente é o ângulo, no sentido horário, do norte até −Y.

O sobrado de exemplo passou a ter Fortaleza e a frente para 70° (lés-nordeste). Os GUIDs e as contagens não mudaram.

**Municípios:** coordenadas das 19 sedes da RMF (IBGE, Localidades, pelo conjunto `kelvins/municipios-brasileiros`) em `MUNICIPIOS`.

**Luz contínua** (`iluminacao.ts`):
- `parametrosDoSol(elevação)` interpola cinco pontos de controle (25°, 10°, 3°, −2°, −8°): cor e intensidade do sol (abaixo de 0° vira o luar, alto e do lado oposto), céu, chão, exposição, turbidez, Rayleigh, neblina e luminárias;
- as luminárias vão de 0 a 1 entre 3° e −8°;
- o brilho (bloom) fica só abaixo de 0°: com o sol acima do horizonte, o céu passaria do limiar;
- o céu é o de Preetham com o sol real e, abaixo de −4°, o céu noturno;
- a `Cena` refaz o céu e os reflexos (PMREM) só quando o sol anda mais de 0,5° ou o céu troca de tipo.

**Luzes:** Nascer (nascer + 20 min), Dia (10h), Entardecer (pôr − 35 min), Noite (pôr + 50 min) e **Ciclo**. A data é a do dia da obra (no vídeo, a de cada quadro).

**Ciclo do dia no voo** (`cicloDia.ts`):
- pontos-chave: amanhecer (nascer − 25 min) no começo → 12h quando a obra fica pronta → 15h30 ao entrar → **hora dourada no instante da última volta externa em que a câmera está diante da fachada que recebe o sol da tarde** → noite (pôr + 50 min) no fim do movimento → parada à noite na fachada frontal, com as luminárias acesas;
- as marcas das fases saem do próprio voo (`Voo.marcas`);
- no vídeo, a câmera Drone e as cenas de drone da montagem seguem o voo; as outras câmeras correm o dia pela fração do vídeo.

**Insolação** (botão na viewport, só no Realista), como no modulus (`modulus/gerador/insolacao.js`), aqui sobre a imagem 3D:
- controle de hora (5h a 19h, passo de 15 min);
- o sol real move as **sombras do 3D**;
- arco tracejado do sol no dia, o sol com halo e a linha até a casa;
- faixas laranja ao pé das fachadas ao sol, com a opacidade pelo cosseno da incidência;
- painel com altura, azimute e rumo, as fachadas ao sol e o **sol direto nas fachadas no dia** (Σ DNI × cos da incidência, das 6h às 18h, passo de 15 min; DNI de Meinel como no modulus), com a fórmula na dica;
- opção "Mostrar a insolação no vídeo".

**Aba Vídeo, "Sol e orientação":** bússola (planta com a frente embaixo, o N e o sol do entardecer), o rumo da frente com a origem, o local com a origem e o resumo "nasce… bate na…; no entardecer, bate na…".

**Também neste incremento:**
- marca da cliente no cabeçalho (monograma, DANIELLA POMPEU e "Simulação 4D de obras residenciais");
- o slogan do produto saiu do cabeçalho (fica na tela inicial, na assinatura do vídeo e no relatório).

**Limites:**
- só a radiação direta (como no modulus);
- sem manchas de sol no piso pelas janelas, porque as sombras do 3D já mostram onde o sol entra;
- fora da RMF e sem coordenadas no IFC, o local é Fortaleza, e a tela diz isso.

**Verificação.**
- Vitest:
  - meio-dia solar (90 − |lat − declinação|);
  - nascer e pôr entre 5h05–5h45 e 17h10–17h50 nas quatro estações;
  - azimute do nascer (66° em junho, 114° em dezembro);
  - convenção do norte e fachadas, DNI e radiação por fachada (em junho, o norte supera o leste; em dezembro, o sul supera o norte);
  - luz contínua, ciclo monótono e origem do local e do norte;
  - leitura do IFC do sobrado.
- Playwright:
  - sol do entardecer igual ao calculado;
  - bússola girando o sol;
  - Insolação às 7h (frontal) e às 16h (fundos);
  - ciclo começando no amanhecer.

## ADR-27 — Acabamentos do sobrado de exemplo e regras 4D dos acabamentos

**Status:** aceito em 2026-10-07 (INC-13).

**Pedido:** "Consegue melhorar os acabamentos do modelo tipo sobrado exemplo? Paredes, portas, janelas…"

**Decisão.** O gerador do sobrado (`tools/gerar_sobrado_ifc.py`) ganha os acabamentos como elementos próprios. Eles ficam no fim do arquivo, depois da mobília, e os GUIDs anteriores não mudam. São 32 elementos novos: de 125 para 157 com geometria e de 144 para 176 produtos.
- **Janelas** (`IfcCovering MOLDING`):
  - caixilho de alumínio preto (perfil de 5 × 7 cm), com montante central nas janelas de 1,5 m ou mais (de correr);
  - peitoril de granito para fora, com 4 cm de pingadeira.
- **Portas** (`IfcCovering MOLDING`): batente forrando o vão, guarnições de 7 cm nas duas faces e soleira de granito. As portas externas são de madeira; as internas, de laca branca.
- **Paredes:**
  - rodapé de porcelanato de 7 cm nas faces internas, sem os vãos das portas (`SKIRTINGBOARD`);
  - na fachada frontal, pedra em cacos dos dois lados da porta de entrada e ripado de freijó entre as janelas dos quartos (`CLADDING`), no estilo dos projetos da cliente (prints em `docs/referencias/`).
- **Regras 4D** (`src/fourd/regras.ts`), que valem para qualquer IFC:
  - `esquadrias` passa a instalar também `IfcCovering MOLDING` (caixilhos, guarnições, peitoris, soleiras);
  - `revestimento` passa a construir também `IfcCovering SKIRTINGBOARD` e `CLADDING`.
- **Materiais realistas** (`aparencia.ts`): "esquadria/caixilho/anodizado" vira perfil metálico liso com a cor do IFC (antes, "alumínio" caía na telha metálica); "granito/peitoril/soleira", pedra polida lisa com a cor do IFC; "laca", pintura acetinada.
- **Navegação:** os revestimentos não barram o drone (`IfcCovering` já estava fora do mapa de ocupação). O batente estreita o vão em 3 cm de cada lado, e o teste de colisão do voo inteiro continua passando.

**Verificação.** Vitest: contagem do sobrado, voo sem colisões e luminárias. Playwright: as contagens nas telas e as capturas da fachada frontal, da porta e dos fundos.

## ADR-28 — Olhar suave no voo do drone e carimbo da versão publicada

**Status:** aceito em 2026-10-08.

**Pedido.** "Identifique porque o vídeo gerado não é fluido e adicione no frame superior a data e hora DDMMAAAA-HHMM da versão publicada."

**Diagnóstico.** A codificação é determinística (cada quadro tem carimbo exato de 1/fps) e o deslocamento do drone já era constante (≈0,2 m por quadro a 30 fps). O que saltava era a **direção do olhar**: a velocidade constante (ADR-23) refaz o tempo só pela posição, e a orientação mudava de golpe nas emendas dos trechos, nas quinas do passeio, no fim de cada `seguir` e nas meias-voltas. Medido no sobrado de exemplo (60 s, 30 fps): giro de até **124° num único quadro** e 225 quadros acima de 3°.

**Decisão.** `olharSuave` (`src/rendering/drone.ts`): rumo (azimute desenrolado), inclinação e lente passam por um filtro gaussiano ao longo do caminho (σ = 4 m, `SUAVIZACAO_OLHAR_M`). Rumo e inclinação em separado: numa meia-volta o olhar gira de lado, como um piloto, em vez de mergulhar para o chão (a média de vetores opostos aponta para baixo). A posição não muda, então colisões e tempo das portas permanecem como estavam. Resultado: giro máximo de 3,9° por quadro.

**Carimbo.** O build grava `__VERSAO_PUBLICADA__` (DDMMAAAA-HHMM, horário de Fortaleza) e o cabeçalho o exibe à direita, com dica; no `vite dev` aparece "local".
