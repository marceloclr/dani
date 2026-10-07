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

