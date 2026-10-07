# Texturas fotográficas

Do [Poly Haven](https://polyhaven.com), licença [CC0](https://polyhaven.com/license) (domínio público), em 1K, reprocessadas em JPEG 82 % (rugosidade em tons de cinza, 512 px):

| Arquivo | Uso | Metros por repetição |
|---|---|---|
| `sparse_grass_*` | grama (gramados e chão até o horizonte) | 2,5 |
| `grass_path_2_*` | solo arenoso (terreno do lote e cava) | 3 |
| `large_red_bricks_*` | alvenaria cerâmica aparente | 2 |
| `plastered_wall_04_*` | reboco; o relevo e a rugosidade servem também à pintura | 3,2 |
| `concrete_wall_008_*` | concreto (lajes, pilares, vigas, fundação) | 2,7 |
| `clay_roof_tiles_02_*` | telha cerâmica | 2,5 |
| `corrugated_iron_02_*` | telha metálica ondulada | 2,7 |
| `oak_veneer_01_*` | madeira (portas, ripados, painéis) | 1,83 |
| `marble_01_*` | porcelanato e pisos de pedra polida | 1,5 |
| `coral_stone_wall_*` | pedra em cacos (paredes de pedra) | 2 |

`_cor` é a cor (sRGB), `_normal` o relevo (OpenGL) e `_rugosidade` a rugosidade. Uso em `src/rendering/ambiente.ts` e `src/rendering/Cena.ts` (ADR-23 e ADR-24). Sem uma foto, o material volta à textura procedural de `src/rendering/texturas.ts`.
