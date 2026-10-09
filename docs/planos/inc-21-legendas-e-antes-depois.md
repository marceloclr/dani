# INC-21 — Legendas animadas e antes e depois no vídeo de imagens

**Status:** aprovado em 2026-10-09.

## Pedido

A Daniella mandou um Reels (vertical, 54 s): ela narra uma obra entregue, mostra o antes e o depois da cozinha, e o vídeo tem legendas que aparecem palavra por palavra, com as palavras-chave maiores e em negrito. Pergunta do usuário: "como podemos aproveitar esse vídeo da Dani para gerar um vídeo pelo sistema". Escolhas dele:

1. Os caminhos 2 (legendas animadas) e 3 (antes e depois).
2. O texto das legendas é colado e sincronizado pelas pausas da voz, sem IA (§43).
3. Destaque automático, com `*asterisco*` para escolher à mão.
4. Só no vídeo de imagens.

## Decisões

### Legendas (`src/rendering/legendas.ts`, novo e puro, testado no Node)

1. **Texto.** No Conferir, um campo "Texto da narração" (só aparece com narração).
   - `*palavra*` força o destaque e os asteriscos não aparecem no vídeo.
   - Cada palavra recebe um peso pelas sílabas (grupos de vogais). Depois de vírgula, ponto, "?" ou "!" entra uma pausa extra no peso.
2. **Trechos de fala.** Saem do `AudioBuffer` da narração, lido com `audioDaFala` em `apresentadora.ts`:
   - energia RMS em janelas de 20 ms;
   - limiar adaptativo, pelo percentil do ruído de fundo;
   - pausas a partir de 0,25 s.

   Os trechos são calculados uma vez, ao receber a narração, e guardados com ela.
3. **Sincronização.** As palavras dividem o tempo de fala (somados os trechos, sem as pausas) pelo peso de cada uma. Depois, o tempo é levado de volta ao relógio do vídeo, pulando as pausas e somando `VOZ_INICIO_S`.
   - As pausas da voz são casadas com os intervalos entre palavras por programação dinâmica: casar depois de ponto não custa nada, depois de vírgula custa pouco, antes de conjunção ("que", "e"...) um pouco mais e no meio da frase mais. O ritmo entre duas pausas deve ficar perto do ritmo médio. Isso substituiu o "grude" na pausa mais próxima (até 0,6 s), que no Reels da Daniella errava em média 0,82 s; com o casamento, o erro caiu para 0,45 s (medido contra as legendas originais do Reels).
   - Se o áudio tiver poucas pausas (música por baixo da voz), a divisão fica uniforme ao longo da fala.
   - Um controle de **atraso** (−1 a +1 s) corrige a sincronização à mão.
4. **Grupos.** Cada grupo tem 2 a 4 palavras, no máximo 2 linhas, e quebra na pontuação.
   - Cada palavra entra no seu instante, com um "pop" curto: escala de 0,85 a 1 e opacidade, em 0,12 s.
   - O grupo fica na tela até o próximo começar, ou até 0,4 s depois da última palavra.
5. **Destaque automático.** Em cada grupo, a palavra mais longa que não esteja numa lista de palavras fracas (artigos, preposições, "né", "que" etc.). Com algum `*` no texto, só vale o que estiver marcado.
6. **Visual.**
   - Branco, IBM Plex Sans, com sombra suave para ler sobre qualquer foto.
   - Palavra normal: peso 500. Palavra destacada: 1,5 vez maior e peso 700, como no vídeo de referência.
   - Fica centralizada a 62 % da altura no vertical, acima da faixa que o Reels cobre.
   - Com legendas, o título de ambiente sobe para logo abaixo da faixa reservada do topo, para os dois não se sobreporem.
7. **Narração em vídeo.** O campo da narração passa a aceitar MP4 e MOV e usa o áudio do arquivo (o mesmo `decodeAudioData` que já lê o vídeo da apresentadora). Assim o próprio vídeo do WhatsApp serve de narração.

### Antes e depois (em `imagensNoVideo.ts` e `videoDeImagens.ts`)

8. **Marcar o par.** Na lista de imagens, um botão "Antes ⇄ próxima" diz que esta imagem é o antes e a seguinte é o depois. A ligação aparece nas duas miniaturas.
   - O par só vale com as duas imagens marcadas. Se uma ficar desmarcada, aparece um aviso no plano.
   - "Escolher pela duração" marca ou desmarca as duas juntas.
9. **Tempo.** O par vira um item do plano que vale por duas imagens (`2·d − dissolução`). As fases:
   - 0 a 35 %: o antes parado, com o rótulo ANTES;
   - 35 a 65 %: uma cortina vertical com filete dourado revela o depois, da esquerda para a direita;
   - 65 a 100 %: o depois, com o rótulo DEPOIS.

   As duas imagens recebem o mesmo zoom lento, cada uma com o seu `recorteQueCobre`. O item entra pela transição normal do rodízio, e o título do ambiente vem da imagem do antes.
10. **Rótulos.** Pílulas no estilo do título de ambiente (grafite translúcido com filete dourado), no alto de cada lado da cortina, abaixo da faixa reservada e longe da legenda.
11. **Roteiro TXT.** Mostra o par como "Antes e depois: <título>". As recomendações de quantidade contam o par como duas imagens.

### Estado e guarda

- `EstadoImagens` ganha `legendas: { ativas, texto, atrasoS }`.
- `NarracaoRecebida` ganha `falaS: [ini, fim][]`.
- `ImagemRecebida` ganha `antes?: boolean`.
- `restaurarImagens` e `guardaImagens.ts` ganham valores padrão para o que foi guardado antes destes campos.

## Etapas (um commit por etapa, com push)

| Etapa | Entrega | Verificação |
|---|---|---|
| 0 | Plano em `docs/planos/inc-21-legendas-e-antes-depois.md` | — |
| a | `legendas.ts`: palavras, pesos, `*`, trechos de fala, sincronização, grupos, destaque e `legendaNoTempo` | Vitest (`tests/legendas.test.ts`) |
| b | Narração aceita vídeo e calcula os trechos de fala. Bloco "Legendas" no Conferir (ligar, texto, atraso). Desenho na prévia e na geração; o título sobe | Vitest e Playwright (`e2e/imagens.spec.ts`) |
| c | Plano com pares de antes e depois: tempos, fases, recomendação, roteiro e seleção em par | Vitest (`tests/imagensNoVideo.test.ts`) |
| d | Botão do par na lista; cortina e rótulos no quadro | Playwright e quadros conferidos |
| e | ADR-39 (legendas) e ADR-40 (antes e depois), README e especificação | — |

