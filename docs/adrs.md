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
- marca da cliente no cabeçalho (monograma, DANIELLA POMPEU e "Simulação 4D de obras residenciais"; em 2026-10-08 a segunda linha voltou a ser o slogan do logo, "ENGENHARIA QUE TRANSFORMA", e a descrição do produto foi para a dica);
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

## ADR-29 — Planilha única da obra

**Status:** aceito em 2026-10-08 (INC-14).

**Pedido.** "Precisamos repensar a estrutura do sistema de acordo com a sua finalidade, que é GERAR IMAGENS DE QUALIDADE PROFISSIONAL mesclando vídeo da engenheira com a geração da imagem da obra de acordo com os dados carregados via planilha. Deve ser uma planilha apenas, contendo todas as informações necessárias, organizadas e separadas por abas de acordo com a natureza."

**Contexto.** Os dados entravam por caminhos separados: IFC, cronograma (CSV, XLSX ou JSON), `fotos.csv`, parâmetros da casa num modal, município na estimativa, norte na bússola e opções do vídeo no painel. Este é o primeiro de quatro incrementos que transformam o app num gerador de vídeo e documento. Os próximos são o assistente com várias falas (INC-15), o documento PDF e DOCX (INC-16) e o manual (INC-17).

**Decisão.**
- **Modelo:** `public/modelos/obra-dani.xlsx`, gerado por `tools/gerar_planilha_modelo.py` (openpyxl, `npm run planilha`).
  - **Abas:** LEIA-ME, Obra, Modelo, Cronograma, Vínculos, Falas, Fotos, Vídeo, Documento e Listas (oculta).
  - **Preenchimento:** listas suspensas, cabeçalho congelado e o sobrado de exemplo preenchido, com dados reais até 15/08/2026.
- **Formato das abas:**
  - Obra, Modelo, Vídeo e Documento são de **campo e valor**.
  - As outras têm uma linha por item, com as mesmas colunas dos arquivos avulsos de antes.
  - Abas e cabeçalhos são reconhecidos sem acento nem caixa.
- **Leitura:** `src/planilha/ler.ts`. `interpretarAbas` é puro e reaproveita `importarLinhas` (cronograma), `serialParaDia` (datas do Excel) e `MUNICIPIOS`.
  - Cada problema diz a aba e a linha e vai para a aba Avisos.
  - Um erro numa aba não impede as outras.
  - Sem IFC citado e sem medidas completas na aba Modelo, um erro avisa que não há como montar a casa.
- **No app:** `src/app/planilha.ts`.
  - **Sem IFC citado:** a casa é gerada pela aba Modelo e vira projeto salvo.
  - **Com IFC citado:** o cronograma já entra, e um aviso pede o IFC. Quando ele chega, o projeto leva o nome da obra, e os vínculos da planilha são reaplicados.
  - **Aba Vídeo:** formato, fps, qualidade, aparência, luz, animação e marca. O rumo da fachada vira o norte do sol. Por ora, a duração usa a opção mais próxima do painel Vídeo.
- **Exportar planilha:** botão no topo do estúdio. `planilhaDoEstado` + `escreverPlanilha` levam de volta para o .xlsx o que foi ajustado no app.
  - O SheetJS livre não grava listas suspensas: elas existem só na planilha modelo.
- **Projetos:** a obra, as falas, as fotos citadas, o documento e os vínculos ficam no estado (`planilha`) e no `.4dstudio` (`planilha.json`, só quando existe).
- **Compatibilidade:** um .xlsx sem as abas Obra e Cronograma continua sendo lido como cronograma avulso.

**Verificação.**
- **Vitest:**
  - planilha modelo inteira sem erros;
  - problemas com aba e linha;
  - ida e volta escrever → ler igual;
  - cronograma avulso recusado;
  - `.4dstudio` com a planilha.
- **Playwright:**
  - planilha + IFC citado, com cronograma, município, rumo, formato, nome do projeto, vínculo e exportação relida;
  - planilha sem IFC (casa paramétrica salva);
  - cronograma avulso em .xlsx.

## ADR-30 — Assistente em três passos, várias falas e área de Gestão

**Status:** aceito em 2026-10-08 (INC-15).

**Pedido.** "Assistente simplificado com o carregamento dedicado por tipo de arquivo (planilha, vídeos da engenheira sobre o conteúdo, ...) e, para não perdermos nada, as telas atuais são movidas para uma área de gestão e ajustes de dados."

**Decisão.**
- **Rotas:** sem roteador novo, só um `hashchange` no `App.tsx`.
  - `#/` abre o **assistente**, que passa a ser a tela principal.
  - `#/gestao` abre o estúdio completo de antes, com tela inicial, viewport, painéis e modais.
  - O topo alterna entre "Gestão e ajustes" e "← Assistente".
- **Passo 1, Carregar** (`src/assistente/PassoCarregar.tsx`): um cartão por tipo de arquivo, cada um com zona de soltar, botão e selo de situação (ok, falta, aviso, opcional).
  - **Planilha:** obrigatória, com link para a planilha modelo.
  - **Projeto IFC:** confere o nome citado na aba Obra. Sem IFC, a casa vem da aba Modelo.
  - **Vídeos da engenheira:** vários de uma vez, cada um casado com a linha da aba Falas pelo nome.
  - **Fotos:** data, local, descrição e etapa vêm da aba Fotos quando não há `fotos.csv`.
  - **Ordem livre:** com a planilha aberta, abrir o IFC não descarta as falas e as fotos já enviadas (são da mesma obra).
