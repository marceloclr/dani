PROMPT MESTRE — GERADOR WEB 4D DE EVOLUÇÃO DE OBRAS RESIDENCIAIS

1. PAPEL DA IA

Você é um arquiteto de software, engenheiro BIM, desenvolvedor WebGL/Three.js e especialista em visualização 4D de construção civil.

Sua tarefa é projetar e implementar uma aplicação web funcional capaz de transformar dados de uma residência e seu cronograma de execução em uma simulação 4D da construção, com possibilidade de gerar um vídeo da evolução da obra.

Você deve priorizar:

1. funcionalidade real;
2. arquitetura tecnicamente correta;
3. processamento local no navegador;
4. utilização de tecnologias open-source;
5. compatibilidade com arquivos BIM;
6. desempenho;
7. simplicidade de uso;
8. possibilidade de evolução futura.

Não entregue apenas uma interface visual.

Toda função, botão, controle, upload ou opção apresentada na interface deve estar efetivamente implementada.

---

2. OBJETIVO DO SISTEMA

Criar uma aplicação web denominada provisoriamente:

Construction 4D Studio

O sistema deverá permitir que um usuário sem conhecimento avançado de BIM consiga:

1. carregar um modelo de uma residência;
2. carregar um cronograma;
3. associar elementos do modelo às etapas da obra;
4. visualizar a residência em 3D;
5. visualizar a evolução temporal da construção;
6. controlar a velocidade da simulação;
7. selecionar diferentes datas;
8. selecionar diferentes câmeras;
9. visualizar o cronograma;
10. configurar o vídeo;
11. renderizar a evolução da obra;
12. gerar um arquivo de vídeo sempre que tecnicamente possível.

O sistema deve ser pensado inicialmente para obras residenciais, mas a arquitetura deve permitir posteriormente projetos maiores.

---

3. PRINCÍPIO FUNDAMENTAL

O sistema deve diferenciar claramente:

MODO BIM

Quando existir um arquivo IFC, utilizar a geometria real do projeto.

MODO PARAMÉTRICO

Quando não existir IFC, permitir a construção de uma representação 3D simplificada baseada em dados, planta e parâmetros.

MODO VISUAL

Quando existirem apenas imagens/fotos, utilizá-las como referência visual ou documentação, mas não alegar que foi reconstruído um BIM preciso a partir delas.

Nunca inventar precisão de engenharia.

---

4. RESULTADO ESPERADO

O resultado final deve ser uma aplicação web que consiga produzir uma sequência semelhante a:

TERRENO
   ↓
FUNDAÇÃO
   ↓
ESTRUTURA
   ↓
ALVENARIA
   ↓
LAJE
   ↓
COBERTURA
   ↓
INSTALAÇÕES
   ↓
ESQUADRIAS
   ↓
REVESTIMENTOS
   ↓
PINTURA
   ↓
ACABAMENTOS
   ↓
PAISAGISMO
   ↓
CASA CONCLUÍDA

A animação deve mostrar os elementos aparecendo progressivamente conforme as datas do cronograma.

---

5. TECNOLOGIAS PREFERENCIAIS

Utilize preferencialmente:

- TypeScript
- React
- Vite
- Three.js
- web-ifc
- That Open Components
- Zustand
- IndexedDB
- date-fns
- Tailwind CSS ou CSS modular
- Web Workers
- WebCodecs
- MP4/WebM muxer compatível com navegador

Para processamento BIM, priorizar:

web-ifc
That Open
Three.js

Não utilizar software proprietário como requisito.

Não exigir:

- Revit;
- Navisworks;
- Lumion;
- Twinmotion;
- AutoCAD;
- SketchUp;
- licença comercial.

---

6. ARQUITETURA GERAL

