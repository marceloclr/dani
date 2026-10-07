import { useMemo, useState } from "react";
import { criarParametricoComoProjeto } from "../app/projetos";
import { NOME_COBERTURA, PARAMETROS_PADRAO, RECUOS, dimensionar, type Cobertura, type ParametrosCasa } from "../bim/parametrico";
import { Modal } from "./Modal";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Modo paramétrico (§27): casa simplificada para animação 4D, sem IFC. */
export function ModalParametrico({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const [p, setP] = useState<ParametrosCasa>(PARAMETROS_PADRAO);
  const num = (campo: keyof ParametrosCasa) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [campo]: Number(e.target.value.replace(",", ".")) });

  const previa = useMemo(() => {
    try {
      const d = dimensionar(p);
      return { ok: true as const, texto: `Casa de ${fmt(d.largura)} × ${fmt(d.profundidade)} m (${Math.round(d.areaPavimento)} m² por pavimento)` };
    } catch (e) {
      return { ok: false as const, texto: (e as Error).message };
    }
  }, [p]);

  const gerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await criarParametricoComoProjeto(p)) aoFechar();
  };

  return (
    <Modal aberto={aberto} titulo="Criar modelo paramétrico" aoFechar={aoFechar} largura={520} testId="modal-parametrico">
      <p className="aviso-honesto">
        <strong>Representação simplificada para animação 4D, não é projeto executivo.</strong> A planta é sempre a mesma: dois cômodos na frente, sala e cozinha no fundo e, com dois pavimentos, escada na lateral.
      </p>
      <form className="form" onSubmit={gerar}>
        <div className="linha-campos">
          <label className="campo">
            <span>Largura do terreno (m)</span>
            <input type="number" min={5} step={0.5} value={p.terrenoLargura} onChange={num("terrenoLargura")} data-testid="param-largura" />
          </label>
          <label className="campo">
            <span>Comprimento do terreno (m)</span>
            <input type="number" min={10} step={0.5} value={p.terrenoComprimento} onChange={num("terrenoComprimento")} data-testid="param-comprimento" />
          </label>
        </div>
        <div className="linha-campos">
          <label className="campo">
            <span>Área construída (m²)</span>
            <input type="number" min={25} step={1} value={p.area} onChange={num("area")} data-testid="param-area" />
          </label>
          <label className="campo">
            <span>Pavimentos</span>
            <select value={p.pavimentos} onChange={(e) => setP({ ...p, pavimentos: Number(e.target.value) as 1 | 2 })} data-testid="param-pavimentos">
              <option value={1}>1 (térrea)</option>
              <option value={2}>2 (sobrado)</option>
            </select>
          </label>
        </div>
        <div className="linha-campos">
          <label className="campo">
            <span>Pé-direito (m)</span>
            <input type="number" min={2.5} max={4.5} step={0.05} value={p.peDireito} onChange={num("peDireito")} data-testid="param-pe-direito" />
          </label>
          <label className="campo">
            <span>Cobertura</span>
            <select value={p.cobertura} onChange={(e) => setP({ ...p, cobertura: e.target.value as Cobertura })} data-testid="param-cobertura">
              {(Object.keys(NOME_COBERTURA) as Cobertura[]).map((c) => (
                <option key={c} value={c}>
                  {NOME_COBERTURA[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p
          className={previa.ok ? "relacao calc" : "aviso-honesto erro-form"}
          tabIndex={0}
          data-testid="param-previa"
          data-tip={`Recuos: ${RECUOS.frente} m na frente, ${RECUOS.fundo} m no fundo e ${RECUOS.lateral} m nas laterais\nÁrea por pavimento = área construída ÷ pavimentos\nProporção buscada: profundidade ≈ 1,4 × largura`}
        >
          {previa.texto}
        </p>
        <div className="botoes fim">
          <span className="espaco" />
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={!previa.ok} data-testid="param-gerar">
            Gerar modelo
          </button>
        </div>
      </form>
    </Modal>
  );
}