- **Várias falas** (`src/app/falas.ts`, `montagem.roteiroDasFalas`):
  - **Voz:** as falas em sequência, cada uma no seu corte (`inicio_s`–`fim_s`). `abrirQuadros` e `audioDaFala` aceitam uma `FonteFala` (um arquivo ou a lista de trechos). Cada arquivo é aberto só quando chega a sua vez. Os quadros de outro formato entram cobrindo a tela do primeiro, e o áudio é emendado a 48 kHz.
  - **Roteiro pelas falas:**
    - **terreno:** o quadro original (45 %) e a revelação (55 %);
    - **sobre a obra / só a voz:** tomadas de cerca de 3,5 s em rodízio de câmeras, com ela recortada ou fora do quadro. A obra se forma do terreno à pronta ao longo dessas falas;
    - **última fala sobre a obra (≥ 6 s):** termina com o passeio do drone (40 %, até 10 s);
    - **marca:** fecha com 2,5 s (`MARCA_S`).
    - Duração = soma das falas + 2,5 s.
  - **Avisos:** arquivo que falta, corte além do fim e recortes diferentes. Nesse último caso, vale o recorte da primeira fala.
  - Os vídeos ficam no IndexedDB (`<projeto>/fala/<nome>`), fora do `.4dstudio`, como o da apresentadora.
- **Passo 2, Conferir** (`PassoConferir.tsx`):
  - ficha da obra (prazo e avanço planejado e real na data de referência, com a fórmula na dica);
  - avisos da planilha e das falas;
  - **prévia grande** no formato do vídeo (9:16, 16:9 ou 1:1), com aparência e luz;
  - faixa de cenas: cada clique leva a câmera ao meio da cena (`mostrarNaMontagem`) e sobrepõe o quadro da fala. É o original na abertura e o recorte real (`previaApresentadora` com fundo transparente) nas outras cenas.
  - A `Viewport` ganhou o modo `simples`, só a imagem, sem barra nem legenda.
- **Passo 3, Gerar** (`PassoGerar.tsx`):
  - só as saídas MP4 que o navegador consegue gerar (1080p, quando há H.264 nativo);
  - progresso, cancelar, prévia do resultado e download;
  - nome `<obra>-<AAAAMMDD>` (o renderizador acrescenta `-whatsapp` nessa saída).
- **Geração compartilhada:** `src/app/videoDaObra.ts` (`gerarVideoDaObra`) saiu de dentro do painel Vídeo. O painel e o assistente usam a mesma rotina: sol real por quadro, insolação, marca, vinheta, apresentadora e câmera.

**Limites.**
- A prévia é uma aproximação: mostra o meio de cada cena. A cortina da revelação e o movimento de câmera só aparecem no vídeo.
- O PDF e o DOCX vêm no INC-16, e o manual e a limpeza dos textos, no INC-17.

**Verificação.**
- **Vitest:**
  - roteiro das falas (ordem, durações, obra sempre avançando, rodízio de câmeras, passeio e marca);
  - mapeamento tempo → arquivo e corte;
  - casamento das falas com os arquivos.
- **Playwright** (`e2e/assistente.spec.ts`):
  - planilha com duas falas, falas antes do IFC, conferir (ficha, faixa e proporção da prévia) e gerar o MP4;
  - o MP4 tem vídeo e áudio, 6,5 s, voz nos 4 s das falas e silêncio na marca;
  - Gestão e volta.
  - A bateria antiga passou a abrir em `#/gestao`.

## ADR-31 — Qualidade do vídeo: recorte limpo, câmeras, luz de fachada, entorno urbano e casa paramétrica completa

**Status:** aceito em 2026-10-08.

**Pedido.** "Verifique a qualidade do MP4 gerado pelo sistema e identifique onde melhorar. Ainda não está gerando a casa de modo profissional." E depois: "deixe o PDF e o DOCX para o final do projeto; vamos deixar a geração de vídeo o melhor possível antes."

**Diagnóstico** (vídeo de 51,6 s, 1080 × 1920, H.264 Main a 5,7 Mb/s com AAC, guardado em `docs/referencias/`, fora do git):
- a codificação estava boa;
- os problemas eram de conteúdo e foram atacados em seis frentes, uma por item abaixo.

**Decisão.**
1. **Manchas soltas do recorte por IA → `LimpezaDeMascara` (`composicao.ts`, puro).**
   - **Causa:** o recortador marcava fragmentos do fundo quando a pessoa não estava de frente.
   - **Correção:**
     - ficam só a maior mancha contínua e as partes com ≥ 30 % dela, com a borda suave original a até 2 px;
     - suavização no tempo (35 % do quadro anterior);
     - a pessoa some e volta aos poucos (±0,2 por quadro) quando a cobertura fica abaixo de 2 % ou acima de 70 %.
2. **Câmeras que denunciavam o 3D.**
   - **Vista de cima:** saiu das tomadas, porque por dentro virava um piso branco.
   - **Passeio final na casa paramétrica:** vira uma volta por fora, porque a casa não tem interior para mostrar.
3. **Assinatura.**
   - **Conteúdo:** só nome e slogan. A linha do produto ficava ilegível no celular, e a vinheta fecha com o @.
   - **Posição no vertical:** no topo, abaixo dos 12 % que o cabeçalho do Reels cobre, fora da área da pessoa e da legenda.
4. **Áudio.**
   - **Normalização:** voz em −18 dBFS de média (RMS dos trechos com fala) e pico até −1 dBFS.
   - **Fórmula:** ganho = mín(10^((alvo − rms)/20), 10^((pico máx − pico)/20)).
