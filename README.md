# Dani — Construction 4D Studio (planejamento)

Planejamento de uma aplicação web estática que transforma um modelo de residência (IFC) e um cronograma de obra numa simulação 4D navegável e num vídeo da evolução da construção.

Este repositório ainda **não tem código**: guarda o prompt original, a avaliação e a versão reestruturada para orientar a implementação por incrementos.

| Arquivo | Conteúdo |
|---------|----------|
| [prompt-mestre-original.md](prompt-mestre-original.md) | Prompt mestre original, 68 seções, sem alterações |
| [docs/avaliacao.md](docs/avaliacao.md) | Avaliação do prompt: entendimento, méritos, críticas e sugestões |
| [docs/especificacao.md](docs/especificacao.md) | Especificação enxuta, cada requisito etiquetado por incremento |
| [docs/adrs.md](docs/adrs.md) | Decisões técnicas fixadas, com versões e licenças conferidas em 2026-10-07 |
| [public/samples/](public/samples/) | Casa de demonstração (`demo.ifc`) e cronograma de 180 dias |
| [tools/](tools/) | Gerador do IFC de demonstração e prévia estática da simulação |
| [prompts/incremento-1.md](prompts/incremento-1.md) | Prompt fechado para o 1º incremento: IFC → 3D → cronograma → mapeamento → simulação 4D |

## Design

Interface no padrão [Papel e Tinta](https://github.com/marceloclr/design-system) (`design-system.md`, `tokens.css`, `componentes/dicas.js`).

## Incrementos

1. **INC-1**: IFC → 3D → CSV → mapeamento automático por regras → timeline → simulação 4D.
2. **INC-2**: câmeras e vídeo (WebCodecs + Mediabunny, com fallbacks).
3. **INC-3**: persistência (IndexedDB, `.4dstudio`), XLSX e modo paramétrico.

## Pendências antes de implementar

- Escrever os prompts dos incrementos 2 e 3 depois que o 1 for aceito.

## Casa de demonstração

Casa térrea de 10 × 18 m com sala de pé-direito duplo, gerada por script (ADR-08). Para regenerar:

```bash
python -m venv .venv && .venv/bin/pip install ifcopenshell==0.9.0 matplotlib
.venv/bin/python tools/gerar_demo_ifc.py   # public/samples/demo.ifc
.venv/bin/python tools/previa_demo.py      # docs/demo-etapas.png
```

![Prévia da simulação](docs/demo-etapas.png)
