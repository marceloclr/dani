# Prompt — Incremento 3: projetos salvos, `.4dstudio`, XLSX, edição de tarefas e modo paramétrico

Você vai construir o terceiro incremento do **Construction 4D Studio**. Os incrementos 1 e 2 estão prontos e aceitos (`npm run tudo` verde) e publicados em https://marceloclr.github.io/dani/.

Leia antes de começar:
- `docs/especificacao.md`: implemente **só** os `[INC-3]` e mantenha os anteriores funcionando.
- `docs/adrs.md`, em especial ADR-02 (regras), ADR-05 (datas e XLSX), ADR-06 (persistência) e as decisões novas ADR-11 e ADR-12, descritas abaixo e registradas no arquivo.
- O design system Papel e Tinta (já em `src/estilos/tokens.css`).

## Decisões deste incremento

**ADR-11 — Ciclo de vida do projeto.**
- Projeto = modelo (IFC ou parâmetros) + cronograma + exceções + política + modo de animação + configuração do vídeo.
- Ao carregar um IFC ou criar um modelo paramétrico, nasce um projeto com o nome do arquivo, salvo automaticamente no IndexedDB a cada mudança (com espera de 600 ms).
- A **demonstração não é salva** sozinha, para não encher a lista; o botão "Salvar cópia" a transforma num projeto comum.
- Na primeira gravação, pedir `navigator.storage.persist()` e mostrar se o navegador garantiu o armazenamento.
- Banco `c4d` com dois depósitos: `projetos` (metadados e dados) e `modelos` (o IFC como Blob, por id do projeto).

**ADR-12 — Modo paramétrico.**
- O gerador cria diretamente os elementos (metadados e malhas) com as **mesmas classes IFC** do modo BIM (`IfcWall`, `IfcSlab` BASESLAB/FLOOR/ROOF, `IfcColumn`, `IfcBeam`, `IfcFooting`, `IfcDoor`, `IfcWindow`, `IfcStair`, `IfcCovering` FLOORING, `IfcGeographicElement` TERRAIN). Assim as regras do ADR-02 valem sem mudança.
- É determinístico (mesmos parâmetros, mesmos GUIDs e geometria). O projeto guarda só os parâmetros e regenera ao abrir.
- A interface marca o modelo como **PARAMÉTRICO: representação simplificada para animação, não é projeto executivo** (§3, §28).

## Escopo fechado

1. **Projetos (§37):** botão Projetos no cabeçalho com a lista (nome, tipo do modelo, nº de tarefas, última alteração) e as ações Novo, Abrir, Duplicar, Exportar, Importar e Excluir (com confirmação). O projeto atual mostra "salvo às hh:mm".
2. **Arquivo `.4dstudio` (§38):** ZIP (fflate) com `project.json`, `schedule.json`, `mappings.json` (exceções e política), `settings.json` (animação e vídeo) e `assets/modelo.ifc` quando o modelo é IFC. Importar valida a estrutura e cria um projeto novo; arquivo inválido gera erro amigável.
3. **Exportações (§39):** cronograma em JSON e em CSV, e mapeamento (regras efetivas, exceções e elementos por tarefa) em JSON.
4. **XLSX (§12):** primeira planilha, com as mesmas colunas e regras do CSV. Datas podem vir como data do Excel (número de série) ou como texto. Usar SheetJS 0.20.3, instalado do tarball do CDN oficial (ADR-05), nunca carregado em tempo de execução.
5. **Edição de tarefas (§12, §32):** criar cronograma do zero, incluir, editar (nome, categoria, início, fim) e excluir tarefas, com a validação do §41. Editar tarefas preserva as exceções das tarefas que continuam existindo.
6. **Modo paramétrico (§27, §28):**
   - Parâmetros: largura e comprimento do terreno, área construída, 1 ou 2 pavimentos, pé-direito e cobertura (laje plana com platibanda, telhado de uma água ou de duas águas).
   - Gerar: terreno, fundação (sapatas, baldrames e contrapiso), pilares, vigas, paredes com vãos, lajes, portas, janelas, escada (em 2 pavimentos), cobertura e pisos.
   - Validar se a casa cabe no lote com recuos de 5 m na frente, 3 m no fundo e 1,5 m nas laterais. Se não couber, explicar quanto falta.
   - Oferecer, quando não houver cronograma, o cronograma de demonstração (fictício, com selo).

## Fora do escopo

Fotos da obra, planta sobreposta, planejado × real, relatório PDF, IA, multiusuário, PWA, cronograma automático (§13).

## Testes

- Vitest: gerador paramétrico (determinismo, contagens por classe, área do piso ≈ área pedida, recusa quando não cabe, 2 pavimentos com escada e laje intermediária, regras ligam 100% dos elementos); XLSX (datas seriais e texto); `.4dstudio` (ida e volta preserva tudo; arquivo inválido é recusado); edição de tarefas preservando exceções.
- Playwright: criar projeto pelo IFC da demonstração com "Salvar cópia", recarregar a página e reabrir com tudo intacto; exportar e importar `.4dstudio`; criar modelo paramétrico de 2 pavimentos com duas águas e simular; editar uma tarefa e ver a simulação mudar; importar XLSX.

## Critério de aceitação

1. `npm run tudo` verde e deploy do Pages verde.
2. Recarregar a página não perde o projeto.
3. `.4dstudio` exportado num navegador abre igual em outro (ida e volta no teste).
4. O modelo paramétrico roda a simulação e o vídeo sem nenhum ajuste manual de mapeamento.
5. XLSX do Excel brasileiro importa como o CSV.

Ao terminar, liste o que foi feito, o resultado de cada item e as limitações conhecidas. Não declare pronto o que não foi verificado.
