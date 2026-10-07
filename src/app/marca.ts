// Marca (incremento 9 e ADR-24): o produto, Construction 4D Studio, feito para a engenheira Daniella Pompeu.
// A identidade dela (monograma DP, grafite e dourado, "Engenharia que transforma") vem do perfil
// @daniellapompeuengenharia. O monograma aqui é PROVISÓRIO, redesenhado a partir da foto de perfil, até
// chegar o arquivo oficial do logo.
export const NOME_MARCA = "Construction 4D Studio";
/** Slogan do produto (secundário, ao lado da marca da cliente). */
export const SLOGAN = "Produtor de Vídeos das obras da Super Influencer Dani, a engenheira.";

export const CLIENTE = {
  nome: "Daniella Pompeu",
  empresa: "Daniella Pompeu Engenharia",
  slogan: "Engenharia que transforma",
  instagram: "@daniellapompeuengenharia",
};

/** Cores da identidade da cliente, medidas nos posts (dourado do monograma e grafite da ardósia). */
export const COR_DOURADO = "#b88848";
export const COR_DOURADO_CLARO = "#d9b77e";
export const COR_GRAFITE = "#2c2c2c";

/**
 * Monograma (redesenhado em vetor a partir do logo do perfil, até chegar o arquivo oficial): um único
 * contorno de D cuja contraforma é outro D, deslocado para baixo e para a direita: a haste do D de dentro
 * desce até a base do bojo grande e a base dele se liga à haste da esquerda. Caixa 100 × 100, só traço.
 * Serve ao SVG da interface e ao canvas do vídeo (Path2D aceita o mesmo texto).
 */
export const MONOGRAMA_DP = "M12 10 H39 A54 39.75 0 0 1 39 89.5 H35.4 V22 H43.5 A25.5 25 0 0 1 43.5 72 H12 Z";
export const MONOGRAMA_TRACO = 4.2;