5. **Luz e ambiente.**
   - **Luz Dia:** era às 10h, com o sol quase a pino em Fortaleza e as sombras escondidas sob a casa. Passa a ser o instante, de manhã ou à tarde, em que o sol está a 35° do lado da fachada frontal (`minutosDaLuzDia`), com sombras longas e volume.
   - **Equilíbrio:** sol mais forte que o céu, para a sombra ter contraste; céu mais limpo (turbidez 2,6); exposição 0,74, para o branco não estourar; neblina mais leve.
   - **Entorno urbano** (`montarEntorno`):
     - calçada, meio-fio e rua asfaltada com faixa;
     - muros de 1,8 m nas divisas;
     - casas vizinhas em tons de bairro, dos lados, em frente e no fundo;
     - árvores na calçada.
     - Vizinhos e árvores ficam fora do caminho do drone: além de 2,6 × o raio da casa, e as árvores fora do eixo da fachada.
6. **Casa paramétrica completa.**
   - **Fachada frontal:** porta de entrada, janela larga, peitoris de granito e soleiras (`MOLDING`) e barrado de pedra (`CLADDING`).
   - **Varanda:** piso, dois pilares de madeira (`USERDEFINED`, para não mudar a contagem dos pilares estruturais) e telhado com 15 % de caída.
   - **Externo:** calçada de 0,8 m em volta, jardim na frente (`IfcGeographicElement` PAISAGISMO) e caminho de pedra até a varanda.
   - **Regras:** tudo cai nas regras existentes (esquadrias, revestimento, cobertura, estrutura e paisagismo), e o teste "100 % dos elementos ligados" continua passando.

**Ferramenta.** `tools/quadros-ambiente.mjs` tira quadros de comparação do sobrado e da casa da aba Modelo, nas vistas Externa, Isométrica e Frontal.

**Limites.**
- O resultado é o de uma boa maquete eletrônica em tempo real.
- O nível fotográfico, com iluminação global e vegetação densa, fica para o motor de render no Blender, a ser planejado, rodando também no Fedora.

**Verificação.**
- **Vitest:**
  - limpeza da máscara (partes, presença sem piscar, suavização);
  - volume (alvo, pico, silêncio);
  - luz Dia (manhã/tarde conforme a frente, 35°, o sobrado por volta das 8h);
  - roteiro sem vista de cima e com volta por fora;
  - fachada da casa paramétrica.
- **Playwright:** a bateria inteira.

## ADR-32 — Passeio externo, interno ou ambos; nomes com data e hora; Entardecer e degradê

**Status:** aceito em 2026-10-08.

**Pedidos.**
- "Planeje oferecer a opção de passeio externo, interno ou ambos."
- "Ajuste o padrão de geração do nome dos arquivos exportados pelo sistema para incluir HHMM."
- Correções da avaliação do vídeo gerado (`a.mp4`, guardado fora do git).

**Contexto.** Com o sobrado IFC, o passeio interno ficava colado nas paredes: o voo inteiro do drone (cerca de 2,5 min, com volta, entrada, escada e quartos) era espremido em ~10 s. A correção imediata (`660b38d`) passou o fim do vídeo do assistente para sempre uma volta externa. Esta decisão devolve o interior, agora como escolha.

**Decisão.**
1. **Opção "Passeio"** (`ConfigVideo.passeio`: `externo` | `interno` | `ambos`; padrão Externo, que funciona em qualquer casa).
   - **Onde se escolhe:** na aba **Vídeo** da planilha (lista suspensa; vazio = externo) e nos segmentos *Externo · Interno · Ambos* do passo **Conferir** do assistente.
   - **Interior só com entrada:** se o voo não acha a porta de entrada (`voo.entrada === null`), Interno e Ambos ficam desabilitados, com a dica dizendo por quê, e o vídeo usa Externo.
   - **A Gestão** continua com o voo completo, para vídeos longos.
2. **Cenas finais**, antes da marca (`cenasDoPasseio`, `duracaoDoPasseio`), tiradas da última fala sobre a obra, quando ela tem 6 s ou mais:
   - **Externo:** "Volta por fora", até 10 s (40 % da fala);
   - **Interno:** "Por dentro", até 14 s (50 %);
   - **Ambos:** "Volta por fora" (40 %) → corte → "Por dentro" (60 %), juntos até 16 s (55 %).
   - A faixa de cenas mostra esses nomes (`Cena.rotulo`) em vez de "Obra".
3. **"Volta por fora"** (`Cena.percurso = "volta"`): órbita baixa, a 9° de elevação, à altura de quem olha a casa da rua, andando um terço da volta (120°).
4. **"Por dentro"** (`trechoInterno`, `quadroDoVooNaCena`): um trecho do próprio voo do drone, sem comprimir.
   - Começa 3,5 m antes da porta de entrada (`marcas.inicioInterno`) e anda a **1,0 m/s**, passo de quem caminha.
   - **Fórmula:** u_voo = início + u × metros da cena ÷ (comprimento ÷ fimMovimento), com metros = mín(1,0 × duração, caminho até `inicioVoltaFinal`).
   - Se o caminho é curto, desacelera até 0,6 m/s e, se ainda sobrar tempo, termina parado no último ponto.
   - Campo de visão de no mínimo **75°**, como em vídeo de imóvel, para não encher a tela de parede.
