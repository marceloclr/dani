# Especificação — Construction 4D Studio

Versão enxuta do [prompt mestre](../prompt-mestre-original.md). Cada requisito leva uma etiqueta de escopo, e as decisões técnicas estão nos [ADRs](adrs.md). O número entre parênteses (§n) remete à seção do prompt original.

## Etiquetas

| Etiqueta | Significado |
|----------|-------------|
| `[INC-1]` | Incremento 1: IFC → 3D → cronograma → mapeamento → timeline → simulação 4D |
| `[INC-2]` | Incremento 2: câmeras e vídeo |
| `[INC-3]` | Incremento 3: persistência, XLSX e modo paramétrico |
| `[INC-4]` | Incremento 4: acompanhamento da obra (real, fotos, planta, relatório) e modelos de arquivo |
| `[INC-5]` | Incremento 5: revelação progressiva e vídeo para compartilhar |
| `[INC-6]` | Incremento 6: cronograma estimado, tarefas por pavimento e WhatsApp no computador |
| `[INC-7]` | Incremento 7: aparência realista e segundo modelo de teste |
| `[FUTURO]` | Não implementar. A arquitetura só não deve impedir |
| `[SEMPRE]` | Princípio válido em todos os incrementos |

Regra: só aparece na interface o que tem a etiqueta do incremento atual ou de um anterior. Nada de botão "em breve" (§49).

## 1. Princípios `[SEMPRE]`

- Funcionalidade real antes de aparência. Todo controle visível tem handler e efeito (§1, §49, §50).
- Três modos distintos: **BIM** (IFC, geometria real), **Paramétrico** (geometria simplificada a partir de parâmetros) e **Visual** (imagens só como referência). Nunca inventar precisão (§3, §29).
- 3D = geometria; 4D = geometria + tempo. A geometria é imutável. Só o estado construtivo muda (§62, §64).
- Processamento local. Nenhum arquivo do usuário sai do dispositivo sem consentimento explícito (§43).
- App estático, sem backend, publicável no GitHub Pages (§45).
- Erros em linguagem simples, com detalhes técnicos recolhidos em "Detalhes técnicos" (§40).
- Dados de demonstração sempre identificados com o selo DEMONSTRAÇÃO (§55, §56).
- Bibliotecas permissivas ou MPL-2.0, com versão fixa (ADR-09).

## 2. Modelo de dados `[INC-1]`

Substitui o §8 e o §9.

```ts
interface Projeto {
  id: string; nome: string; criadoEm: string; atualizadoEm: string;
  modelo: { tipo: 'IFC' | 'PARAMETRICO'; arquivo?: string; tamanho?: number };
  cronograma: { inicio: string /* ISO dd local */; tarefas: Tarefa[] };
  regras: MappingRule[];            // ADR-02
  excecoes: MappingOverride[];      // ADR-02
  politicaSemTarefa: 'fantasma' | 'oculto' | 'visivel';
  demo: boolean;
}

interface Tarefa {
  id: string; nome: string; categoria: string;
  inicio: number; fim: number;      // índice de dia, fim inclusivo (ADR-05)
  progresso?: number;               // informativo; ignorado pela simulação planejada
}
```

## 3. Requisitos

### Modelo BIM
- `[INC-1]` Carregar `.ifc`, validar e mostrar progresso sem travar a interface (§10).
- `[INC-1]` Preservar por elemento: GUID, classe IFC, `PredefinedType`, nome, pavimento, material e caixa envolvente (§11).
- `[INC-1]` Enquadrar a câmera automaticamente e navegar com orbit, pan, zoom, seleção, foco e reset (§10, §19).
- `[INC-1]` Botões CASA INTEIRA, OCULTAR, MOSTRAR e vistas superior, frontal, lateral e isométrica (§19).
- `[FUTURO]` Modelos grandes: Fragments, LOD, carregamento progressivo (§36).

### Cronograma
- `[INC-1]` Importar CSV com detecção de separador, formato de data, codificação e BOM (§12, ADR-05).
- `[INC-1]` Importar JSON (§12).
- `[INC-1]` Validar: datas inválidas, fim antes do início, IDs ausentes ou duplicados, tarefas sem elementos, elementos sem tarefa (§41).
- `[INC-3]` Importar XLSX (§12).
- `[INC-3]` Criar e editar tarefas manualmente (§12).
- `[INC-6]` Gerar cronograma estimado, sempre identificado como estimativa (§13; ADR-18), com tarefas por pavimento (ADR-19).
- `[INC-8]` Dias úteis na estimativa, ao lado dos dias corridos, pelo calendário oficial do Ceará e do município da obra (Região Metropolitana de Fortaleza), com os feriados de 2026 a 2030 no banco local (ADR-22).
- `[FUTURO]` Predecessoras, agendamento em dias úteis, MS Project XML, `IfcWorkSchedule`/`IfcTask`.

### Mapeamento 4D
- `[INC-1]` Regras automáticas por classe, `PredefinedType` e pavimento, já aplicadas ao carregar (ADR-02; antes era §42, "posteriormente").
- `[INC-1]` Exceções manuais por seleção no modelo 3D: incluir ou excluir elemento de uma tarefa (§14).
- `[INC-1]` Painel por tarefa: quantos elementos, quais regras e quais exceções (§14).
- `[INC-1]` Ações `construct`, `finish` e `install`, com mudança de aparência para acabamentos (ADR-02).

