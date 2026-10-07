import { Modal } from "./Modal";

interface Modelo {
  arquivo: string;
  titulo: string;
  descricao: string;
  colunas?: [string, string, string][];
}

const COLUNAS_CRONOGRAMA: [string, string, string][] = [
  ["id", "sim", "Código único da tarefa (ex.: ALV-01)"],
  ["nome", "não", "Nome da tarefa; se faltar, usa o id"],
  ["inicio", "sim", "Início planejado: dd/mm/aaaa, aaaa-mm-dd ou data do Excel"],
  ["fim", "sim", "Fim planejado, inclusive"],
  ["categoria", "não", "Liga os elementos à tarefa: terreno, fundacao, estrutura, alvenaria, laje, cobertura, instalacoes, reboco, esquadrias, revestimento, pintura, loucas, paisagismo"],
  ["pavimento", "não", "Limita a tarefa a um pavimento do modelo (ex.: Térreo); em branco, vale para o prédio inteiro"],
  ["inicio_real", "não", "Quando a tarefa começou de fato"],
  ["fim_real", "não", "Quando terminou de fato (exige inicio_real)"],
  ["avanco", "não", "Avanço físico: 0% a 100% (aceita 45%, 0,45 ou 45)"],
];

const MODELOS: Modelo[] = [
  {
    arquivo: "cronograma-modelo.xlsx",
    titulo: "Cronograma em Excel",
    descricao: "Planilha \"Cronograma\" (a que o app lê) com as 15 etapas da casa de exemplo, datas planejadas e execução real até 20/04/2026; a planilha \"Instruções\" explica cada coluna.",
    colunas: COLUNAS_CRONOGRAMA,
  },
  { arquivo: "cronograma-modelo.csv", titulo: "Cronograma em CSV", descricao: "As mesmas colunas, no padrão do Excel brasileiro: ponto e vírgula, datas dd/mm/aaaa e UTF-8 com BOM. Também aceita vírgula e aaaa-mm-dd." },
  { arquivo: "cronograma-modelo.json", titulo: "Cronograma em JSON", descricao: "Lista \"tarefas\" com os mesmos campos (datas aaaa-mm-dd; avanço de 0 a 1). Aceita também os nomes do §9: name, startDate, endDate, category." },
  {
    arquivo: "fotos-modelo.csv",
    titulo: "Dados das fotos",
    descricao: "Envie junto com as fotos (aba Obra → Adicionar fotos) para preencher data, local, descrição e etapa pelo nome do arquivo. Sem ele, a data vem do EXIF da câmera.",
    colunas: [
      ["arquivo", "sim", "Nome exato do arquivo da foto (ex.: obra-2026-04-01.jpg)"],
      ["data", "não", "Data da foto: dd/mm/aaaa ou aaaa-mm-dd"],
      ["local", "não", "Onde foi tirada (ex.: Fachada frontal)"],
      ["descricao", "não", "O que a foto mostra"],
      ["etapa", "não", "ID da tarefa do cronograma (ex.: ALV-01)"],
    ],
  },
  { arquivo: "casa-exemplo.ifc", titulo: "Modelo IFC de exemplo", descricao: "Casa térrea de 10 × 18 m com sala de pé-direito duplo (IFC4, metros), com as classes e os tipos predefinidos que as regras automáticas reconhecem." },
  {
    arquivo: "exemplo.4dstudio",
    titulo: "Projeto completo de exemplo",
    descricao: "A casa de exemplo com o cronograma acima (planejado e real) e quatro imagens da simulação no lugar de fotos. Importe em Projetos → Importar .4dstudio e use a visão Comparar.",
  },
];

/** Modelos de arquivo que o app recebe, com exemplos preenchidos. */
export function ModalModelos({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const url = (a: string) => new URL(`modelos/${a}`, document.baseURI).href;
  return (
    <Modal aberto={aberto} titulo="Modelos de arquivo" aoFechar={aoFechar} largura={760} testId="modal-modelos">
      <p className="tenue">Baixe, preencha com os dados da sua obra e carregue no app. Os exemplos são fictícios.</p>
      <ul className="modelos-lista">
        {MODELOS.map((m) => (
          <li key={m.arquivo}>
            <div className="topo-modelo">
              <strong>{m.titulo}</strong>
              <a className="btn mini" href={url(m.arquivo)} download={m.arquivo} data-testid={`baixar-${m.arquivo}`}>
                Baixar {m.arquivo}
              </a>
            </div>
            <span className="pequeno">{m.descricao}</span>
            {m.colunas && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Coluna</th>
                      <th>Obrigatória</th>
                      <th>Conteúdo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.colunas.map(([c, o, d]) => (
                      <tr key={c}>
                        <td className="mono">{c}</td>
                        <td>{o}</td>
                        <td>{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
