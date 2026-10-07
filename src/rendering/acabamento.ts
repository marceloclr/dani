// Acabamento de câmera (ADR-24): passo final sobre a imagem já em sRGB, como a correção de cor de um
// vídeo profissional. Curva de contraste suave, saturação, vinheta e granulação fina e determinística
// (a semente é o número do quadro, para o vídeo sair igual a cada geração).
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface AjusteCor {
  /** 0 = sem curva; 1 = curva em S cheia. */
  contraste: number;
  /** 1 = sem mudança. */
  saturacao: number;
  /** Escurecimento das bordas (0 a 1). */
  vinheta: number;
  /** Amplitude da granulação (0 a 0,05). */
  granulacao: number;
  /** Aquecimento leve (positivo puxa para o âmbar). */
  temperatura: number;
}

export const AJUSTE_PADRAO: AjusteCor = { contraste: 0.28, saturacao: 1.08, vinheta: 0.22, granulacao: 0.012, temperatura: 0.02 };

/** Curva em S aplicada a um canal (0–1): a mesma do shader, exportada para o teste. */
export function curvaS(v: number, contraste: number): number {
  const s = v * v * (3 - 2 * v); // smoothstep
  return v + (s - v) * contraste;
}

export function passoAcabamento(ajuste: AjusteCor = AJUSTE_PADRAO): ShaderPass & { definirQuadro(i: number): void } {
  const passo = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      contraste: { value: ajuste.contraste },
      saturacao: { value: ajuste.saturacao },
      vinheta: { value: ajuste.vinheta },
      granulacao: { value: ajuste.granulacao },
      temperatura: { value: ajuste.temperatura },
      semente: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float contraste, saturacao, vinheta, granulacao, temperatura, semente;
      varying vec2 vUv;
      float ruido(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + semente * 0.618) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 s = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);
        vec3 cor = mix(c.rgb, s, contraste);
        float l = dot(cor, vec3(0.2126, 0.7152, 0.0722));
        cor = mix(vec3(l), cor, saturacao);
        cor += vec3(temperatura, temperatura * 0.35, -temperatura);
        vec2 d = vUv - 0.5;
        cor *= 1.0 - vinheta * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.85)) * 1.25);
        cor += (ruido(gl_FragCoord.xy) - 0.5) * granulacao;
        gl_FragColor = vec4(clamp(cor, 0.0, 1.0), c.a);
      }`,
  }) as ShaderPass & { definirQuadro(i: number): void };
  passo.definirQuadro = (i: number) => {
    passo.uniforms.semente.value = i % 997;
  };
  return passo;
}
