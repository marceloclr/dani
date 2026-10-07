# Prompt — Incremento 8: dias úteis na estimativa

Pedido do usuário:

> "Na geração da estimativa de cronograma incluir contagem de dias úteis e manter os dias corridos. Utilize o calendário oficial no Ceará e nos municípios do projeto, carregue em banco os próximos 4 anos. Siga"

Respostas do usuário:
- Municípios: Fortaleza e Região Metropolitana (19 municípios).
- Dia útil: segunda a sexta, fora sábados, domingos, feriados e Carnaval.

## Decisões

ADR-22 (docs/adrs.md) e tabela de fontes em docs/feriados.md.

## Aceitação

- O gerador de estimativa tem o campo **Município da obra** (RMF ou "Outro município do Ceará").
- A prévia mostra **Dias corridos** e **Dias úteis** por etapa e na linha "Obra inteira", com a fórmula na dica.
- A linha de feriados informa quantos caem em dia de semana no período; a dica lista as datas, a esfera e o que está "a confirmar".
- As datas das tarefas continuam em dias corridos; o município fica gravado no cronograma.
- O banco local (IndexedDB `c4d`, versão 3) tem o armazenamento `feriados` com 2026 a 2030 (276 registros).
- Testes: tests/feriados.test.ts e e2e/estimativa.spec.ts.