A arquitetura deve seguir:

                  USUÁRIO
                     │
          ┌──────────┴──────────┐
          │                     │
        MODELO                DADOS
          │                     │
       IFC/PDF/             CSV/XLSX/
       IMAGENS              JSON
          │                     │
          └──────────┬──────────┘
                     ↓
               IMPORTAÇÃO
                     ↓
              NORMALIZAÇÃO
                     ↓
               MODELO INTERNO
                     ↓
             ┌───────┴────────┐
             │                │
         GEOMETRIA         CRONOGRAMA
             │                │
             └───────┬────────┘
                     ↓
                 MOTOR 4D
                     ↓
                 TIMELINE
                     ↓
               THREE.JS
                     ↓
               RENDERIZAÇÃO
                     ↓
              EXPORTAÇÃO VÍDEO

---

7. ESTRUTURA DE PROJETO

Não concentrar toda a aplicação em um único arquivo gigante.

Criar estrutura organizada semelhante a:

src/
├── app/
├── components/
├── bim/
│   ├── IfcLoader
│   ├── IfcParser
│   ├── ModelManager
│   └── ElementMetadata
├── fourd/
│   ├── Timeline
│   ├── SimulationEngine
│   ├── TaskMapper
│   └── ConstructionPhases
├── rendering/
│   ├── SceneManager
│   ├── CameraManager
│   ├── Lighting
│   └── VideoRenderer
├── importers/
│   ├── CsvImporter
│   ├── ExcelImporter
│   ├── JsonImporter
│   └── ImageImporter
├── export/
│   ├── VideoEncoder
│   ├── FrameExporter
│   └── ProjectExporter
├── storage/
│   └── IndexedDb
├── state/
│   └── projectStore
├── types/
└── utils/

Se houver uma razão técnica para alterar essa estrutura, explique a razão e mantenha a separação de responsabilidades.

---

8. MODELO DE DADOS DO PROJETO

Criar uma estrutura de projeto semelhante a:

{
  "project": {
    "id": "uuid",
    "name": "Residência Exemplo",
    "createdAt": "",
    "updatedAt": ""
  },
  "model": {
    "type": "IFC",
    "fileName": "",
    "fileSize": 0
  },
  "schedule": {
    "startDate": "",
    "endDate": "",
    "tasks": []
  },
  "mappings": [],
  "camera": {},
  "video": {},
  "settings": {}
}

---

9. MODELO DE TAREFA

Cada atividade do cronograma deve suportar:

{
  "id": "FOUND-001",
  "name": "Fundação",
  "category": "foundation",
  "startDate": "2026-01-01",
  "endDate": "2026-01-15",
  "progress": 0,
  "elements": []
}

---

10. IMPORTAÇÃO IFC

O sistema deve permitir:

[ CARREGAR IFC ]

Aceitar:

.ifc

Após o carregamento:

1. validar arquivo;
2. informar progresso;
3. processar IFC;
4. criar geometria;
5. preservar GUID;
6. identificar categorias;
7. criar metadados;
8. inserir no Three.js;
9. enquadrar automaticamente a câmera;
10. permitir navegação.

Não travar a interface durante processamento pesado.

Usar Web Worker quando apropriado.

---

11. ELEMENTOS BIM

Sempre que possível, identificar:

- paredes;
- portas;
- janelas;
- lajes;
- pisos;
- telhados;
- pilares;
- vigas;
- fundações;
- escadas;
- instalações;
- elementos estruturais;
- elementos arquitetônicos.

Preservar:

IFC GUID
IFC Type
Category
Name
Level
Storey
Material
Bounding Box

---

12. CRONOGRAMA

Permitir importar:

- CSV;
- JSON;
- XLSX, quando tecnicamente possível;
- manualmente.

CSV mínimo:

id,nome,inicio,fim,categoria
1,Fundação,2026-01-01,2026-01-15,fundacao
2,Estrutura,2026-01-16,2026-02-15,estrutura
3,Alvenaria,2026-02-16,2026-03-20,alvenaria

---

13. CRONOGRAMA AUTOMÁTICO

Criar futuramente um modo:

[ GERAR CRONOGRAMA ]

Entrada:

Área da residência
Número de pavimentos
Tipo de estrutura
Prazo total

O sistema poderá sugerir etapas.

Exemplo:

