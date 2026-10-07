# Prompt — Incremento 5: revelação progressiva e vídeo para compartilhar

Você vai construir o quinto incremento do **Construction 4D Studio**, a partir do retorno de uso:

> "Preciso que a construção vá sendo revelada aos poucos e não como está, cada fase aparece de uma vez no final do prazo. Preciso que forneça opção de formato de download do vídeo, apenas mp4 é insuficiente. O WhatsApp não aceitou o formato mp4."

PWA (§46) foi descartado pelo usuário.

## Decisões

**ADR-16 — Vídeo para compartilhar.**
- **MP4 para WhatsApp e celulares** (recomendado e padrão):
  - H.264 perfil Baseline, 4:2:0 e no máximo 1280 px no lado maior (720p), a resolução que o WhatsApp mantém;
  - taxa fixa e `moov` no início (pronto para streaming);
  - codificado em WebAssembly (minih264, domínio público, e libmp4v2, MPL 1.1, pelo pacote `h264-mp4-encoder` 1.0.12, MIT), servido pelo próprio app, para o arquivo sair igual em qualquer navegador, com ou sem codificador H.264 nativo;
  - sem áudio: o WhatsApp aceita vídeo sem trilha de áudio.
- **MP4 alta qualidade (1080p)** pelo WebCodecs, com perfil Main fixado (`avc1.4d0028`), quando o navegador tiver H.264.
- **WebM** (VP9 ou VP8), **WebM em tempo real** (sem WebCodecs), **GIF animado** (gifenc, MIT; 480 px, 10 fps, para mensageiros e apresentações) e **quadros PNG em ZIP**.
- Depois de gerar: botão **Compartilhar** (Web Share API com arquivo) quando o aparelho permitir, que leva direto ao WhatsApp no celular.

**ADR-17 — Revelação progressiva como padrão.**
- Novo modo de animação **Progressivo**, padrão em projetos novos:
  - cada tarefa revela os seus elementos um a um, de baixo para cima e da frente para o fundo, ao longo de toda a duração;
  - cada elemento se forma durante a sua vez, conforme o tipo:
    - paredes, pilares, escadas e estacas sobem a partir da base;
    - lajes, vigas, baldrames, pisos e telhados avançam no maior eixo horizontal;
    - portas, janelas, louças, instalações, terreno e paisagismo aparecem aos poucos (fade).
- Tarefa com um só elemento (ex.: o contrapiso) se forma ao longo da tarefa inteira.
- Os modos anteriores continuam disponíveis.

## Escopo

1. Modo Progressivo (função pura em `fourd/animacao.ts`; escala horizontal com pivô na borda mínima do elemento na `Cena`). Padrão no estado inicial; projetos salvos mantêm o modo gravado.
2. Saídas de vídeo do ADR-16 no painel Vídeo, com descrição de cada uma (codec, resolução, para que serve), o MP4 para WhatsApp como primeira opção e uma dica explicando por que é o recomendado.
3. Botão Compartilhar.

## Testes

- Vitest: parâmetros do modo Progressivo (vertical, horizontal e fade; fila; tarefa de um elemento).
- Playwright:
  - no meio da alvenaria, em modo Progressivo, parte das paredes já existe, parte está subindo e parte ainda não começou;
  - "MP4 para WhatsApp" gera um arquivo que o `ffprobe` confirma como H.264 Baseline (ou Constrained Baseline), yuv420p, 720 × 1280 no vertical, com a duração pedida;
  - o GIF é GIF de verdade, com o número de quadros esperado;
  - as opções do painel incluem MP4 para WhatsApp, GIF e PNG em qualquer navegador.

## Critério de aceitação

`npm run tudo` verde; deploy do Pages verde; vídeo vertical do WhatsApp gerado e conferido.