5. **Rodízio das tomadas** (`CAMERAS_TOMADA`): começa pela isométrica, que mostra o lote inteiro, e perde a lateral, que costuma ser parede cega (isométrica, externa, frontal, órbita).
6. **Nomes dos arquivos exportados:** `<base>-AAAAMMDD-HHMM`, na hora local (`carimboArquivo()` em `src/utils/baixar.ts`), em todas as exportações: vídeo do assistente e da Gestão, planilha, `.4dstudio`, cronograma JSON/CSV, mapeamento e relatório PDF. Os arquivos modelo para download continuam com nome fixo.
7. **Luz Entardecer mais limpa** (`iluminacao.ts`, faixa de 3°): sol dourado, mas céu do azul ao laranja (turbidez 3,6 em vez de 8) e exposição 0,88 em vez de 1,0. A correção de cor não aquece de novo uma luz que já é dourada (`temperaturaDoSol`: 0 com o sol abaixo de 8°, o padrão a partir de 20°, linear no meio).
8. **Filtro degradê** (`acabamento.ts`, `degrade` 0,2): escurece o alto do quadro, como o filtro ND graduado dos fotógrafos, para o céu não estourar.

**Verificação.**
- **Vitest:** os três modos geram as cenas certas, na ordem e com as durações esperadas (soma = falas + marca); o trecho interno começa antes da porta, anda 1 m/s, não passa de `inicioVoltaFinal` e desacelera com caminho curto; a planilha lê e escreve "Passeio" na ida e volta e recusa valor fora da lista; carimbo dos arquivos.
- **Playwright:** a bateria inteira; o assistente escolhe Ambos, com falas de 2 s e 8 s.
- **Visual:** prévia com Ambos no sobrado IFC: "Volta por fora" baixa, com a rua, e "Por dentro" na porta de entrada, com pedra e madeira.

## ADR-33 — Entrada pela porta, mureta com gradil, fachada ao sol, gramado claro, céu azul, recorte limpo e esmaecimento para a marca

**Status:** aceito em 2026-10-08.

**Pedido.** Avaliação do vídeo `sobrado-de-exemplo-20261008-1421.mp4` (Realista, luz Dia, passeio Ambos, 51,6 s, 9:16) e "aplique, muro baixo".

**Diagnóstico.**
- **"Por dentro"** passava 7 s deslizando colado à fachada e só 3 s no interior. A marca `inicioInterno` fica no começo da transição do fim da volta até a porta, que corre paralela à fachada; o trecho ainda recuava 3,5 m antes disso.
- **Obra tampada aos 4–5 s:** não havia muro na frente (correção da primeira avaliação). Quem tapava era o **muro lateral de 1,8 m**, visto de lado pela câmera Externa baixa.
- **Vistas de cima escuras:** a foto do gramado tem média marrom-escura ([79, 61, 21]) e era só multiplicada por um verde.
- **Céu branco-acinzentado:** perto do horizonte o céu Preetham é pálido, e as nuvens (0,42) o deixavam branco.
- **Rua bege:** o asfalto usava o mapa de rugosidade do concreto e brilhava contra o sol.
- **Contorno claro na pessoa recortada:** a borda suave da máscara levava a cor do fundo.
- **Corte seco** do interior para a marca.

**Decisão.**
1. **Entrada pela porta:** nova marca do voo `marcas.naPorta` (o fim da transição, de frente para a porta, a 3,5 m dela). O trecho "Por dentro" começa ali + 2 m, isto é, a `ANTES_DA_PORTA_M` = 1,5 m da porta, olhando para ela, e entra em ~1,5 s.
2. **Divisas do lote** (`trechosDoMuro`, puro; escolha do usuário: muro baixo com grade):
   - **frente:** mureta de 0,5 m com gradil de barras finas até 1,4 m e **portão aberto** de 3 m no eixo da porta de entrada (o caminho do drone);
   - **laterais:** mureta com gradil do alinhamento até a fachada frontal, e muro de 1,8 m dali ao fundo;
   - **fundo:** muro de 1,8 m.
3. **Gramado:** `TOM_GRAMADO` = [104, 110, 74] (verde seco de lote) por `tingir`, no campo e na grama do IFC.
4. **Céu da luz Dia:** turbidez 2,0, rayleigh 2,4, nuvens 0,3; o degradê também puxa o alto do quadro para o azul, só com o sol alto (`tomCeu` = 0 no entardecer, para não azular a hora dourada).
5. **Asfalto fosco:** sem mapa de rugosidade, rugosidade 1 e reflexo do ambiente a 0,4.
6. **Recorte:** máscara da IA com erosão leve (`smoothstep(0,42; 0,78)`) e descontaminação da borda (onde a pessoa é semitransparente, a cor vem dos vizinhos opacos, média ponderada por alfa⁴ num raio de 2 texels).
7. **Fachada frontal sempre ao sol no vídeo com a luz Dia** (`solNaFachada`; escolha do usuário entre manter o sol real ou girar a luz):
   - **causa:** a luz Dia usa o sol real do dia simulado (ADR-26, ADR-31); em datas em que o sol a 35° passa por trás da casa (em Fortaleza, no inverno, ele fica ao norte), a frente ficava na sombra e as sombras vinham para a câmera;
   - **regra:** se o sol real está a até 60° da frente, fica; senão, gira para 40° da frente, do lado em que está (manhã ou tarde), com a mesma elevação;
   - **onde vale:** só no vídeo com a luz Dia. A viewport, a prévia, a Insolação e as outras luzes continuam com o sol real.