Fundação
Estrutura
Alvenaria
Cobertura
Instalações
Revestimento
Pintura
Acabamento

A sugestão deve ser claramente identificada como estimativa.

Não apresentar cronograma estimado como cronograma executivo real.

---

14. MAPEAMENTO 4D

Cada tarefa deverá poder ser associada a elementos BIM.

Exemplo:

Fundação
 ├── elemento GUID 123
 ├── elemento GUID 456
 └── elemento GUID 789

Criar interface:

TAREFA
Fundação

ELEMENTOS ASSOCIADOS
[ 3 elementos ]

[ ADICIONAR ELEMENTOS ]

Permitir seleção diretamente no modelo 3D.

---

15. MOTOR DE SIMULAÇÃO 4D

Implementar a lógica:

if currentDate < task.startDate:
    element.hidden = true

if task.startDate <= currentDate <= task.endDate:
    element.visible = true
    element.state = "construction"

if currentDate > task.endDate:
    element.visible = true
    element.state = "completed"

Entretanto, o sistema deve permitir posteriormente outros comportamentos:

- fade-in;
- crescimento vertical;
- aparecimento por partes;
- construção por pavimento;
- construção por categoria.

---

16. MODOS DE ANIMAÇÃO

Implementar pelo menos:

16.1 Aparecimento

Elemento simplesmente surge.

16.2 Construção progressiva

Elemento aparece progressivamente.

16.3 Crescimento

Paredes e pilares podem surgir verticalmente.

16.4 Por fases

Cada grupo de elementos aparece em sequência.

O modo padrão deve ser o mais estável e previsível.

---

17. TIMELINE

Criar timeline visual na parte inferior.

Deve mostrar:

- data inicial;
- data final;
- data atual;
- atividades;
- duração;
- progresso.

Controles:

|◀
▶
▶▶
■
|▶

Também:

0.25x
0.5x
1x
2x
4x
8x

Permitir arrastar o cursor temporal.

---

18. CONTROLE POR DATA

Adicionar:

DATA DA SIMULAÇÃO

[ 15/03/2026 ]

Alterar a data deve imediatamente alterar o estado da construção.

---

19. VISTA 3D

A viewport deve oferecer:

- orbit;
- pan;
- zoom;
- seleção;
- foco;
- reset de câmera;
- visão superior;
- visão frontal;
- visão lateral;
- isométrica.

Adicionar:

[ CASA INTEIRA ]
[ SELECIONAR ]
[ OCULTAR ]
[ MOSTRAR ]

---

20. CÂMERAS AUTOMÁTICAS

Criar presets:

EXTERNA
ISOMÉTRICA
SUPERIOR
FRONTAL
LATERAL
ÓRBITA

Permitir selecionar a câmera que será utilizada no vídeo.

---

21. ANIMAÇÃO DE CÂMERA

Permitir:

Câmera inicial
      ↓
Câmera final
      ↓
Interpolação

Criar movimento suave.

Exemplo:

0s → câmera frontal
10s → câmera isométrica
20s → câmera lateral
30s → vista superior

---

22. VÍDEO

O usuário deve poder escolher:

Vertical

1080 × 1920
9:16

Horizontal

1920 × 1080
16:9

Quadrado

1080 × 1080
1:1

FPS:

24
30

Duração:

15 s
30 s
60 s
90 s
120 s

---

23. RELAÇÃO ENTRE TEMPO DA OBRA E TEMPO DO VÍDEO

Exemplo:

Obra:

180 dias

Vídeo:

30 segundos

Então:

180 dias → 30 segundos

O motor deve interpolar automaticamente.

---

24. RENDERIZAÇÃO DO VÍDEO

Priorizar:

Three.js Canvas
      ↓
VideoFrame
      ↓
WebCodecs VideoEncoder
      ↓
Muxer
      ↓
arquivo final

Executar renderização pesada em Web Worker quando possível.

Mostrar progresso:

GERANDO VÍDEO

██████████████░░░░░ 73%

Frame 438 / 600

Tempo estimado: ...

Nunca congelar a interface sem informar o usuário.

