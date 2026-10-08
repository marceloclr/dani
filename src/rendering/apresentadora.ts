// Apresentadora em primeiro plano (ADR-24): lê o vídeo da fala (mediabunny), recorta a pessoa por IA
// (MediaPipe, segmentação de selfie) ou por fundo verde (chave de croma) e a desenha sobre a cena num
// passo ortográfico, com borda suave e sombra leve. Quadro a quadro, pelo tempo do vídeo: determinístico.
import * as THREE from "three";
import { ALL_FORMATS, BlobSource, CanvasSink, Input, type WrappedCanvas } from "mediabunny";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { LimpezaDeMascara, croma, layoutApresentadora, type ConfigApresentadora, type Retangulo } from "./composicao";
import { BORDA_CORTINA, type PessoaNaCena } from "./montagem";

const temWebCodecs = () => typeof VideoDecoder !== "undefined" && typeof VideoFrame !== "undefined";

/** O que o app guarda ao receber o arquivo: tamanho e duração. */
export async function lerInfoDaFala(arquivo: Blob): Promise<{ largura: number; altura: number; duracaoS: number }> {
  if (temWebCodecs()) {
    const input = new Input({ source: new BlobSource(arquivo), formats: ALL_FORMATS });
    try {
      const vt = await input.getPrimaryVideoTrack();
      if (!vt) throw new Error("O arquivo não tem vídeo.");
      return { largura: vt.displayWidth, altura: vt.displayHeight, duracaoS: await input.computeDuration() };
    } finally {
      input.dispose();
    }
  }
  const v = await elementoDeVideo(arquivo);
  const info = { largura: v.videoWidth, altura: v.videoHeight, duracaoS: v.duration };
  URL.revokeObjectURL(v.src);
  return info;
}

function elementoDeVideo(arquivo: Blob): Promise<HTMLVideoElement> {
  return new Promise((ok, falha) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => ok(v);
    v.onerror = () => falha(new Error("O navegador não abriu este vídeo."));
    v.src = URL.createObjectURL(arquivo);
  });
}

/** Quadros da fala em sequência, pelo tempo (s); depois do fim, repete o último. */
export interface QuadrosDaFala {
  largura: number;
  altura: number;
  duracaoS: number;
  proximo(t: number): Promise<CanvasImageSource>;
  dispose(): void;
}

/** Um trecho de uma fala: o arquivo e o corte (s). Várias falas em sequência formam a voz do vídeo (ADR-30). */
export interface TrechoDeFala {
  arquivo: Blob;
  inicioS: number;
  fimS: number;
}

/** A fala do vídeo: um arquivo só (ADR-24) ou as falas da planilha, em ordem (ADR-30). */
export type FonteFala = Blob | TrechoDeFala[];

/** Em que trecho cai o segundo `t` da sequência e o tempo dentro do arquivo dele (depois do fim, o último quadro). */
export function localizarNaSequencia(trechos: { inicioS: number; fimS: number }[], t: number): { indice: number; tArquivo: number } {
  let ini = 0;
  for (let i = 0; i < trechos.length; i++) {
    const d = trechos[i].fimS - trechos[i].inicioS;
    if (t < ini + d || i === trechos.length - 1) return { indice: i, tArquivo: trechos[i].inicioS + Math.min(Math.max(t - ini, 0), d) };
    ini += d;
  }
  throw new Error("sequência de falas vazia");
}

