// Decodificação de arquivos de texto vindos do Excel brasileiro (ADR-05):
// UTF-8 com ou sem BOM, ou Windows-1252.

export function decodificar(bytes: Uint8Array): { texto: string; codificacao: "utf-8" | "windows-1252" } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { texto: new TextDecoder("utf-8").decode(bytes.subarray(3)), codificacao: "utf-8" };
  }
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), codificacao: "utf-8" };
  } catch {
    return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "windows-1252" };
  }
}