8. **Casas do outro lado da rua sem sombra** (avaliação do vídeo das 15h04): com a frente ao sol, essas casas ficam atrás da câmera nas vistas da frente, e a sombra dos telhados caía na rua em degraus, sem a casa no quadro. O usuário viu isso como "parte de uma escada" sobre o vídeo, entre 20 e 30 s. Só elas deixam de fazer sombra; as casas dos lados e do fundo continuam fazendo.
9. **Escada do vídeo original sobre a obra** (vídeos das 15h04 e 16h49, de 20 a 30 s): com a pessoa fora de cena ou pequena, a maior mancha da máscara da IA que encostava na base do quadro era a escada do fundo da gravação. Ela entrava semitransparente, porque a IA tem pouca certeza sobre ela. Agora a mancha só conta como pessoa com confiança média ≥ `CONFIANCA_MINIMA` (0,75) e sem saltar mais que `SALTO_MAXIMO` (20 % da largura) de um quadro para o outro enquanto a pessoa está em cena. Se não, a pessoa some aos poucos e pode voltar em outro lugar depois de sair.
10. **Sombras que sumiam numa sessão inteira:** o mapa de sombra do sol nascia com 512 px no primeiro quadro e era aumentado para 2048 sem ser descartado. O three redimensionava uma textura imutável ("glTexStorage2D: Texture is immutable", no `brave://gpu` do usuário) e a cena ficava sem sombra, dependendo de qual quadro saía primeiro (o vídeo das 16h49 saiu sem sombra; o das 15h04, com). `tamanhoDaSombra` descarta o mapa antes de mudar o tamanho.
11. **Esmaecimento para a marca:** nos primeiros 0,4 s da cena Marca, a vinheta entra sobre o último quadro da cena de obra anterior (opacidade em curva suave).

**Fora do escopo.**
- **Sombra no chão sob a pessoa:** os pés ficam fora do quadro; a sombra deslocada que já existe continua.
- **Letras sobre a camisa** (10–12 s): vêm do próprio vídeo da fala (legenda gravada na imagem). Envie o vídeo sem legenda.

**Ferramenta.** `tools/quadros-ambiente.mjs` aceita a data da simulação (4.º argumento), para ver a obra no começo.

**Verificação.**
- **Vitest:**
  - trecho interno no voo sintético e no sobrado real (começa de 0,5 a 2 m da porta, olhando para ela, e está dentro aos 2 s);
  - divisas (muro alto só atrás da fachada, portão no eixo da porta, casa encostada no alinhamento);
  - sol do vídeo (mantém o sol que já ilumina a frente; gira o de trás para 40°, do lado certo);
  - casas do outro lado da rua sem sombra; as dos lados e do fundo com sombra;
  - máscara: fundo com pouca certeza não vira pessoa; mancha que pula de lugar some aos poucos.
- **Quadros do sobrado** (20/04 e pronto, vistas Externa e Isométrica): obra visível pela grade, gramado claro, rua cinza.
- **Playwright:** a bateria inteira.

## ADR-34 — Sequência do vídeo: apresentação, narração, fotos emolduradas e trilhas, na ordem do usuário

**Status:** aceito em 2026-10-08.

**Pedido.**
- "Ajuste o título dos cards. Planilha, Projeto IFC, Apresentação, Fotos."
- Perguntas: vídeo sem apresentação, trilha sonora, narração e onde as fotos entram.
- Depois: "Faça tudo, as fotos se preocupe em usar algum tipo de borda para não aparentar amador. Na narração como fazer para o vídeo gerado não acabe repentinamente? [...] Após subir para o sistema todos os arquivos envolvidos na geração do novo vídeo o usuário poderá ordenar os audios, fotos e videos", com trilhas de início, de final e intermediárias.
- Duração: "pela duração da apresentação/narração".

**Antes:**
- sem vídeo de fala, roteiro fixo de 30 s, sem som;
- o único áudio era a voz das falas;
- as fotos não entravam no vídeo;
- a ordem vinha só da aba Falas.

**Decisão.**
1. **Cartões:** Planilha, Projeto IFC, **Apresentação** (vídeos e áudios), Fotos e o novo **Trilha sonora**.
   - Um áudio no cartão Apresentação é uma **narração**: só a voz, com a obra na tela.
   - Narração que a aba Falas não cita entra depois das falas; vídeo não citado continua de fora.
2. **Sequência** (`src/app/sequencia.ts`, puro). Itens: fala, narração, foto e, sem voz, "obra em silêncio" (pelo tempo da aba Vídeo).
   - **Ordem padrão:** as vozes na ordem; cada foto, pela data, depois da voz em que o avanço acumulado passa do avanço da obra no dia dela; fotos sem data no fim.
   - **Ordem salva** (`ConfigVideo.sequencia`, ids `voz:`/`foto:`): itens novos entram junto do vizinho da ordem padrão.
   - **No passo Conferir:** painel "Sequência do vídeo" com ↑ ↓ e arrastar, duração de cada foto (2 a 6 s, padrão 3) e "Restaurar ordem".
3. **Trilhas:** cada uma entra no início, antes de um item ou no final (8 s antes do fim dos itens), com volume de 0 a 100 e ▶ para ouvir 5 s.
   - **Sem atropelo:** uma trilha a menos de 2 s da anterior vai para o meio do caminho entre a anterior e o fim. Num vídeo curto, "início" e "final" caíam no mesmo segundo, e a final cobria a de abertura (vídeo do usuário das 18h26).
   - **Padrão:** uma = início; duas = início e final; mais = as do meio espalhadas antes das vozes.
4. **Roteiro** (`roteiroDasFalas` recebe a sequência):
   - foto = cena `foto`: a obra parada no dia da foto, vista isométrica, sem contar no avanço;
   - **respiro** de 1 s depois da última voz: a última cena continua, e a pessoa já não aparece, para não congelar o quadro;
   - **total** = voz + fotos + 1 s + marca de 2,5 s.
