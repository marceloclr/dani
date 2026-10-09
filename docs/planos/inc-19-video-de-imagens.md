# INC-19 — Vídeo de imagens: apresentação de projeto a partir de um PDF ou de imagens soltas

**Status:** aprovado e implementado em 2026-10-09 (ADR-37).

## Pedido

"Como aproveitar as imagens e gerar um vídeo de apresentação para colocar a narração depois no sistema?"

Respostas do usuário:
1. Plano aprovado.
2. O usuário define a duração e o formato (dimensões) do vídeo, com tempos padrão de 15, 20, 30, 40, 50 e 60 s.
3. Precisa servir para vários vídeos. O ideal é a Daniella subir o PDF com muitas páginas e o sistema extrair as imagens com os títulos e gerar o vídeo. Se os títulos não puderem ser extraídos, cada imagem ganha um campo de texto para ela digitar o título.

## O que a verificação mostrou

- PDF de referência: "Apresentação de projeto — JP&M", com 89 páginas de 1440 × 810 e 91 renders em JPEG (de 1778 × 1000 a 2311 × 1300).
- As páginas não têm texto, só o render e a logo do estúdio que fez as imagens, desenhada como figura.
- O único texto está na capa: "APRESENTAÇÃO DE PROJETO / AMBIENTAÇÃO RESIDENCIAL - JP&M".
- **Conclusão:** a extração das imagens pode ser automática. A dos títulos, só quando o PDF traz texto na página. Para PDFs como este, vale o campo de título por imagem.

## Decisões

1. **Modo novo no assistente:** "Vídeo de imagens", ao lado do "Vídeo da obra", com os passos Carregar, Conferir e Gerar. Não pede IFC nem planilha.
2. **Entrada:**
   - PDF: o sistema extrai as imagens no navegador com o pdf.js, que já é dependência do projeto.
   - Imagens soltas: JPG, PNG ou WebP.
   - Ficam de fora as imagens pequenas (logos e ícones) e as repetidas (mesma impressão visual).
   - A ordem é a das páginas.
3. **Títulos:**
   - Cada imagem tem um campo de título. Imagem sem título continua o ambiente da anterior, então basta digitar o título na primeira imagem de cada ambiente.
   - Quando a página do PDF tem texto, o maior texto da página vira o título sugerido.
   - O texto da capa vira o título do vídeo.
4. **Formato:** horizontal 16:9 (1920 × 1080), vertical 9:16 (1080 × 1920), quadrado 1:1 (1080 × 1080), retrato 4:5 (1080 × 1350) e personalizado (largura × altura).
5. **Duração:**
   - Opções de 15, 20, 30, 40, 50 e 60 s.
   - Com narração, a opção "pela narração" passa a ser a padrão: dura a voz, mais um respiro e a marca.
6. **Seleção:**
   - Cada imagem fica entre 2 e 6 s na tela (3 s por padrão).
   - Ao escolher a duração, o sistema marca as imagens que cabem, distribuídas entre os ambientes (ao menos uma por ambiente, quando couber).
   - A Daniella pode marcar, desmarcar e mudar a ordem.
   - Se as marcadas não couberem nem a 2 s cada, a tela avisa quantas cabem.
7. **Movimento:**
   - Cada imagem cobre o quadro inteiro e se move devagar (zoom de 1,00 a 1,08 com deslocamento), alternando a direção para não ficar repetitivo.
   - Quando a imagem é mais larga que o quadro (render 16:9 num vídeo 9:16), ela é percorrida na horizontal.
   - Entre as imagens, dissolução de 0,6 s.
8. **Títulos no vídeo:**
   - No começo de cada ambiente, um título discreto entra e sai em 2,4 s: caixa-alta espaçada, filete dourado, faixa grafite translúcida.
   - O título do vídeo aparece sobre a primeira imagem.
   - Vinheta da marca na abertura e no encerramento, e assinatura no canto, como no vídeo da obra.
9. **Narração depois:**
   - Sem narração, o vídeo sai só com a trilha, se houver, e o sistema oferece um **roteiro de tempos** (TXT) por ambiente e por imagem, para a gravação.
   - Com a narração enviada, o vídeo é refeito e as imagens se ajustam à fala.
   - A trilha baixa sob a voz, com a mixagem do ADR-34.
10. **Saídas:**
    - MP4 alta: H.264 + AAC, com o conserto do registro do H.264 do ADR-35.
    - MP4 para WhatsApp.
    - É só desenho 2D, sem cena 3D, então gerar leva segundos.
11. **Guarda:** imagens, títulos, ordem e configuração ficam no IndexedDB do projeto, como as falas e as trilhas.

## Etapas (um commit por etapa)

| Etapa | Entrega | Verificação |
|---|---|---|
| a | `rendering/imagensNoVideo.ts` (puro): seleção pela duração, tempos, ambientes e títulos, movimento e dissolução | Vitest |
| b | Desenho do quadro (canvas 2D) e `gerarVideoDeImagens` com os codificadores e a mixagem existentes | Script no Edge: MP4 com áudio, quadros conferidos |
| c | `app/pdfImagens.ts`: extração no navegador (pdf.js), filtro de pequenas, repetidas e texto sugerido | Playwright com o PDF de referência (fora do git) e um PDF de teste gerado |
| d | Modo "Vídeo de imagens" no assistente: cartões, grade com título e marcação, formato, duração, prévia e gerar | Playwright |
| e | Roteiro de tempos (TXT) e guarda no IndexedDB | Vitest e Playwright |
| f | Teste completo com o JP&M e o kit de áudio; ADR-37 e README | Vídeo conferido quadro a quadro |

## Fora deste incremento

- Reconhecer o ambiente pela imagem com IA, que exigiria um modelo de cerca de 90 MB embutido, sem CDN (§43).
- Agrupar os ambientes automaticamente por semelhança visual.
