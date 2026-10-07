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
| Reboco / Pintura | `IfcWall` (finish), troca de aparência, sem mudar a visibilidade |
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

MPL-2.0 é copyleft por arquivo: pode ser usada sem problema, desde que alterações nos próprios arquivos da biblioteca sejam publicadas. O §44 passa a citá-la explicitamente.

Testes: lógica, parsing de CSV e de IFC no Vitest (Node). Exportação de vídeo só em navegador real (Playwright + Chromium), nunca em jsdom.

## ADR-10 — Velocidade de reprodução

**Decisão.** 1× = 6 dias de obra por segundo, para que a obra-padrão de 180 dias dure 30 s, a duração-padrão do vídeo (§22, §23). As velocidades do §17 multiplicam esse valor (0,25× = 1,5 dia/s; 8× = 48 dias/s). A fórmula aparece na dica do seletor de velocidade.