5. **Foto emoldurada** (`fotoNoVideo.ts`):
   - véu escuro (`#1c1a17` a 55 %) sobre a obra;
   - passe-partout cor de papel (`#f5f0e6`) com filete dourado (`#b88848`) e sombra suave;
   - janela 4:3 (3:4 com foto em retrato, pelo EXIF);
   - legenda em IBM Plex Sans: data · etapa em caixa-alta espaçada e a descrição em até duas linhas;
   - zoom lento de 1 a 1,06; entra subindo 3 % em 0,35 s e sai esmaecendo em 0,3 s;
   - tamanho: 84 % da largura no vertical, 70 % da altura no horizontal;
   - a prévia do Conferir usa o mesmo desenho.
6. **Áudio** (`mixagem.ts`, puro):
   - voz pela linha do tempo (falas e narrações no seu corte, silêncio nas fotos), normalizada como no ADR-31;
   - cada trilha do ponto em que entra até a próxima, em laço com cruzamento de 1 s, fade-in de 1 s na primeira e cruzamento de 1,5 s entre trilhas;
   - **ducking:** −10 dB sem voz e −20 dB sob a voz (× volume), pelo envelope da voz (janelas de 50 ms, limiar de −45 dBFS, ataque de 0,15 s antecipado, soltura de 0,6 s);
   - **fim sem corte seco:** respiro, marca esmaecendo (ADR-33), fade-out da trilha nos últimos 3 s e o último 0,3 s em silêncio;
   - limitador: pico ≤ −1 dBFS.
7. **Planilha:** abas novas **Sequência** (ordem, tipo, arquivo, duracao_s) e **Trilhas** (arquivo, entra = início | final | "antes de ‹arquivo›", volume).
   - Erros saem com aba e linha.
   - "Exportar planilha" leva a ordem e as trilhas ajustadas.
   - As trilhas ficam no IndexedDB (`chaveTrilha`), como as falas.

**Verificação.**
- **Vitest:**
  - sequência (ordem padrão, ordem salva, mover, trilhas, instante de entrada);
  - mixagem (ducking, envelope, fade-out, cruzamento, laço, limitador);
  - moldura (proporções e animação);
  - `montarFalas` com narração, fotos, obra em silêncio e trilhas;
  - planilha (ida e volta, erros de Sequência e Trilhas);
  - roteiro com respiro.
- **Playwright** (caso novo do assistente):
  - títulos dos cartões; narração WAV, foto PNG e trilha WAV; a foto sobe para o começo; prévia da foto;
  - MP4 de 10,5 s com áudio: trilha na foto, narração por cima e o fim em silêncio.
- **Visual:** quadros da foto emoldurada no vertical e no horizontal.

## ADR-35 — MP4 do Firefox que não abria ("Codificado em AVC1")

**Status:** aceito em 2026-10-09.

**Problema.** O MP4 1080p gerado no Firefox (Windows) era salvo, mas não tocava; o player dizia "Codificado em AVC1". No Brave e no Edge, o mesmo vídeo saía correto.

**Causa.** O codificador H.264 do Firefox entrega ao app o registro de configuração (caixa `avcC`) com o cabeçalho da NAL repetido no SPS e no PPS (`67 67 4d 40 28…`, `68 68 ce…`). O mediabunny grava o registro como recebe. Quem lê o SPS do registro encontra o perfil 103, que não existe, e recusa o vídeo. Dentro dos quadros, o SPS e o PPS estão corretos.

**Decisão** (`src/rendering/avcc.ts`).
- Depois da geração em MP4 alta, o app confere o `avcC`. Se ele estiver estragado, o app o refaz com o SPS e o PPS do primeiro quadro-chave (ou, sem eles, tirando o byte repetido) e remonta o MP4 **sem recodificar**: os pacotes de vídeo e de áudio são copiados na ordem do tempo.
- Com o registro bom (Chromium, Edge, Brave), o arquivo sai como está.

**Verificação.**
- Vitest com os bytes do arquivo real do Firefox: registro válido × estragado, leitura e montagem, conserto pelo quadro-chave e pelo byte repetido.
- O arquivo do Firefox de 09/10 (30 s, 900 quadros) saiu consertado, com o mesmo número de quadros.
- MP4 gerado no Edge depois da mudança: registro igual ao de antes.

**Correção (2026-10-09, tarde).** No navegador, o conserto não rodava: a conversão do registro em bytes testava `SharedArrayBuffer`, que só existe em páginas isoladas (COOP/COEP); a referência quebrava e o erro era engolido. O teste em Node não pegou, porque lá a variável existe. Agora a conversão usa `ArrayBuffer.isView`, a falha vira aviso no console, e há um teste que remove `SharedArrayBuffer`. Conferido no Edge refazendo o vídeo de imagens com voo gerado no Firefox, que antes só tinha áudio.

## ADR-36 — Sol do vídeo de lado: fachada ao sol com sombras visíveis

**Status:** aceito em 2026-10-09. Revê a regra do sol do vídeo do ADR-33.

**Problema.** Os vídeos de 08/10 saíam sem sombra aparente. A sombra era desenhada, mas o sol do vídeo ficava a até 40° da frente da casa, e as câmeras também olham a casa de frente. Assim, a sombra de cada objeto caía atrás dele, fora do quadro.

