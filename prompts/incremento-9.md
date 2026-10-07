# Prompt — Incremento 9: drone, obra pronta humanizada e ambiente realista

Pedido do usuário:

> "Quero a opção de "voar" por dentro e por fora da construção enquanto ela é montada. Como se fosse um drone. Depois de montada por completo gira pelas fachadas e entra na obra pronta humanizada, inclusive subir e descer pelas escadas quando tiver. Como slogan da marca inclua - "Produtor de Vídeos das obras da Super Influencer Dani, a engenheira." Quando verei imagens do terreno e do céu realistas?"

## Decisões

ADR-23 (docs/adrs.md).

## Aceitação

- Viewport: botões **Drone** (voo manual por teclado, mouse e toque) e **Voo automático**.
- Vídeo: câmera **Drone: voo e passeio**; a obra é montada na primeira metade e a segunda mostra a obra pronta.
- Obra pronta humanizada: mobília do IFC e pessoas só no último dia; os dois modelos de exemplo têm mobília.
- O passeio entra pela porta da frente, sobe e desce a escada do sobrado e não atravessa paredes (tests/drone.test.ts).
- Céu físico com nuvens; chão fotográfico até o horizonte, cava da fundação e árvores.
- Slogan no cabeçalho, na tela inicial, no relatório e no vídeo.
- Testes: tests/drone.test.ts e e2e/drone.spec.ts.
