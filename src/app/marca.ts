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
 * Monograma provisório, em caminho SVG numa caixa 100 × 100 (só traço): dois D encaixados, o menor
 * apoiado na base do maior, como no logo do perfil. Serve ao SVG da interface e ao canvas do vídeo
 * (Path2D aceita o mesmo texto).
 */
export const MONOGRAMA_DP = "M24 14 H46 A36 36 0 0 1 46 86 H24 Q18 86 18 80 V20 Q18 14 24 14 Z M34 86 V34 H52 A26 26 0 0 1 52 86";
export const MONOGRAMA_TRACO = 4;
