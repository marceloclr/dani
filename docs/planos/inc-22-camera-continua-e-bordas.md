# INC-22 — Câmera contínua na obra e bordas da apresentadora

Pedido do usuário (09/10/2026), sobre o vídeo `sobrado-de-exemplo-20261009-1548.mp4`:

- "As transições não ficaram boas, fica muito da direita para a esquerda e vice versa, cansativo." Escolheu o
  **movimento contínuo**: uma tomada lenta enquanto a obra sobe, sem cortes.
- "as bordas feias" do recorte da apresentadora (aprovou o item 2 da análise).

## Diagnóstico

- Transições: `roteiroDasFalas` corta a obra em tomadas de ~3,5 s (`TOMADA_S`) com rodízio de 4 câmeras
  (`CAMERAS_TOMADA`): isométrica −45°, externa −28°, frontal 0° e órbita (varre 54° em ~4 s). A cada corte o ponto
  de vista pula de lado, e a órbita é uma varredura lateral rápida seguida de um salto de volta: o vai e vem.
- Bordas (IA): a segmentação roda a 384 px no lado maior (`LADO_SEGMENTACAO`) e a máscara é ampliada no shader;
  o contorno fica mole, com halo da cor do fundo (azulado aos 52–56 s) e restos de objetos claros perto do corpo.

## Etapas

1. **Câmera contínua (a)** — `src/rendering/montagem.ts`:
   - nova câmera de cena `"continua"`: pose pelo **avanço da obra** (0 a 1), não pelo tempo da cena, para não
     pular nem entre uma fala e outra: azimute −75° → −15°, altura 32° → 16°, distância 1,12 → 0,98;
   - uma cena de obra por fala (sem `TOMADA_S` e sem `CAMERAS_TOMADA`);
   - a volta por fora do assistente começa onde a construção parou (−15°) e segue no mesmo sentido (90°);
     o vídeo de imagens (ADR-38) mantém a volta antiga;
   - testes em `tests/falas.test.ts`; ADR-41.
2. **Bordas (b)** — `src/rendering/apresentadora.ts`:
   - segmentação a 768 px no lado maior; erosão e suavização do contorno revistas; menos halo de cor;
   - comparação antes × depois nos mesmos quadros da fala real (34 s, 42 s e 54 s do vídeo), no Edge.
3. README e relatório.

Fora do escopo: as legendas gravadas no vídeo original (pedem o vídeo sem legenda) e o congelamento do Firefox
(adiado pelo usuário).