### Simulação e timeline
- `[INC-1]` Função pura `avaliar(dia)` (ADR-03) com estados oculto, em execução, concluído e fantasma (§15).
- `[INC-1]` Modo de animação padrão: **aparecimento** (§16.1).
- `[INC-1]` Timeline inferior com barras por tarefa, cursor arrastável, data atual, ir ao início e ao fim, play, pausa e velocidades 0,25× a 8× (§17).
- `[INC-1]` Campo DATA DA SIMULAÇÃO que altera o estado na hora (§18).
- `[INC-2]` Modos fade-in, crescimento vertical e por fases (§16.2–16.4).

### Câmeras e vídeo
- `[INC-2]` Presets: externa, isométrica, superior, frontal, lateral e órbita (§20).
- `[INC-2]` Keyframes de câmera com interpolação suave (§21).
- `[INC-2]` Formatos 9:16, 16:9 e 1:1; 24 ou 30 fps; 15 a 120 s; só as combinações aceitas por `isConfigSupported` (§22, ADR-04).
- `[INC-2]` Conversão linear de dias da obra para segundos de vídeo (§23).
- `[INC-2]` Geração com progresso (percentual, quadro, tempo estimado) e cancelamento (§24).
- `[INC-2]` Fallback MediaRecorder → PNGs em ZIP, com aviso honesto sobre o formato produzido (§25, §26).

### Persistência e projeto
- `[INC-3]` IndexedDB: novo, abrir, duplicar, exportar, importar e excluir (§37, ADR-06).
- `[INC-3]` Arquivo `.4dstudio` (ZIP com o IFC embutido) (§38).
- `[INC-3]` Exportar cronograma e mapeamento em JSON (§39).

### Modo paramétrico
- `[INC-3]` Casa térrea a partir de terreno, área, pé-direito e tipo de cobertura, com os componentes do §28 (§27, §28).

### Futuro
- `[INC-4]` Planta PDF/PNG/JPG como referência sobreposta (§29).
- `[INC-4]` Fotos da obra na timeline e na simulação; planejado × real com datas reais, avanço físico e modo Comparar (§30, §31, §58; ADR-13, ADR-14).
- `[INC-4]` Relatório PDF (§59; ADR-15) e modelos de arquivo para download, preenchidos.
- `[INC-7]` Aparência realista na viewport, no vídeo e no relatório (ADR-21); sobrado IFC de exemplo; tema claro como padrão.
- `[INC-6]` Envio pelo WhatsApp no computador sem Web Share de arquivos (ADR-20).
- `[INC-5]` Revelação progressiva como padrão e vídeo para compartilhar (MP4 para WhatsApp, GIF, Compartilhar) (ADR-16, ADR-17).
- `[FUTURO]` Multiusuário (§60). PWA (§46) foi descartado pelo usuário em 2026-10-07.
- `[FUTURO]` IA (§57). Conflito registrado: numa aplicação estática, IA implica chave de API no cliente ou envio de arquivos a terceiros, o que colide com o §43. Exigirá consentimento explícito.

## 4. Interface

- `[INC-1]` Tela inicial com 3 passos: Projeto, Cronograma e Simulação, mais DEMONSTRAÇÃO (§32).
- `[INC-1]` Após carregar: viewport 3D protagonista e timeline embaixo (§32, §33).
- `[SEMPRE]` Visual técnico, sem excesso de cards ou gradientes (§33), seguindo o design system **Papel e Tinta** (https://github.com/marceloclr/design-system): tokens de `tokens.css`, IBM Plex, temas claro e escuro, dicas com fórmula em todo valor calculado. Estados construtivos na interface: `--latao` em execução, `--musgo` concluído, `--tinta-3` translúcido para fantasma.
- `[SEMPRE]` Desktop completo; tablet adaptado; celular com visualização e controles essenciais (§34).

## 5. Critérios de aceitação

| Incremento | Critério |
|------------|----------|
| INC-1 | Carregar o IFC de demonstração → modelo em 3D → importar CSV → as regras vinculam elementos sem nenhum clique → PLAY constrói a casa na ordem fundação → estrutura → alvenaria → cobertura → esquadrias → acabamento → arrastar a timeline altera a geometria → corrigir uma exceção manual muda a simulação |
| INC-2 | Selecionar câmera muda a vista → gerar vídeo 16:9 de 30 s produz arquivo reproduzível → em navegador sem WebCodecs, o fallback produz WebM ou ZIP de PNGs e avisa qual |
| INC-3 | Fechar e reabrir o navegador mantém o projeto → exportar `.4dstudio` e importar noutro navegador reproduz o mesmo resultado → modo paramétrico gera uma casa e roda a simulação |

O teste de ponta a ponta do §67 vale ao final do INC-2.

**Situação em 2026-10-07:** INC-1 a INC-6 implementados e aceitos pelos testes (`npm run tudo`: 80 testes Vitest e 19 Playwright, incluindo o §67 com vídeo WebM real conferido pelo ffprobe, persistência ao recarregar, `.4dstudio` de ida e volta, sobrado paramétrico com vídeo, XLSX, modo Comparar com o exemplo, fotos, planta PNG e PDF, relatório PDF conferido pelo pdf.js download de cada modelo, revelação progressiva da alvenaria, MP4 para WhatsApp conferido pelo ffprobe e GIF). Publicado em https://marceloclr.github.io/dani/.