export async function abrirQuadros(fonte: FonteFala, tempos: number[]): Promise<QuadrosDaFala> {
  if (fonte instanceof Blob) return abrirQuadrosDoArquivo(fonte, tempos);
  // sequência: cada arquivo é aberto só com os seus tempos, um de cada vez; os quadros vão para uma tela do
  // tamanho do primeiro (os de outro formato entram cobrindo-a, sem distorcer)
  const locais = tempos.map((t) => localizarNaSequencia(fonte, t));
  const porTrecho = fonte.map((_, i) => locais.filter((l) => l.indice === i).map((l) => Math.max(0, l.tArquivo - 0.001)));
  const primeiro = await abrirQuadrosDoArquivo(fonte[0].arquivo, porTrecho[0].length ? porTrecho[0] : [fonte[0].inicioS]);
  let atual: { indice: number; q: QuadrosDaFala } = { indice: 0, q: primeiro };
  const tela = document.createElement("canvas");
  tela.width = primeiro.largura;
  tela.height = primeiro.altura;
  const ctx = tela.getContext("2d")!;
  let k = 0;
  return {
    largura: tela.width,
    altura: tela.height,
    duracaoS: fonte.reduce((s, x) => s + (x.fimS - x.inicioS), 0),
    async proximo() {
      const l = locais[Math.min(k++, locais.length - 1)];
      if (atual.indice !== l.indice) {
        atual.q.dispose();
        atual = { indice: l.indice, q: await abrirQuadrosDoArquivo(fonte[l.indice].arquivo, porTrecho[l.indice]) };
      }
      const img = await atual.q.proximo(l.tArquivo);
      const { largura: w, altura: h } = atual.q;
      const e = Math.max(tela.width / w, tela.height / h);
      ctx.drawImage(img, (tela.width - w * e) / 2, (tela.height - h * e) / 2, w * e, h * e);
      return tela;
    },
    dispose: () => atual.q.dispose(),
  };
}