**Como foi medido.** No Edge com GPU (o SwiftShader dos testes não desenha sombra), foram comparados quadros do mesmo vídeo com e sem sombra. A diferença média por pixel era de 0,9 a 1,5 nas vistas de frente e de 3,1 na vista alta.

**Decisão** (`solNaFachada`, em `src/rendering/sol.ts`).
- O sol do vídeo na luz Dia fica **sempre a 65° da frente**, do lado em que o sol real está (manhã ou tarde). A fachada continua ao sol, a lateral fica na sombra e a sombra da casa atravessa o gramado.
- A altura do sol fica limitada a **28°**. A partir de 25°, a luz é a de dia cheio (`iluminacao.ts`), então a sombra fica mais longa sem mudar o tom da luz.
- A viewport e a Insolação continuam com o sol real.
- Foram comparados 40°, 55° e 65°, com 35° e 28° de altura, na vista frontal e na diagonal. 65° e 28° deram a casa com volume sem escurecer a fachada.

**Resultado.** A diferença com e sem sombra subiu para 1,7 nas vistas de frente e 4,1 na vista alta.

**Próximo passo possível.** Nas vistas de frente, a sombra continua suave, porque o preenchimento do céu e do ambiente é forte. Reduzir esse preenchimento de dia daria sombras mais escuras, mas também muda o aspecto geral.

## ADR-37 — Vídeo de imagens: apresentação de projeto a partir de um PDF ou de imagens

**Status:** aceito em 2026-10-09 (INC-19, plano em `docs/planos/inc-19-video-de-imagens.md`).

**Pedido.** "Como aproveitar as imagens e gerar um vídeo de apresentação para colocar a narração depois no sistema?" O sistema precisa servir para vários vídeos: o ideal é a Daniella subir o PDF com muitas páginas e o sistema extrair as imagens com os títulos. Se os títulos não puderem ser extraídos, cada imagem ganha um campo de texto. A duração (15 a 60 s) e o formato são escolhidos pelo usuário.

**Contexto.**
- O PDF de referência ("Apresentação de projeto — Ambientação residencial - JP&M") tem 89 páginas e 91 renders.
- As páginas trazem só o render e a logo do estúdio, como figura; o único texto está na capa.
- Os títulos dos ambientes não podem ser extraídos de PDFs assim. Reconhecer o ambiente por IA exigiria um modelo de cerca de 90 MB embutido, sem CDN (§43), e ficou de fora.

**Decisão.**
1. **Modo próprio** no assistente (`#/imagens`), sem IFC nem planilha: Carregar, Conferir e Gerar.
2. **Extração no navegador** (`app/pdfImagens.ts`):
   - o pdf.js entrega as imagens que cada página desenha, já decodificadas, e a matriz corrente dá o tamanho delas na página;
   - ficam de fora as menores que 4 % da página ou com menos de 300 px no lado menor (logos e ícones) e as repetidas;
   - repetida é a imagem a até 16 de 256 bits de outra pela impressão visual (dHash de 17 × 16, `rendering/impressao.ts`);
   - as imagens são guardadas em JPEG com qualidade 0,92 e no máximo 2560 px.
3. **Títulos:**
   - o maior texto de cada página vira o título sugerido; o texto da capa, o título do vídeo;
   - na falta deles, há um campo por imagem. Imagem sem título continua o ambiente anterior, então basta digitar uma vez por ambiente;
   - a imagem da capa entra desmarcada e fica fora da seleção automática.
4. **Tempo** (`rendering/imagensNoVideo.ts`, puro):
   - as imagens marcadas dividem a duração em partes iguais, sobrepostas por 0,6 s de dissolução;
   - entre 2 e 6 s por imagem, com aviso fora disso;
   - a seleção pela duração marca 3 s por imagem, ao menos uma por ambiente e o resto proporcional ao tamanho de cada um;
   - com narração, a duração é vinheta (1,2 s) + voz + respiro (1 s) + encerramento (2 s).
5. **Imagem** (`rendering/videoDeImagens.ts`, canvas 2D):
   - cada imagem cobre o quadro e se move devagar: aproxima ou afasta 8 %, alternando o ponto;
   - quando é bem mais larga (ou alta) que o quadro, é percorrida de lado a lado;
   - capa com o título do vídeo, títulos de ambiente (faixa grafite com filete dourado, 2,4 s), assinatura e vinheta da marca;
   - o título do primeiro ambiente que acaba antes da capa sair é pulado, para não rotular outro ambiente;
   - **transições variadas** (revisão de 09/10, a pedido: "a transição entre as imagens está apenas de uma forma, está tedioso"), todas de 0,6 s, então os tempos não mudam:
     - dentro do ambiente: *dissolver* e *aproximar* (entra com zoom leve), com uma marcante a cada três, para variar também sem títulos;
     - na troca de ambiente: *empurrar* (a nova empurra a anterior), *varrer* (faixa suave na diagonal) e *círculo* (abre do centro, com filete dourado), em rodízio; o sentido de empurrar e varrer alterna;
     - "Só dissolver" no Conferir mantém o estilo sóbrio.
6. **Áudio e saída:**
   - os mesmos codificadores e a mesma mixagem do vídeo da obra (`codificar` e `mixagemDoVideo`, separados do `VideoRenderer`), com as dimensões da saída (o MP4 para WhatsApp sai em 720p);
   - 1ª trilha no início e a 2ª 8 s antes do fim.
7. **Narração depois:** o **roteiro de tempos** (TXT) dá a janela da voz, o tempo de cada ambiente e de cada imagem. Com a narração enviada, o vídeo é refeito pela fala.
8. **Guarda:** imagens, títulos, seleção, ordem, narração e formato ficam no IndexedDB (grupo `__imagens__`). As trilhas são as do assistente.

