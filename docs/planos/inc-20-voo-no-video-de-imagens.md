# INC-20 — Voo do drone pela casa 3D no vídeo de imagens

**Status:** aprovado em 2026-10-09.

## Pedido

"Quando seleciona Vídeo de imagens não vi a possibilidade do voo automático nem drone." O usuário escolheu juntar o voo 3D às imagens: com um IFC da mesma obra, o vídeo de imagens abre e/ou fecha com o voo do drone pela casa pronta. Sem IFC, continua só com as imagens. Não há IFC do JP&M: o teste usa o sobrado de exemplo.

## Decisões

1. **Cartão "Projeto IFC (opcional)"** no Carregar do modo imagens.
   - Abrir o IFC sem planilha limpa os anexos: as trilhas são guardadas antes e devolvidas depois.
   - Sem cronograma, o sistema gera a estimativa automática (§13) e usa o último dia, então a casa aparece pronta, mobiliada e com pessoas. A Daniella não preenche nada.
2. **Conferir:**
   - **Voo do drone:** Nenhum, Na abertura, No encerramento ou Nos dois (só com IFC);
   - **duração** de cada voo: 6 a 12 s (padrão 8 s);
   - **percurso:** "Volta por fora" ou "Volta e entrada pela porta" (a porta exige a entrada encontrada no modelo).
3. **Tempo:**
   - os voos ocupam o começo e/ou o fim; as imagens dividem o resto;
   - dissolução de 0,6 s entre o voo e as imagens;
   - a vinheta e a capa ficam sobre o voo de abertura, e a vinheta de encerramento sobre o voo final.
4. **Prévia:** no lugar do voo, um quadro "Voo do drone pela casa 3D", porque desenhar a cena 3D na prévia pesaria demais. O voo aparece no vídeo gerado.
5. **Geração:**
   - o trecho 3D usa a mesma cena, luz (sol de lado, ADR-36) e acabamento do vídeo da obra, num renderizador dedicado;
   - cada quadro 3D é desenhado no canvas 2D do vídeo de imagens.

## Etapas

| Etapa | Entrega | Verificação |
|---|---|---|
| a | Plano com os voos (puro): janelas, imagens no tempo que sobra, camadas e títulos | Vitest |
| b | IFC no modo imagens (trilhas preservadas, estimativa, casa pronta) e escolhas do voo no Conferir | Playwright |
| c | Trecho 3D na geração, cena montada fora da vista no Gerar | Vídeo conferido quadro a quadro; e2e com o sobrado de exemplo |
| d | ADR-38 e README | — |