---

25. COMPATIBILIDADE

Antes de gerar vídeo:

Verificar suporte do navegador

Se WebCodecs estiver disponível:

GERAÇÃO DIRETA

Se não estiver:

FALLBACK

Fallback mínimo:

exportar frames

Não criar botão "Gerar MP4" que não faça nada.

---

26. WEBM / MP4

Se MP4 não puder ser produzido diretamente de forma confiável no navegador, permitir:

WebM

como primeiro formato.

O sistema deve informar claramente:

«"Seu navegador não oferece suporte à codificação MP4 neste modo. O sistema produzirá WebM ou imagens sequenciais."»

Nunca fingir que um arquivo MP4 foi criado.

---

27. MODO SEM IFC

Criar uma alternativa para projetos sem BIM.

O usuário poderá informar:

Largura do terreno
Comprimento do terreno
Área construída
Número de pavimentos
Altura do pé-direito
Tipo de cobertura

O sistema poderá gerar um modelo paramétrico simplificado.

---

28. COMPONENTES PARAMÉTRICOS

Criar componentes básicos:

Terreno
Fundação
Pilar
Viga
Parede
Laje
Porta
Janela
Escada
Telhado
Piso

Não tentar substituir um software BIM completo.

O objetivo é gerar uma representação visual para animação 4D.

---

29. IMPORTAÇÃO DE PLANTA

Permitir futuramente:

PDF
PNG
JPG

A planta pode ser utilizada como:

- referência;
- textura;
- guia;
- imagem sobreposta.

Não afirmar que uma planta raster foi convertida automaticamente em BIM preciso sem efetivamente realizar essa conversão.

---

30. FOTOS DA OBRA

Permitir anexar fotos:

Foto
Data
Local
Descrição

Exemplo:

2026-03-15
Fundação

As fotos devem poder aparecer durante a timeline.

---

31. COMPARAÇÃO PLANEJADO × REAL

Criar arquitetura para futura funcionalidade:

PLANEJADO

        ×

REAL

A foto real pode ser exibida em determinado ponto da timeline.

---

32. INTERFACE PRINCIPAL

A interface inicial deve ser extremamente simples.

Exemplo:

┌─────────────────────────────────────────────┐
│ CONSTRUCTION 4D STUDIO                      │
├─────────────────────────────────────────────┤
│                                             │
│ 1. PROJETO                                  │
│                                             │
│ [ CARREGAR IFC ]                            │
│ [ CRIAR MODELO PARAMÉTRICO ]                │
│                                             │
│ 2. CRONOGRAMA                               │
│                                             │
│ [ CARREGAR CSV ]                            │
│ [ CRIAR CRONOGRAMA ]                        │
│                                             │
│ 3. SIMULAÇÃO                                │
│                                             │
│ [ ABRIR SIMULAÇÃO 4D ]                      │
│                                             │
└─────────────────────────────────────────────┘

Após carregamento:

┌─────────────────────────────────────────────┐
│ MODELO 3D                                   │
│                                             │
│                                             │
│                 CASA                        │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│ TIMELINE                                    │
│                                             │
│ Fundação █████                              │
│ Estrutura     ███████                       │
│ Alvenaria           ███████                 │
│                                             │
│ ◀   ▶   ■    1x                            │
└─────────────────────────────────────────────┘

---

33. DESIGN

O visual deve ser:

- profissional;
- limpo;
- técnico;
- moderno;
- responsivo;
- adequado para engenharia e arquitetura.

Não exagerar em cards, gradientes ou dashboards.

A área 3D deve ser a protagonista.

---

34. RESPONSIVIDADE

Priorizar:

Desktop

Experiência completa.

Tablet

Experiência completa adaptada.

Smartphone

Visualização e controles essenciais.

A geração de vídeo deve avisar se o dispositivo não possui capacidade suficiente.

---

35. PERFORMANCE

O sistema deve:

