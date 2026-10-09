// Registro de configuração do H.264 no MP4 (caixa avcC, ISO 14496-15). O codificador do Firefox no Windows
// entrega o SPS e o PPS com o cabeçalho da NAL repetido (67 67 4d…, 68 68 ce…): o player lê o perfil "103"
// e recusa o vídeo ("Codificado em AVC1"). Funções puras: conferem o registro e o refazem com o SPS e o PPS
// que o próprio vídeo traz dentro do primeiro quadro-chave.
import { BufferSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output, type EncodedPacket } from "mediabunny";

export interface ParametrosAvc {
  sps: Uint8Array[];
  pps: Uint8Array[];
  /** Bytes do NAL: 4 na saída dos navegadores. */
  tamanhoNal: number;
}

const NAL_SPS = 7, NAL_PPS = 8;
const tipoNal = (n: Uint8Array) => n[0] & 0x1f;

/** Lê o avcC; null se estiver truncado. */
export function lerAvcC(d: Uint8Array): ParametrosAvc | null {
  if (d.length < 7 || d[0] !== 1) return null;
  const tamanhoNal = (d[4] & 3) + 1;
  let p = 5;
  const lista = (n: number) => {
    const out: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      if (p + 2 > d.length) return null;
      const l = (d[p] << 8) | d[p + 1];
      if (p + 2 + l > d.length) return null;
      out.push(d.subarray(p + 2, p + 2 + l));
      p += 2 + l;
    }
    return out;
  };
  const sps = lista(d[p++] & 0x1f);
  if (!sps || p >= d.length) return null;
  const pps = lista(d[p++]);
  if (!pps) return null;
  return { sps, pps, tamanhoNal };
}

/** O SPS válido começa pelo cabeçalho 0x67 (tipo 7) seguido do perfil, que o avcC repete no 2º byte. */
export function avcCValido(d: Uint8Array): boolean {
  const r = lerAvcC(d);
  if (!r || !r.sps.length || !r.pps.length) return false;
  const s = r.sps[0];
  return s.length > 4 && tipoNal(s) === NAL_SPS && s[1] === d[1] && s[3] === d[3] && r.pps.every((x) => tipoNal(x) === NAL_PPS && x[1] !== x[0]);
}

/** Monta o avcC (perfil, compatibilidade e nível vêm do SPS). */
export function montarAvcC({ sps, pps, tamanhoNal }: ParametrosAvc): Uint8Array {
  const s = sps[0];
  const tam = 7 + sps.reduce((a, x) => a + 2 + x.length, 0) + pps.reduce((a, x) => a + 2 + x.length, 0);
  const d = new Uint8Array(tam);
  d.set([1, s[1], s[2], s[3], 0xfc | (tamanhoNal - 1), 0xe0 | sps.length]);
  let p = 6;
  const por = (x: Uint8Array) => {
    d[p] = x.length >> 8;
    d[p + 1] = x.length & 0xff;
    d.set(x, p + 2);
    p += 2 + x.length;
  };
  sps.forEach(por);
  d[p++] = pps.length;
  pps.forEach(por);
  return d;
}

/** SPS e PPS dentro de um quadro (NALs com o tamanho na frente). */
export function parametrosNoQuadro(dados: Uint8Array, tamanhoNal = 4): Pick<ParametrosAvc, "sps" | "pps"> {
  const sps: Uint8Array[] = [], pps: Uint8Array[] = [];
  let p = 0;
  while (p + tamanhoNal <= dados.length) {
    let l = 0;
    for (let i = 0; i < tamanhoNal; i++) l = l * 256 + dados[p + i];
    const ini = p + tamanhoNal;
    if (l === 0 || ini + l > dados.length) break;
    const nal = dados.subarray(ini, ini + l);
    if (tipoNal(nal) === NAL_SPS) sps.push(nal);
    if (tipoNal(nal) === NAL_PPS) pps.push(nal);
    p = ini + l;
  }
  return { sps, pps };
}

/**
 * Refaz o avcC estragado: com o SPS e o PPS do primeiro quadro-chave, quando ele os traz; senão, tirando o
 * cabeçalho repetido. Devolve null se o registro já está bom ou se não há como consertar.
 */
export function consertarAvcC(d: Uint8Array, quadroChave?: Uint8Array): Uint8Array | null {
  if (avcCValido(d)) return null;
  const r = lerAvcC(d);
  const tamanhoNal = r?.tamanhoNal ?? 4;
  const noQuadro = quadroChave ? parametrosNoQuadro(quadroChave, tamanhoNal) : { sps: [], pps: [] };
  const sem = (x: Uint8Array) => (x.length > 1 && x[0] === x[1] ? x.subarray(1) : x);
  const sps = noQuadro.sps.length ? noQuadro.sps : (r?.sps ?? []).map(sem);
  const pps = noQuadro.pps.length ? noQuadro.pps : (r?.pps ?? []).map(sem);
  if (!sps.length || !pps.length) return null;
  const novo = montarAvcC({ sps, pps, tamanhoNal });
  return avcCValido(novo) ? novo : null;
}

// sem `SharedArrayBuffer`: no navegador ele só existe em páginas isoladas (COOP/COEP) e a referência quebrava
export const comoBytes = (b: AllowSharedBufferSource): Uint8Array => (ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));

/**
 * MP4 com o avcC refeito, sem recodificar: os pacotes de vídeo e de áudio são copiados na ordem do tempo e
 * só o registro muda. Devolve o próprio arquivo quando o registro já está bom ou não há como consertar.
 */
export async function mp4ComAvcCConsertado(mp4: Uint8Array, fps: number): Promise<Uint8Array> {
  const input = new Input({ formats: [MP4], source: new BufferSource(mp4) });
  try {
    const vt = await input.getPrimaryVideoTrack();
    const cfg = vt?.codec === "avc" ? await vt.getDecoderConfig() : null;
    if (!vt || !cfg?.description || avcCValido(comoBytes(cfg.description))) return mp4;
    const video: EncodedPacket[] = [];
    for await (const p of new EncodedPacketSink(vt).packets()) video.push(p);
    const chave = video.find((p) => p.type === "key");
    const avcc = consertarAvcC(comoBytes(cfg.description), chave?.data);
    if (!avcc) return mp4;
    const at = await input.getPrimaryAudioTrack();
    const audio: EncodedPacket[] = [];
    if (at) for await (const p of new EncodedPacketSink(at).packets()) audio.push(p);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const fonteVideo = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(fonteVideo, { frameRate: fps });
    const fonteAudio = at?.codec && audio.length ? new EncodedAudioPacketSource(at.codec) : null;
    if (fonteAudio) output.addAudioTrack(fonteAudio);
    await output.start();
    const cfgAudio = at && fonteAudio ? await at.getDecoderConfig() : null;
    // intercalados pelo tempo, como no original
    let v = 0, a = 0;
    while (v < video.length || (fonteAudio && a < audio.length)) {
      if (fonteAudio && a < audio.length && (v >= video.length || audio[a].timestamp < video[v].timestamp)) {
        await fonteAudio.add(audio[a], a === 0 && cfgAudio ? { decoderConfig: cfgAudio } : undefined);
        a++;
      } else {
        await fonteVideo.add(video[v], v === 0 ? { decoderConfig: { ...cfg, description: avcc } } : undefined);
        v++;
      }
    }
    await output.finalize();
    const b = (output.target as BufferTarget).buffer;
    return b && b.byteLength ? new Uint8Array(b) : mp4;
  } finally {
    input.dispose();
  }
}