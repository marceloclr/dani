# Prompt — Incremento 7: aparência realista e segundo modelo de teste

Pedidos do usuário:

> "Quero que disponibilize para teste dois arquivos Modelo BIM em IFC […] para eu testar local. Siga. Deixe o tema claro como padrão. Quando a imagem gerada terá aparência real?"

## Decisões

**ADR-21 — Aparência realista.**
- A viewport, o vídeo e o relatório passam a ter duas aparências: **Realista** (padrão) e **Técnica**, que mantém as cores lisas de antes.
- **Materiais no modo Realista:**
  - texturas procedurais desenhadas no próprio navegador, sem baixar imagens: tijolo cerâmico, reboco, pintura, concreto, telha cerâmica, telha metálica, madeira, porcelanato, louça, vidro, terra, grama e folhagem;
  - as texturas ficam em escala real (metros) graças a coordenadas de textura projetadas pela normal de cada face (projeção em caixa);
  - o gerador é determinístico (semente fixa), para o vídeo sair igual a cada geração;
  - o material vem do nome do material IFC; quando ele não diz, da classe IFC e, por último, da cor do IFC.
- **Luz:** sol com sombras suaves (mapa de sombras ajustado à casa), céu em degradê, luz de ambiente do céu, reflexos de ambiente (RoomEnvironment) e mapeamento de tons ACES.
- **Oclusão de ambiente** (GTAO) por pós-processamento na viewport, no relatório e no vídeo, que escurece os cantos e os encontros de paredes e lajes.
- No Realista, o que está em execução não ganha a cor de latão: a revelação progressiva já mostra o avanço. O modo Comparar e o fantasma continuam técnicos, porque precisam destacar.
- A aparência é gravada no projeto (`settings.json` do `.4dstudio`).
- **Limite honesto:** é renderização em tempo real (rasterização), não fotografia. Para um quadro fotorrealista, com luz indireta e reflexos verdadeiros, seria preciso um traçador de caminhos (path tracer), mais lento; ele fica como possível passo seguinte.

**Segundo modelo de teste.**
- `sobrado-exemplo.ifc`: sobrado de 8 × 12 m em dois pavimentos, gerado por `tools/gerar_sobrado_ifc.py`.
- `cronograma-sobrado.csv`: tarefas por pavimento.
- Os dois ficam em Modelos de arquivo e no botão "Abrir sobrado de exemplo".

**Tema claro como padrão,** sem seguir a preferência do sistema. O escuro vale só quando o usuário o escolhe (chave nova `c4d-tema-escolhido`).

## Testes

- Vitest:
  - projeção de coordenadas de textura;
  - escolha do material realista (por material IFC, por classe, por acabamento);
  - determinismo das texturas;
  - sobrado: pavimentos, vínculos e ordem.
- Playwright:
  - o modo Realista vem por padrão, com texturas, sombras e oclusão de ambiente;
  - o modo Técnica volta às cores lisas;
  - GIF realista gerado;
  - sobrado aberto pela tela inicial;
  - o tema claro é o padrão mesmo com o sistema no escuro.