- evitar reconstruir toda a cena a cada frame;
- reutilizar geometria;
- utilizar instancing quando apropriado;
- evitar chamadas desnecessárias;
- descarregar recursos não utilizados;
- usar Web Workers;
- evitar bloquear o thread principal;
- mostrar progresso.

---

36. MODELOS GRANDES

Para IFCs grandes:

- carregamento progressivo;
- processamento assíncrono;
- cache;
- LOD quando possível;
- descarregamento de objetos;
- controle de memória.

Nunca assumir que todo IFC será pequeno.

---

37. INDEXEDDB

Persistir localmente:

Projetos
Modelos
Cronogramas
Mapeamentos
Configurações
Câmeras

Permitir:

NOVO PROJETO
ABRIR PROJETO
DUPLICAR
EXPORTAR
IMPORTAR
EXCLUIR

---

38. FORMATO DE PROJETO

Criar um formato próprio:

.4dstudio

Internamente:

ZIP
├── project.json
├── schedule.json
├── mappings.json
├── settings.json
└── assets/

Se a implementação inicial não suportar ZIP, utilizar JSON exportável.

---

39. EXPORTAÇÃO

Permitir exportar:

Projeto
Cronograma
Mapeamentos
Frames
Vídeo

---

40. ERROS

Todos os erros devem ser apresentados ao usuário de maneira compreensível.

Exemplo ruim:

UnhandledPromiseRejection

Exemplo correto:

Não foi possível carregar o modelo IFC.

Verifique se o arquivo está íntegro e tente novamente.

Disponibilizar detalhes técnicos somente em:

[ DETALHES TÉCNICOS ]

---

41. VALIDAÇÃO DO CRONOGRAMA

Detectar:

- datas inválidas;
- fim anterior ao início;
- tarefas duplicadas;
- IDs ausentes;
- elementos não associados;
- atividades sem elementos.

Mostrar:

⚠ 3 atividades não possuem elementos associados.

---

42. MAPEAMENTO AUTOMÁTICO

Criar posteriormente heurísticas:

Fundação
→ IfcFooting
→ IfcPile
→ IfcSlab

Estrutura
→ IfcColumn
→ IfcBeam

Alvenaria
→ IfcWall

Cobertura
→ IfcRoof

O sistema deve permitir correção manual.

---

43. SEGURANÇA E PRIVACIDADE

Por padrão:

«Os arquivos do usuário devem permanecer no dispositivo.»

Não enviar:

- IFC;
- fotos;
- plantas;
- cronogramas;

para servidores externos sem consentimento explícito.

---

44. LICENCIAMENTO

Priorizar bibliotecas:

- MIT;
- Apache-2.0;
- BSD;
- ou outras licenças permissivas compatíveis.

Antes de incorporar qualquer biblioteca, verificar sua licença.

Não copiar código proprietário.

---

45. DEPLOY

O sistema deve ser capaz de funcionar como aplicação estática.

Priorizar:

GitHub Pages
Cloudflare Pages
Netlify
Vercel

Não exigir backend para o MVP.

---

46. OFFLINE

Sempre que possível, permitir funcionamento offline depois que os assets necessários forem carregados.

PWA é desejável, mas não deve atrasar o MVP.

---

47. TESTES

Criar testes para:

Cronograma

Data inicial
Data final
Conversão tempo → vídeo

Mapeamento

Task → elementos

Simulação

Antes da tarefa → oculto
Durante → construção
Depois → concluído

IFC

Verificar carregamento de arquivo válido e rejeição de arquivo inválido.

Exportação

Verificar geração de arquivo quando suportada.

---

48. CRITÉRIOS DE ACEITAÇÃO DO MVP

O MVP somente será considerado concluído quando for capaz de executar:

Teste 1

Carregar um IFC.

Resultado:

Modelo aparece em 3D.

Teste 2

Carregar CSV.

Resultado:

Cronograma aparece.

Teste 3

Associar tarefa a elementos.

Resultado:

Elementos ficam vinculados.

Teste 4

Pressionar PLAY.

Resultado:

A casa é construída progressivamente.

Teste 5

Mover timeline.

Resultado:

A geometria acompanha a data.

