# Prompt — Incremento 2: câmeras, modos de animação e vídeo

Você vai construir o segundo incremento do **Construction 4D Studio**. O incremento 1 já está pronto e aceito: IFC → 3D → cronograma → mapeamento → timeline → simulação 4D (`npm run tudo` verde).

Leia antes de começar, neste repositório:
- `docs/especificacao.md`: implemente **só** os `[INC-2]` e mantenha os `[INC-1]` e `[SEMPRE]` funcionando.
- `docs/adrs.md`, em especial ADR-03 (simulação pura), ADR-04 (vídeo), ADR-09 (versões) e ADR-10 (velocidade).
- https://raw.githubusercontent.com/marceloclr/design-system/main/design-system.md: padrão visual (já aplicado em `src/estilos/tokens.css`).
- `README.md`: estrutura do código e como testar.

Não reabra decisões dos ADRs. Se encontrar um impedimento real, pare e descreva-o.

## Escopo fechado

### 1. Modos de animação (§16)
- Seletor na timeline: **Aparecimento** (padrão, o atual), **Fade-in**, **Crescimento** e **Por fases**.
- O estado de cada elemento passa a ter `surgimento` (0 a 1): o avanço da tarefa que o faz surgir, calculado com o **dia fracionário**, para a animação ficar suave na reprodução e no vídeo. Continua sendo função pura (ADR-03).
- Fade-in: opacidade = surgimento. Crescimento: paredes, pilares e esquadrias sobem a partir da própria base (escala vertical com pivô no ponto mais baixo do elemento); os demais usam fade. Por fases: dentro de cada tarefa, os elementos surgem em sequência, de baixo para cima e da frente para o fundo; cada um aparece quando o avanço da tarefa passa da sua posição na fila.
- A geometria não muda (§62): só escala, opacidade e cor.

### 2. Câmeras (§20, §21)
- Presets: **Externa** (altura de observador, a partir da rua), **Isométrica**, **Superior**, **Frontal**, **Lateral** e **Órbita** (uma volta completa ao longo do vídeo). Os botões da viewport usam os mesmos presets; Órbita na viewport liga e desliga a rotação automática.
- Roteiro de câmera do vídeo: lista de pontos-chave `{ segundo, câmera }`, em que câmera é um preset ou a **câmera atual** da viewport, capturada por botão. Padrão do §21: 0 s frontal, 10 s isométrica, 20 s lateral, 30 s superior, escalado para a duração escolhida.
- Interpolação suave (smoothstep) em coordenadas esféricas em torno do alvo (azimute pelo caminho mais curto, elevação e distância), para a câmera nunca atravessar a casa.
- As funções de pose e de interpolação são puras e testáveis no Node (`src/rendering/cameras.ts`, sem Three.js).

### 3. Vídeo (§22–§26, ADR-04)
- Painel **Vídeo**: formato vertical 1080 × 1920, horizontal 1920 × 1080 ou quadrado 1080 × 1080; 24 ou 30 fps; 15, 30, 60, 90 ou 120 s.
- Tempo da obra → tempo do vídeo linear (§23): o quadro `i` de `N` mostra o instante `i / (N − 1) × duração da obra` (em dias, contínuo): o primeiro quadro é o início do primeiro dia e o último, o fim do último dia, com a casa concluída. Mostrar a relação ("180 dias → 30 s: 6 dias por segundo") com dica de fórmula.
- Renderizador dedicado, com a resolução do vídeo, independente da viewport. Renderiza quadro a quadro no fluxo principal, de forma determinística, cedendo o controle à interface entre quadros.
- Saídas, oferecidas só quando o navegador as suporta de fato:
  1. **MP4 (H.264)** ou **WebM (VP9 ou VP8)** via WebCodecs + Mediabunny (`CanvasSource`, que respeita a contrapressão do codificador). Consultar `canEncodeVideo` para cada codec com a resolução e o fps escolhidos.
  2. **WebM em tempo real** via `MediaRecorder` + `captureStream`, quando não houver WebCodecs.
  3. **Quadros PNG em ZIP** (fflate), sempre disponível, com estimativa de tamanho.
- Se não houver MP4, mostrar exatamente: «Seu navegador não oferece suporte à codificação MP4 neste modo. O sistema produzirá WebM ou imagens sequenciais.»
- Progresso: barra, percentual, "Quadro 438 / 900" e tempo estimado; botão **Cancelar** que interrompe de verdade e não gera arquivo.
- Ao terminar: pré-visualização no próprio painel (quando for vídeo), botão de download com nome, formato e tamanho reais. Nunca dizer que um arquivo foi criado sem que ele exista.
- Aviso quando o dispositivo parecer fraco para gerar vídeo (§34): poucos núcleos, pouca memória ou celular.

## Fora do escopo (não construir, nem como botão desativado)

IndexedDB, `.4dstudio`, XLSX, edição de tarefas, modo paramétrico, fotos, planta sobreposta, PWA, áudio no vídeo.

## Testes

- Vitest: `surgimento` com dia fracionário; parâmetros de cada modo de animação; ordem do modo por fases; pose de cada preset; interpolação (extremos, ponto médio, azimute pelo caminho mais curto, órbita); mapeamento quadro → dia.
- Playwright (Chromium): o teste final do §67 de ponta a ponta com a demonstração, gerando um vídeo WebM real (15 s, 24 fps) e conferindo o arquivo baixado (assinatura EBML e tamanho > 0); cancelamento sem arquivo; navegador sem WebCodecs (simulado) oferecendo os fallbacks com a mensagem do §26 e gerando o WebM em tempo real.

## Critério de aceitação

1. `npm run tudo` verde.
2. Os quatro modos de animação funcionam na reprodução e no vídeo.
3. Selecionar um preset muda a câmera; o roteiro padrão produz movimento suave no vídeo.
4. Num navegador compatível, o vídeo é gerado e reproduz no próprio painel.
5. Num navegador sem WebCodecs, o fallback produz um arquivo real e avisa qual.
6. Cancelar interrompe sem gerar arquivo.

Ao terminar, liste o que foi feito, o resultado de cada item e as limitações conhecidas. Não declare pronto o que não foi verificado.
