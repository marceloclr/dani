# Amostras

Dados de **demonstração**: fictícios, e o app deve mostrar o selo DEMONSTRAÇÃO enquanto estiverem em uso (§56).

| Arquivo | Conteúdo |
|---------|----------|
| `demo.ifc` | Casa térrea de 10 × 18 m com sala de pé-direito duplo (IFC4, metros). Gerado por `tools/gerar_demo_ifc.py`; não editar à mão |
| `demo-cronograma.csv` | 15 etapas, 180 dias corridos (05/01 a 03/07/2026), fim inclusivo |

Os elementos se ligam às tarefas pela coluna `categoria`, segundo as regras do ADR-02 (`docs/adrs.md`). `limpeza` e `entrega` não têm elementos de propósito.