Teste 6

Selecionar câmera.

Resultado:

Câmera muda.

Teste 7

Gerar vídeo em navegador compatível.

Resultado:

Arquivo de vídeo é realmente criado.

Teste 8

Navegador incompatível.

Resultado:

Sistema oferece fallback funcional.

---

49. PROIBIÇÕES

É PROIBIDO:

- criar botões falsos;
- criar funcionalidades "em breve" sem necessidade;
- usar dados fictícios como se fossem reais;
- criar apenas mockups;
- simular geração de vídeo sem gerar arquivo;
- dizer que um vídeo foi criado quando não foi;
- esconder erros;
- exigir software proprietário;
- enviar arquivos para servidores sem informar;
- implementar apenas a aparência do 4D.

---

50. REGRA CONTRA "PARECER PRONTO"

A aplicação deve ser considerada incompleta se:

A interface existe
MAS
a funcionalidade não funciona.

Priorizar:

FUNCIONALIDADE > DESIGN

---

51. ORDEM DE IMPLEMENTAÇÃO

Não tentar implementar tudo simultaneamente.

Executar nesta ordem:

FASE 1

Projeto React + TypeScript + Three.js.

FASE 2

Viewer IFC.

FASE 3

Importação CSV.

FASE 4

Modelo interno de tarefas.

FASE 5

Mapeamento IFC ↔ tarefas.

FASE 6

Motor 4D.

FASE 7

Timeline.

FASE 8

Câmeras.

FASE 9

Renderização de frames.

FASE 10

WebCodecs.

FASE 11

Exportação.

FASE 12

IndexedDB.

FASE 13

Modo paramétrico.

FASE 14

Fotos e documentos.

FASE 15

Recursos avançados.

---

52. ESTRATÉGIA DE DESENVOLVIMENTO

Ao implementar:

1. crie primeiro uma versão funcional mínima;
2. teste;
3. corrija;
4. somente depois adicione funcionalidades;
5. não substitua código funcional por abstrações desnecessárias;
6. não reescreva o projeto inteiro sem necessidade.

---

53. ENTREGA

Ao finalizar, entregar:

package.json
src/
public/
README.md

e todos os arquivos necessários.

O README deve explicar:

1. como instalar;
2. como executar;
3. como fazer build;
4. como publicar;
5. formatos suportados;
6. limitações;
7. navegadores recomendados.

---

54. README DEVE CONTER

Exemplo:

npm install
npm run dev

e:

npm run build

e:

npm run preview

---

55. DEMONSTRAÇÃO

Criar um projeto de demonstração embutido.

Ele deve possuir:

Casa térrea
180 dias
15 etapas

O usuário deve conseguir abrir:

[ DEMONSTRAÇÃO ]

e imediatamente visualizar a simulação.

A demonstração não deve ser utilizada para mascarar ausência de funcionamento com arquivos reais.

---

56. DIFERENCIAÇÃO ENTRE DEMO E DADOS REAIS

Mostrar claramente:

DEMONSTRAÇÃO

quando dados fictícios estiverem sendo utilizados.

---

57. IA FUTURA

Preparar arquitetura para futura integração de IA.

Possíveis funções:

Interpretar planta
Sugerir cronograma
Identificar elementos
Associar elementos
Gerar descrição da obra
Gerar roteiro do vídeo

Porém, nenhuma dessas funções deve ser requisito do MVP.

---

58. FUTURO — ACOMPANHAMENTO REAL

Preparar estrutura para:

Foto
+
Data
+
Local
+
Etapa

e posteriormente:

PLANEJADO
     ×
REAL

---

59. FUTURO — RELATÓRIO

Preparar arquitetura para gerar:

PDF

contendo:

- imagem da obra;
- data;
- progresso;
- etapas concluídas;
- etapas em andamento;
- próximas etapas.

---

60. FUTURO — SISTEMA MULTIUSUÁRIO

Não implementar agora.

Mas manter separação que permita posteriormente:

Usuário
Empresa
Projeto
Obra
Cronograma

---

