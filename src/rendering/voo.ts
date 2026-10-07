// Drone na viewport (ADR-23): voo manual (teclado, mouse e toque) e prévia do voo automático.
import * as THREE from "three";
import type { Cena } from "./Cena";

export type Comando = "frente" | "tras" | "esquerda" | "direita" | "subir" | "descer";

const TECLAS: Record<string, Comando> = {
  KeyW: "frente", ArrowUp: "frente", KeyS: "tras", ArrowDown: "tras",
  KeyA: "esquerda", ArrowLeft: "esquerda", KeyD: "direita", ArrowRight: "direita",
  KeyE: "subir", PageUp: "subir", KeyQ: "descer", PageDown: "descer",
};

export const AJUDA_VOO = "W A S D ou setas: voar · E/Q: subir e descer · arrastar: olhar · roda: velocidade · Shift: rápido · Esc: sair";

/** Voo livre: a câmera se move como um drone, atravessando a obra por dentro e por fora. */
export class VooManual {
  private ativos = new Set<Comando>();
  private yaw = 0;
  private pitch = 0;
  private velocidade = 3; // m/s
  private rapido = false;
  private anterior = 0;
  private quadro = 0;
  private arrasto: { x: number; y: number } | null = null;
  private readonly sair: () => void;

  constructor(private readonly cena: Cena, aoSair: () => void) {
    const cam = cena.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    cena.controls.enabled = false;
    cena.pararGiro();
    const el = cena.renderer.domElement;
    const tecla = (e: KeyboardEvent, ligado: boolean) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.code === "Escape" && ligado) return this.parar();
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.rapido = ligado;
      const c = TECLAS[e.code];
      if (!c) return;
      e.preventDefault();
      this.comando(c, ligado);
    };
    const baixo = (e: KeyboardEvent) => tecla(e, true);
    const cima = (e: KeyboardEvent) => tecla(e, false);
    const apertar = (e: PointerEvent) => {
      this.arrasto = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const mover = (e: PointerEvent) => {
      if (!this.arrasto) return;
      this.yaw -= (e.clientX - this.arrasto.x) * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.arrasto.y) * 0.004, -1.45, 1.45);
      this.arrasto = { x: e.clientX, y: e.clientY };
      this.aplicar();
    };
    const soltar = () => (this.arrasto = null);
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      this.velocidade = THREE.MathUtils.clamp(this.velocidade * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 0.5, 40);
    };
    window.addEventListener("keydown", baixo);
    window.addEventListener("keyup", cima);
    el.addEventListener("pointerdown", apertar);
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("wheel", roda, { passive: false });
    this.sair = () => {
      window.removeEventListener("keydown", baixo);
      window.removeEventListener("keyup", cima);
      el.removeEventListener("pointerdown", apertar);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("wheel", roda);
      cancelAnimationFrame(this.quadro);
      // a órbita volta a girar em volta do ponto para onde o drone olhava
      const alvo = cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
      cena.controls.target.copy(alvo);
      cena.controls.enabled = true;
      cena.controls.update();
      aoSair();
    };
    this.aplicar();
  }

  /** Liga ou desliga um comando (teclado ou botões da tela). */
  comando(c: Comando, ligado: boolean): void {
    if (ligado) this.ativos.add(c);
    else this.ativos.delete(c);
    if (this.ativos.size && !this.quadro) {
      this.anterior = performance.now();
      this.quadro = requestAnimationFrame((t) => this.passo(t));
    }
  }

  private passo(agora: number): void {
    const dt = Math.min((agora - this.anterior) / 1000, 0.25); // em máquina lenta o drone ainda anda na velocidade certa
    this.anterior = agora;
    const v = this.velocidade * (this.rapido ? 3 : 1) * dt;
    const frente = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const lado = new THREE.Vector3(-frente.z, 0, frente.x);
    const p = this.cena.camera.position;
    if (this.ativos.has("frente")) p.addScaledVector(frente, v);
    if (this.ativos.has("tras")) p.addScaledVector(frente, -v);
    if (this.ativos.has("direita")) p.addScaledVector(lado, v);
    if (this.ativos.has("esquerda")) p.addScaledVector(lado, -v);
    if (this.ativos.has("subir")) p.y += v;
    if (this.ativos.has("descer")) p.y -= v;
    this.aplicar();
    this.quadro = this.ativos.size ? requestAnimationFrame((t) => this.passo(t)) : 0;
  }

  private aplicar(): void {
    const cam = this.cena.camera;
    const d = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    cam.near = 0.05;
    cam.fov = 60;
    cam.updateProjectionMatrix();
    cam.lookAt(cam.position.clone().add(d));
    cam.updateMatrixWorld();
    this.cena.pedirQuadro();
  }

  parar(): void {
    this.sair();
  }
}

/** Prévia do voo automático na viewport, em tempo real, com a obra avançando junto. */
export class PreviaVoo {
  private quadro = 0;
  private inicio = 0;
  private parado = false;

  constructor(
    private readonly cena: Cena,
    private readonly segundos: number,
    private readonly aoDia: (u: number) => void,
    private readonly aoFim: () => void,
  ) {
    const voo = cena.voo();
    if (!voo) {
      aoFim();
      return;
    }
    cena.controls.enabled = false;
    cena.pararGiro();
    this.inicio = performance.now();
    const passo = (agora: number) => {
      const u = Math.min((agora - this.inicio) / 1000 / this.segundos, 1);
      this.aoDia(u);
      cena.posicionarLivre(cena.camera, voo.quadro(u));
      cena.pedirQuadro();
      if (u < 1) this.quadro = requestAnimationFrame(passo);
      else this.parar();
    };
    this.quadro = requestAnimationFrame(passo);
  }

  parar(): void {
    if (this.parado) return;
    this.parado = true;
    cancelAnimationFrame(this.quadro);
    const cam = this.cena.camera;
    this.cena.controls.target.copy(cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(5)));
    this.cena.controls.enabled = true;
    this.cena.controls.update();
    this.aoFim();
  }
}
