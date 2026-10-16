# INC-23 — Render cinematográfico no Blender (obra e voo das imagens)

## Contexto
O ADR-24 escolheu o tempo real no navegador e deixou a "opção C, exportar para o Blender" como passo seguinte.
O Blender 5.2.2 LTS agora está instalado em `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. A GPU é
uma Intel UHD 770, por isso o motor será o EEVEE.

Hoje só o desenho 3D de cada quadro sai do WebGL: `desenhista.desenhar(camera, i)`, em
`src/rendering/VideoRenderer.ts:229` e `:279`, e o mesmo desenho em `criarTrecho3D` (`src/app/vooNasImagens.ts:61`).
A apresentadora, a marca, as fotos, as legendas, o áudio e os codificadores vêm por cima, como camadas 2D. Todas as
entradas do 3D são funções puras do quadro: o dia (`obraNaCena`/`diaDoVoo`), cada elemento (`avaliar` + `parametros`),
a câmera (`poseNoTempo`/`poseDaCena`/`voo.quadro`), o sol (`aplicarSol`), as luminárias e as portas.

**Decisões do usuário (16/10):**
- pacote ZIP + `renderizar.bat`, sem servidor local;
- entram o vídeo da obra e o voo 3D do vídeo de imagens;
- duas qualidades, Rascunho e Final.

## Fluxo
1. Aba Vídeo (ou o assistente) → **"Pacote para o Blender"**. Baixa um ZIP com:
   - `cena.glb`: a obra, o entorno e os materiais;
   - `faixas.json`: por quadro, a câmera, o sol, a luz e a visibilidade, escala e opacidade de cada GUID. Só entram as
     mudanças, e os quadros sem 3D (cenas "fala" e "marca") ficam marcados;
   - `dani_blender.py`, `renderizar.bat` e `LEIA-ME.txt`.
2. Dois cliques no `renderizar.bat`. Ele acha o `blender.exe` e pergunta Rascunho ou Final. Depois roda
   `blender -b --factory-startup -P dani_blender.py -- <pasta> <qualidade>`.
3. O Blender grava PNGs só dos quadros com 3D (dá para retomar se parar) e depois monta `obra-blender.mp4` na linha do
   tempo inteira, com preto nos quadros sem 3D. É a mesma duração e fps do pacote.
4. No app, **"Usar o render do Blender"** recebe esse MP4 (o pacote leva uma assinatura em `faixas.json`). A geração
   troca `desenhista.desenhar` por desenhar o quadro do MP4. As camadas, o áudio e os codificadores não mudam.

## Etapas (um commit por etapa, com push para o origin)
0. **Viabilidade** (sem código no app). Rodar `blender -b` com EEVEE numa cena de teste e medir s/quadro em 1080×1920
   no Rascunho e no Final. Conferir no Windows o OCIO que estava quebrado no Fedora. Exportar um GLB do sobrado à mão e
   importar no Blender. Relatar os tempos antes de seguir.
1. **Exportação da cena** (`src/rendering/exportarBlender.ts`, novo):
   - `GLTFExporter` (three/examples) sobre as meshes de `Cena.carregar` e o `montarAmbiente`;
   - nomes = GUID e `extras` = tipo de material de `materialRealista()` (`aparencia.ts:26`);
   - as fotos PBR do Poly Haven vão embutidas;
   - o céu, a névoa e as luzes saem como parâmetros, não como objetos.
2. **Faixas por quadro** (`src/app/pacoteBlender.ts`, novo). Amostra os mesmos callbacks de `gerarVideoDaObra`
   (`src/app/videoDaObra.ts:38`) e de `criarTrecho3D`, sem desenhar nada. A conversão de eixos (Y para cima → Z para
   cima) fica num lugar só. Vitest: as faixas casam com o `cena.aplicar` em quadros sorteados e o JSON fica pequeno.
3. **Script do Blender** (`tools/blender/dani_blender.py` + `renderizar.bat`, empacotados via `?raw`):
   - importa o GLB e aplica keyframes de câmera (lente e FOV), sol, céu Nishita e luminárias;
   - visibilidade por `hide_render`, crescimento por escala no pivô da base e opacidade por alpha do Principled;
   - materiais refinados por tipo: vidro com transmissão e porcelanato com verniz;
   - Rascunho: 50 % da resolução e 16 amostras. Final: 100 % da resolução, 64 amostras e raytracing do EEVEE;
   - montagem do MP4 pelo sequenciador (VSE), H.264 de alta taxa.
4. **Uso do render no app**:
   - leitor de quadros reusando `abrirQuadrosDoArquivo` (`src/rendering/apresentadora.ts:~121`, mediabunny com fallback
     `<video>`);
   - substituto do desenhista em `VideoRenderer.ts` e em `criarTrecho3D`;
   - checagem da assinatura, da duração e do fps, com erro amigável (`ErroAmigavel`);
   - botões nos painéis (`PainelVideo.tsx`, `PassoGerar.tsx`, `GerarImagens.tsx`).
5. **Voo das imagens**: o mesmo pacote para o trecho 3D do vídeo de imagens ("volta" e "porta").
6. **ADR-43, README e relatório**: o fluxo, os tempos medidos e os limites (portas, pessoas e árvores procedurais;
   bloom e grão ficam a cargo do Blender).

## Verificação
- `$env:TZ='America/Fortaleza'; npx vitest run` e `npm run build` (olhar `error|built in`).
- Fim a fim com o sobrado de exemplo:
  1. gerar o pacote no Edge (preview :4174);
  2. renderizar o Rascunho com o `.bat`;
  3. carregar o MP4 e gerar o vídeo final;
  4. extrair quadros com mediabunny (não `<video>`) e com o ffmpeg `tile`;
  5. comparar a câmera e as fases da obra com o vídeo WebGL nos mesmos tempos e conferir a apresentadora e o áudio
     por cima.
- O mesmo roteiro no voo do vídeo de imagens. Um Final curto (~5 s) para medir o tempo.

## Fora do escopo
- O Fedora (o `.bat` é só do Windows; o `.py` serve aos dois);
- o Cycles;
- a biblioteca de móveis CC0;
- o congelamento do Firefox (adiado).

## Etapa 0: viabilidade (medida em 16/10/2026)
O Blender 5.2.2 LTS roda com `-b --factory-startup` no Windows, com EEVEE na Intel UHD 770. O OCIO está bom (AgX), e
o céu Nishita (`MULTIPLE_SCATTERING`) funciona. Os tempos foram medidos em 1080×1920, numa cena de teste com 40 caixas,
sol e céu. O primeiro quadro leva ~25 s a mais para compilar os shaders.

| Configuração | s/quadro | 30 s a 30 fps (900 quadros) |
|---|---|---|
| Rascunho: 50 %, 16 amostras, sem raytracing | 2,6 | ~40 min |
| 100 %, 16 amostras, com raytracing | 12 | ~3 h |
| 100 %, 32 amostras, sem raytracing | 11 | ~2,8 h |
| 100 %, 32 amostras, com raytracing | 24 | ~6 h |
| 100 %, 64 amostras, com raytracing | 36 | ~9 h |

A cena real (IFC, PBR e entorno) deve ser mais pesada. A importação do GLB do sobrado fica para a etapa 1.
