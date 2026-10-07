# Avaliação do Prompt Mestre — Construction 4D Studio

Registro da avaliação feita em 2026-10-07 no projeto **Dani** do claude.ai (conversa "Avaliação de prompt com foco em planejamento"). Os §n remetem ao [prompt original](../prompt-mestre-original.md). As decisões que saíram daqui estão em [adrs.md](adrs.md) e [especificacao.md](especificacao.md).

## 1. Entendimento

Aplicação estática e local que recebe a geometria de uma residência (IFC, paramétrico ou só imagens) e um cronograma, vincula elementos a tarefas e calcula o estado construtivo de cada elemento em cada data. O resultado aparece numa viewport Three.js e pode virar vídeo via WebCodecs. O texto é contrário ao "teatro de software": nada de botão sem handler, MP4 fingido ou precisão inventada. A distinção 3D/4D (§64) e a geometria imutável (§62) estão corretas.

## 2. Méritos

- A divisão BIM / Paramétrico / Visual (§3) evita prometer "BIM a partir de foto".
- A ordem de fases (§51) e o fluxo obrigatório (§65) dão uma espinha dorsal clara.
- As políticas de fallback de vídeo (§25–26) e de privacidade (§43) estão bem formuladas.
- Os critérios de aceitação (§48, §67) são verificáveis.

## 3. Críticas

### 3.1 Estrutura do prompt
- **Extensão diluidora.** São 68 seções misturando MVP, backlog e visão de futuro. A IA tende a dividir a atenção igualmente e implementar coisas secundárias (LOD, PWA, PDF) pela metade.
- **Contradição com o §49.** O §49 proíbe "em breve", mas §13, §29, §31, §42 e §57–60 descrevem funcionalidades futuras sem marcação de escopo.
- **Demo sem fonte.** A demonstração (§55) depende do modo paramétrico (fase 13) se não houver um IFC de demo embutido.
- **"Confirme a API atual" (§68)** é inexequível sem rede. O certo é fixar as versões.
- **Primeira entrega grande demais (§66).** São 13 itens num ciclo, vídeo incluído, o que convida ao "parecer pronto" que o §50 quer evitar.

### 3.2 Lacunas de domínio 4D (as mais graves)
1. Uma parede participa de alvenaria, reboco, revestimento e pintura. O modelo tarefa → elementos só sabe "aparecer". Precisa ser muitos-para-muitos com tipo de ação.
2. Pintura, revestimento e instalações quase nunca têm geometria num IFC residencial. Sem o item 1, metade da sequência do §4 fica vazia.
3. Mapeamento manual (§14) é inviável para leigos. O automático (§42) deve entrar no MVP, baseado em regras, que sobrevivem à reexportação do IFC, com exceções manuais.
4. As heurísticas do §42 são ingênuas. `IfcSlab` serve para fundação, laje e cobertura, e a diferença está no `PredefinedType`.
5. Faltam políticas para elementos não mapeados e para tarefas sobrepostas.
6. Falta precedência entre OCULTAR/MOSTRAR (§19) e o estado 4D.
7. Faltam predecessoras e a definição de dias úteis, falta dizer que `progress` é ignorado, e faltam MS Project XML e `IfcWorkSchedule`.

### 3.3 Questões técnicas
- web-ifc direto e Fragments são caminhos distintos. O Fragments consolida a geometria e conflita com o crescimento por elemento (§16.3); há também conflito entre §16.3 e §35.
- Vídeo em Web Worker (§24) exige OffscreenCanvas. O mais robusto é renderizar quadro a quadro no fluxo principal, de forma determinística, controlando `encodeQueueSize`.
- `mp4-muxer`/`webm-muxer` foram descontinuados em favor do Mediabunny (MPL-2.0, assim como o web-ifc). O §44 deve citar MPL.
- Falta o MediaRecorder entre WebCodecs e "exportar frames". A sequência de PNGs deve sair num ZIP.
- Sempre consultar `isConfigSupported()`. A resolução do vídeo deve ser independente da viewport.
- `new Date('2026-01-01')` aparece como 31/12 em Fortaleza. Usar índice de dia inteiro.
- CSV brasileiro: `;`, `dd/mm/aaaa`, Windows-1252, BOM. O pacote `xlsx` do npm está defasado.
- Os WASM do web-ifc devem ser servidos localmente, com o `base` certo no GitHub Pages.
- Guardar o IFC como Blob no IndexedDB com `storage.persist()`. Decidir se o `.4dstudio` embute o IFC.
- A IA futura (§57) num app estático colide com o §43.
- Testes de vídeo só em navegador real (Playwright), não em jsdom.

## 4. Sugestões

- Simulação como função pura `avaliar(dia)`, com câmera `camera(tVideo)`.
- Fixar as decisões em ADRs.
- Dividir em especificação etiquetada por fase, ADRs e prompts por incremento:
  1. IFC → 3D → CSV → mapeamento automático → timeline;
  2. câmeras + vídeo;
  3. persistência + paramétrico.
- Referenciar o `design-system.md` do autor (paleta grafite/tinta/latão/musgo, IBM Plex, tooltips com fórmula).
- Ligar o §29 ao repositório **plantas**, candidato à planta de referência e à base da demo.