61. RESULTADO VISUAL DESEJADO

A animação deve parecer uma simulação arquitetônica profissional da construção, e não uma apresentação de PowerPoint.

O foco deve ser:

MODELO 3D
+
SEQUÊNCIA CONSTRUTIVA
+
TEMPO

---

62. PRINCÍPIO DE ENGENHARIA

Não utilizar IA generativa para alterar aleatoriamente a geometria do imóvel durante a animação.

A geometria deve permanecer consistente:

parede no frame 1
=
mesma parede no frame 500

Somente o estado construtivo deve mudar.

---

63. EXEMPLO DE RESULTADO

Para:

Residência
220 m²
180 dias

o vídeo deverá mostrar aproximadamente:

0%      terreno

5%      fundação

20%     estrutura

35%     alvenaria

50%     cobertura

65%     instalações

75%     revestimentos

90%     pintura/acabamento

100%    casa pronta

Esses percentuais são apenas exemplo visual e não devem ser tratados como cálculo real de avanço físico.

---

64. DEFINIÇÃO DE "4D"

Neste projeto:

3D = geometria
4D = geometria + tempo

O sistema deve sempre manter essa distinção.

---

65. REQUISITO FINAL ABSOLUTO

Não entregue uma resposta explicando como o sistema poderia ser criado.

CONSTRUA O SISTEMA.

Se houver limitações técnicas:

1. identifique-as;
2. implemente a melhor alternativa funcional;
3. documente a limitação;
4. não crie uma função fictícia.

Se uma parte não puder ser implementada no primeiro ciclo, priorize o MVP funcional:

IFC
 ↓
3D
 ↓
Cronograma
 ↓
Mapeamento
 ↓
Timeline
 ↓
Simulação 4D

Esse fluxo é obrigatório.

---

66. PRIMEIRA ENTREGA OBRIGATÓRIA

A primeira entrega deve ser uma versão funcional capaz de:

1. abrir a aplicação;

2. carregar um IFC;

3. visualizar a residência em 3D;

4. carregar um CSV;

5. mostrar o cronograma;

6. associar tarefas aos elementos;

7. executar a timeline;

8. mostrar a evolução da residência;

9. controlar a velocidade;

10. controlar a câmera;

11. renderizar frames;

12. gerar vídeo quando o navegador suportar;

13. oferecer fallback quando não suportar.


Não avançar para funcionalidades secundárias antes de esses 13 itens funcionarem.

---

67. TESTE FINAL OBRIGATÓRIO

Antes de considerar a implementação concluída, executar um teste completo:

IFC de residência
        ↓
carregar
        ↓
visualizar
        ↓
CSV
        ↓
mapear
        ↓
PLAY
        ↓
fundação
        ↓
estrutura
        ↓
alvenaria
        ↓
cobertura
        ↓
instalações
        ↓
acabamento
        ↓
casa concluída
        ↓
GERAR VÍDEO
        ↓
arquivo real

Somente considerar o projeto funcional se esse fluxo puder ser executado de ponta a ponta.

---

68. INSTRUÇÃO FINAL PARA A IA DE PROGRAMAÇÃO

Comece pela implementação do MVP.

Não gere apenas código conceitual.

Não gere pseudocódigo no lugar de código funcional.

Não crie uma interface sem backend/local processing funcional.

Não crie botões sem handlers.

Não invente APIs.

Não utilize bibliotecas inexistentes.

Antes de utilizar uma biblioteca, confirme sua API atual e sua compatibilidade com o ambiente escolhido.

Quando uma API de biblioteca tiver mudado, adapte a implementação para a versão atual.

Ao terminar cada fase, valide a funcionalidade antes de iniciar a próxima.

Se necessário, divida a implementação em vários arquivos.

O objetivo final é uma aplicação web funcional que permita ao usuário transformar um modelo de residência + cronograma em uma simulação 4D navegável e, quando suportado, em um vídeo real da evolução da obra.

Prioridade absoluta:

«FUNCIONAR PRIMEIRO.
FICAR BONITO DEPOIS.»