async function abrirQuadrosDoArquivo(arquivo: Blob, tempos: number[]): Promise<QuadrosDaFala> {
  if (temWebCodecs()) {
    const input = new Input({ source: new BlobSource(arquivo), formats: ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error("O arquivo da apresentadora não tem vídeo.");
    const duracaoS = await input.computeDuration();
    const sink = new CanvasSink(vt, { poolSize: 3 });
    // tempos além do fim da fala ficam no último quadro
    const ultimo = Math.max(0, duracaoS - 0.001);
    const iter = sink.canvasesAtTimestamps(tempos.map((t) => Math.min(t, ultimo)));
    let anterior: WrappedCanvas | null = null;
    return {
      largura: vt.displayWidth,
      altura: vt.displayHeight,
      duracaoS,
      async proximo() {
        const r = await iter.next();
        if (!r.done && r.value) anterior = r.value;
        if (!anterior) throw new Error("Não foi possível ler o quadro da apresentadora.");
        return anterior.canvas as CanvasImageSource;
      },
      dispose: () => {
        // encerra o iterador antes de descartar a entrada (senão a decodificação pendente falha)
        void iter
          .return(undefined)
          .catch(() => {})
          .finally(() => input.dispose());
      },
    };
  }
  // sem WebCodecs: busca quadro a quadro num <video> (mais lento)
  const v = await elementoDeVideo(arquivo);
  return {
    largura: v.videoWidth,
    altura: v.videoHeight,
    duracaoS: v.duration,
    async proximo(t: number) {
      const alvo = Math.min(t, Math.max(0, v.duration - 0.05));
      if (Math.abs(v.currentTime - alvo) > 1e-3) {
        await new Promise<void>((ok) => {
          v.onseeked = () => ok();
          v.currentTime = alvo;
        });
      }
      return v;
    },
    dispose: () => {
      URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
    },
  };
}

/** Um quadro qualquer (prévia e conta-gotas da cor do fundo verde). */
export async function quadroDaFala(arquivo: Blob, t = 0.5): Promise<HTMLCanvasElement> {
  const q = await abrirQuadros(arquivo, [t]);
  try {
    const img = await q.proximo(t);
    const c = document.createElement("canvas");
    c.width = q.largura;
    c.height = q.altura;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    q.dispose();
  }
}

// ------------------------------------------------------------------ recorte por IA

let segmentador: Promise<ImageSegmenter> | null = null;

/** Carrega o MediaPipe (wasm e modelo servidos pelo app, sem CDN) só na primeira vez que é usado. */
function obterSegmentador(): Promise<ImageSegmenter> {
  segmentador ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const base = new URL("mediapipe/", document.baseURI).href;
    const arquivos = await FilesetResolver.forVisionTasks(`${base}wasm`);
    const criar = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(arquivos, {
        baseOptions: { modelAssetPath: `${base}selfie_segmenter.tflite`, delegate },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    try {
      return await criar("GPU");
    } catch {
      return await criar("CPU");
    }
  })().catch((e) => {
    segmentador = null;
    throw e;
  });
  return segmentador;
}

/** Relógio da segmentação: o modo VIDEO exige tempos sempre crescentes, também entre um vídeo e outro. */
let relogioMs = 0;

/** Lado maior da imagem enviada à segmentação: a máscara é ampliada (e suavizada) no shader. */
const LADO_SEGMENTACAO = 384;

// ------------------------------------------------------------------ camada desenhada sobre a cena

export interface CamadaApresentadora {
  cena: THREE.Scene;
  camera: THREE.OrthographicCamera;
  ret: Retangulo;
  /**
   * Como ela aparece (ADR-25): recortada no canto (padrão), o quadro original em tela cheia com a cortina
   * da revelação (0 = fundo real inteiro, 1 = só a pessoa) ou oculta.
   */
  definir(o: { modo: PessoaNaCena; revelacao?: number }): void;
  /** Atualiza a imagem e a máscara com o quadro atual da fala. */
  atualizar(img: CanvasImageSource): Promise<void>;
  dispose(): void;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  uniform sampler2D tVideo;
  uniform sampler2D tMascara;
  uniform int modo; // 0 = IA (máscara), 1 = fundo verde (croma)
  uniform vec2 chave; // Cb, Cr da cor do fundo
  uniform float tolerancia, suavidade;
  uniform vec2 texel; // 1 / tamanho da máscara
  uniform vec2 uvEscala, uvDesloc; // recorte central (cover) do quadro no plano de tela cheia
  uniform float cheia; // 1 = plano de tela cheia (ADR-25)
  uniform float revelacao; // 0 = fundo real inteiro; 1 = só a pessoa (a obra aparece atrás)
  uniform float borda; // borda suave da cortina
  varying vec2 vUv;
  // mesma conta de cortinaRevelacao (montagem.ts): o fundo real some de baixo para cima
  float cortina(float u, float y) {
    float frente = -borda + u * (1.0 + 2.0 * borda);
    float t = clamp((y - frente + borda) / (2.0 * borda), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  // a textura chega em luz linear; a chave foi medida em sRGB
  vec3 paraSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
  vec2 croma(vec3 c) {
    return vec2(0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
  }
  float alfa(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    if (modo == 0) return smoothstep(0.3, 0.7, texture2D(tMascara, uv).r);
    float d = distance(croma(paraSrgb(texture2D(tVideo, uv).rgb)), chave);
    float t = clamp((d - tolerancia) / max(suavidade, 1e-4), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  void main() {
    vec2 uv = uvDesloc + vUv * uvEscala;
    // borda: média em cruz (suaviza o serrilhado da máscara e da chave)
    vec2 p = modo == 0 ? texel : texel * 0.5;
    float a = alfa(uv) * 0.4 + (alfa(uv + vec2(p.x, 0.0)) + alfa(uv - vec2(p.x, 0.0)) + alfa(uv + vec2(0.0, p.y)) + alfa(uv - vec2(0.0, p.y))) * 0.15;
    vec3 original = texture2D(tVideo, uv).rgb;
    vec3 cor = original;
    if (modo == 1) cor.g = min(cor.g, (cor.r + cor.b) * 0.5 + 0.002); // tira o verde que vaza (em luz linear)
    // tela cheia: o fundo real aparece onde a cortina ainda não passou
    float fundo = cheia > 0.5 ? cortina(revelacao, vUv.y) : 0.0;
    float base = max(a, fundo);
    cor = mix(cor, original, fundo);
    // sombra suave, deslocada para baixo e para a direita, só onde nem a pessoa nem o fundo estão
    vec2 off = vec2(0.012, -0.008);
    float s = 0.0;
    for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += alfa(uv - off + vec2(float(i), float(j)) * texel * 3.0);
    s = s / 25.0 * 0.32;
    float aFinal = base + s * (1.0 - base);
    vec3 corFinal = aFinal > 0.0 ? cor * base / aFinal : cor;
    gl_FragColor = vec4(corFinal, aFinal);
    #include <colorspace_fragment>
  }`;

/**
 * Camada da apresentadora no tamanho do vídeo (`largura` × `altura`), na posição e altura configuradas.
 * O renderizador desenha `cena` com `camera` por cima da cena do projeto, sem limpar o quadro.
 */
export async function criarCamadaApresentadora(largura: number, altura: number, cfg: ConfigApresentadora, videoW: number, videoH: number, comTelaCheia = false): Promise<CamadaApresentadora> {
  const ret = layoutApresentadora(largura, altura, videoW, videoH, cfg.posicao, cfg.alturaFracao);
  const quadro = document.createElement("canvas");
  // com tela cheia (montagem, ADR-25), o quadro precisa da resolução do vídeo de saída
  const larguraUtil = comTelaCheia ? Math.max(ret.w * 1.5, largura, (altura * videoW) / Math.max(videoH, 1)) : ret.w * 1.5;
  quadro.width = Math.max(2, Math.min(videoW, Math.round(larguraUtil)));
  quadro.height = Math.max(2, Math.round((quadro.width * videoH) / Math.max(videoW, 1)));
  const ctxQuadro = quadro.getContext("2d")!;
  const tex = new THREE.CanvasTexture(quadro);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const ia = cfg.recorte === "ia";
  const k = Math.min(1, LADO_SEGMENTACAO / Math.max(videoW, videoH));
  const pequeno = document.createElement("canvas");
  pequeno.width = Math.max(2, Math.round(videoW * k));
  pequeno.height = Math.max(2, Math.round(videoH * k));
  const ctxPequeno = pequeno.getContext("2d", { willReadFrequently: true })!;
  const dadosMascara = new Uint8Array(pequeno.width * pequeno.height);
  const mascara = new THREE.DataTexture(dadosMascara, pequeno.width, pequeno.height, THREE.RedFormat, THREE.UnsignedByteType);
  mascara.minFilter = mascara.magFilter = THREE.LinearFilter;
  mascara.flipY = true; // a máscara vem de cima para baixo, como a imagem
  mascara.needsUpdate = true;
  const seg = ia ? await obterSegmentador() : null;
  // só a pessoa, estável no tempo; some quando o recorte não é confiável (ADR-31)
  const limpeza = new LimpezaDeMascara(pequeno.width, pequeno.height);

  const material = (cheia: boolean) => {
    // tela cheia: recorte central do quadro na proporção do vídeo de saída (cover)
    const A = largura / altura, V = videoW / Math.max(videoH, 1);
    const escala = !cheia ? [1, 1] : V > A ? [A / V, 1] : [1, V / A];
    return new THREE.ShaderMaterial({
      uniforms: {
        tVideo: { value: tex },
        tMascara: { value: mascara },
        modo: { value: ia ? 0 : 1 },
        chave: { value: new THREE.Vector2(...croma(...cfg.chave)) },
        tolerancia: { value: cfg.tolerancia },
        suavidade: { value: cfg.suavidade },
        texel: { value: new THREE.Vector2(1 / pequeno.width, 1 / pequeno.height) },
        uvEscala: { value: new THREE.Vector2(escala[0], escala[1]) },
        uvDesloc: { value: new THREE.Vector2((1 - escala[0]) / 2, (1 - escala[1]) / 2) },
        cheia: { value: cheia ? 1 : 0 },
        revelacao: { value: 0 },
        borda: { value: BORDA_CORTINA },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      toneMapped: false,
    });
  };
  const mat = material(false);
  const matCheia = material(true);
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(ret.w, ret.h), mat);
  plano.position.set(ret.x + ret.w / 2, ret.y + ret.h / 2, 0);
  const planoCheio = new THREE.Mesh(new THREE.PlaneGeometry(largura, altura), matCheia);
  planoCheio.position.set(largura / 2, altura / 2, 0);
  planoCheio.visible = false;
  const cena = new THREE.Scene();
  cena.add(plano, planoCheio);
  const camera = new THREE.OrthographicCamera(0, largura, altura, 0, -1, 1);

  return {
    cena,
    camera,
    ret,
    definir({ modo, revelacao = 0 }) {
      plano.visible = modo === "recortada";
      planoCheio.visible = modo === "cheia";
      matCheia.uniforms.revelacao.value = revelacao;
    },
    async atualizar(img) {
      ctxQuadro.drawImage(img, 0, 0, quadro.width, quadro.height);
      tex.needsUpdate = true;
      if (seg) {
        ctxPequeno.drawImage(img, 0, 0, pequeno.width, pequeno.height);
        relogioMs += 33;
        const r = seg.segmentForVideo(pequeno, relogioMs);
        const conf = r.confidenceMasks?.[0]?.getAsFloat32Array();
        if (conf) {
          const { mascara: m } = limpeza.limpar(conf);
          for (let i = 0; i < m.length && i < dadosMascara.length; i++) dadosMascara[i] = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
        }
        r.close();
        mascara.needsUpdate = true;
      }
    },
    dispose: () => {
      tex.dispose();
      mascara.dispose();
      mat.dispose();
      matCheia.dispose();
      plano.geometry.dispose();
      planoCheio.geometry.dispose();
    },
  };
}

// ------------------------------------------------------------------ áudio da fala

/** Decodifica o áudio da fala (AAC, Opus, MP3…) pelo próprio navegador; null se o arquivo não tiver som. */
export async function audioDaFala(fonte: FonteFala): Promise<AudioBuffer | null> {
  if (!(fonte instanceof Blob)) return audioDaSequencia(fonte);
  const arquivo = fonte;
  try {
    const ctx = new OfflineAudioContext(2, 1, 48000);
    return await ctx.decodeAudioData(await arquivo.arrayBuffer());
  } catch {
    return null;
  }
}

/** Voz das falas em sequência: cada uma no seu corte, emendadas; sem som numa delas, silêncio no lugar. */
async function audioDaSequencia(trechos: TrechoDeFala[]): Promise<AudioBuffer | null> {
  const taxa = 48000;
  const bufs = await Promise.all(trechos.map((t) => audioDaFala(t.arquivo)));
  if (bufs.every((b) => !b)) return null;
  const canais = Math.max(...bufs.map((b) => b?.numberOfChannels ?? 1));
  const tamanhos = trechos.map((t) => Math.round((t.fimS - t.inicioS) * taxa));
  const saida = new AudioBuffer({ length: Math.max(1, tamanhos.reduce((a, b) => a + b, 0)), numberOfChannels: canais, sampleRate: taxa });
  let pos = 0;
  trechos.forEach((t, i) => {
    const b = bufs[i];
    if (b) {
      const ini = Math.round(t.inicioS * b.sampleRate);
      for (let c = 0; c < canais; c++) {
        const dados = b.getChannelData(Math.min(c, b.numberOfChannels - 1)).subarray(ini, ini + tamanhos[i]);
        saida.copyToChannel(dados, c, pos);
      }
    }
    pos += tamanhos[i];
  });
  return saida;
}

/**
 * Corta o áudio em pedaços de `passo` segundos até `ate` (a duração do vídeo), para intercalar com os
 * quadros na gravação. O último pedaço é encurtado no fim do vídeo.
 */
export function* pedacosDeAudio(buf: AudioBuffer, ate: number, passo = 0.5): Generator<{ t: number; pedaco: AudioBuffer }> {
  const total = Math.min(buf.length, Math.round(ate * buf.sampleRate));
  const n = Math.max(1, Math.round(passo * buf.sampleRate));
  for (let ini = 0; ini < total; ini += n) {
    const len = Math.min(n, total - ini);
    const p = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
    for (let c = 0; c < buf.numberOfChannels; c++) p.copyToChannel(buf.getChannelData(c).subarray(ini, ini + len), c);
    yield { t: ini / buf.sampleRate, pedaco: p };
  }
}

/**
 * Prévia da composição (ADR-24): o quadro da fala em `t`, recortado com o mesmo shader do vídeo, sobre
 * um fundo neutro de `largura` × `altura` (proporção do formato do vídeo).
 */
export async function previaApresentadora(arquivo: Blob, cfg: ConfigApresentadora, largura: number, altura: number, t = 0.5, transparente = false): Promise<HTMLCanvasElement> {
  const quadro = await quadroDaFala(arquivo, Math.min(t, Math.max(0, cfg.duracaoS - 0.1)));
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  // transparente: só a pessoa recortada, para sobrepor à cena 3D (prévia do assistente, ADR-30)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: transparente, premultipliedAlpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(largura, altura, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camada = await criarCamadaApresentadora(largura, altura, cfg, quadro.width, quadro.height);
  try {
    await camada.atualizar(quadro);
    renderer.setClearColor(0x6f7d8c, transparente ? 0 : 1);
    renderer.clear();
    renderer.autoClear = false;
    renderer.render(camada.cena, camada.camera);
    // copia para um canvas 2D: o contexto WebGL da prévia é descartado em seguida
    const saida = document.createElement("canvas");
    saida.width = largura;
    saida.height = altura;
    saida.getContext("2d")!.drawImage(canvas, 0, 0);
    return saida;
  } finally {
    camada.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