**Revisão (2026-10-09, vídeo do usuário das 11h48).** As imagens trocavam a cada 1 s e algumas apareciam duas vezes.
- **Causa da pressa:** o plano avisava que as marcadas não cabiam, mas gerava assim mesmo, encurtando cada imagem até 1 s.
  - Agora o mínimo é **2,5 s** e nunca é encurtado: com imagens demais, entram as que cabem, espalhadas entre os ambientes, e o aviso diz quantas ficaram de fora (no Conferir e no Gerar).
  - O título do ambiente sai antes de a imagem seguinte entrar.
- **Causa das repetidas:** o mesmo PDF foi enviado duas vezes, e a impressão visual só comparava as imagens de um mesmo envio.
  - Agora cada imagem nova é comparada com as que já estão na lista.
  - "Todas" deixa a capa de fora.
- **Recomeçar** (botão no topo): apaga a sessão inteira e o que o vídeo de imagens guardou, e recarrega a página limpa. Os projetos salvos só saem se pedido.
9. **pdf.js:** os decodificadores (JPEG 2000, JBIG2, cor ICC) passam a ser servidos pelo app (`public/pdfjs/wasm` e `iccs`), também para a planta em PDF.

**Consequências.**
- Fica mais fácil: um reel de apresentação a partir do PDF que o estúdio já entrega, em segundos (41 s em 9:16 com narração: 10 a 12 s para gerar).
- Fica mais difícil: o título do ambiente ainda é digitado quando o PDF não o traz em texto.
- Os decodificadores do pdf.js somam 440 KB, baixados só quando o PDF precisa deles.

**Verificação.**
- **Vitest:** ambientes, seleção, plano, movimento, títulos no tempo, roteiro, impressão visual, textos da página e título da capa.
- **Playwright** (`e2e/imagens.spec.ts`, com PDF gerado pelo jsPDF):
  - capa, renders, logo e página repetida;
  - títulos sugeridos e a capa fora da seleção;
  - roteiro, e o MP4 para WhatsApp com 15 s, 1280 × 720 e áudio;
  - o trabalho volta depois de recarregar a página.
- **Edge com o PDF de referência** (fora do git): 91 renders em 5 a 8 s, 89 logos descartadas; vídeo vertical de 41,4 s com narração e duas trilhas, conferido quadro a quadro e pelo nível do áudio.

## ADR-38 — Voo do drone pela casa 3D no vídeo de imagens

**Status:** aceito em 2026-10-09 (INC-20, plano em `docs/planos/inc-20-voo-no-video-de-imagens.md`).

**Pedido.** "Quando seleciona Vídeo de imagens não vi a possibilidade do voo automático nem drone." O usuário escolheu juntar o voo 3D às imagens: com o IFC da mesma obra, o vídeo abre e/ou fecha com o voo pela casa pronta.

**Decisão.**
1. **Cartão "Projeto IFC (opcional)"** no modo imagens (`app/vooNasImagens.ts`):
   - abrir um IFC sem planilha limpa os anexos, então as trilhas são guardadas antes e devolvidas (`restaurarTrilhas`);
   - sem cronograma, entra a estimativa automática (§13), e a cena vai para o último dia: a casa aparece pronta, mobiliada e com pessoas;
   - o × tira o modelo da tela (o projeto continua salvo em Projetos) e mantém as trilhas.
2. **Conferir:**
   - voo em Nenhum, Abertura (padrão com IFC), Encerramento ou Os dois;
   - duração de 6 a 12 s (padrão 8 s), no máximo 40 % de um vídeo curto;
   - percurso: volta por fora, ou volta e entrada pela porta.
3. **Tempo** (`planoDoVideo` com `voo`, `vooNoTempo`):
   - as imagens dividem o tempo que sobra e dissolvem 0,6 s com os voos;
   - a abertura vai por baixo da primeira imagem; o encerramento entra por cima da última;
   - vinheta e capa ficam sobre o voo de abertura; o primeiro título espera a primeira imagem;
   - o roteiro lista os voos.
4. **Desenho:**
   - o trecho 3D usa a mesma cena, luz (sol de lado, ADR-36) e acabamento do vídeo da obra, num renderizador dedicado do tamanho do vídeo, copiado quadro a quadro para o canvas 2D;
   - no encerramento, a volta anda no sentido contrário;
   - a cena 3D fica fora da vista no passo Gerar.
5. **Prévia:** um quadro grafite, "Voo do drone pela casa 3D", marca o lugar do voo; a cena 3D na prévia pesaria demais.

**Consequências.**
- Fica mais fácil: o vídeo de imagens ganha a casa inteira por fora, que os renders internos não mostram.
- Fica mais difícil:
  - gerar fica mais lento: 30 s com dois voos de 8 s levaram 50 s no Edge com GPU Intel, contra cerca de 12 s só com imagens;
  - o 3D sai mais simples que os renders, e a passagem entre os dois é perceptível; por isso o voo fica nas pontas.

**Verificação.**
- **Vitest:** janelas, limites, camadas, opacidades, título depois do voo e roteiro.
- **Playwright:** o IFC preserva a trilha, o bloco do voo aparece só com o modelo, o roteiro lista os voos e o × tira o IFC.
- **Edge com GPU:** vídeo vertical de 30 s com 6 renders do JP&M e o sobrado de exemplo, conferido quadro a quadro: vinheta, voo com a capa, dissolução, títulos, voo final e vinheta.
