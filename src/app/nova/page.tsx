/* eslint-disable @next/next/no-img-element -- prints estáticos da landing (/landing/img), já otimizados em webp */
import type { Metadata } from "next";
import "./nova.css";

// Landing nova (/nova): proposta comercial do ATLAS.ERP atual, ao lado da
// landing de hoje (/), sem substituí-la. Usa as telas reais do sistema
// (public/landing/img) e a identidade do ERP. Os valores da seção
// "Quanto custa" são uma conta de exemplo e estão marcados como tal.

export const metadata: Metadata = {
  title: "ATLAS.ERP — a operação inteira, conectada",
  description: "Vendas, compras, estoque, expedição, produção, financeiro e fiscal em um ERP só: um registro numa área vira trabalho na próxima, sem planilha no meio.",
  robots: { index: false, follow: false },
};

const IMG = "/landing/img/";

const Mark = () => (
  <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
    <rect x="3" y="3" width="16" height="8" rx="1.4" fill="#f3f4f5" />
    <rect x="21" y="3" width="8" height="16" rx="1.4" fill="#f3f4f5" />
    <rect x="13" y="21" width="16" height="8" rx="1.4" fill="#f3f4f5" />
    <rect x="3" y="13" width="8" height="16" rx="1.4" fill="#f3f4f5" />
    <rect x="13" y="13" width="6" height="6" rx="1.4" fill="#ff9408" />
  </svg>
);

const Arrow = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const STEPS = [
  { h: "Orçamento", p: "O comercial monta a proposta com os produtos, preços e condições do cliente.", auto: "Vira pedido com um clique" },
  { h: "Pedido aprovado", p: "Quem tem permissão aprova. O histórico guarda quem aprovou e quando.", auto: "Libera a reserva" },
  { h: "Estoque reservado", p: "O sistema reserva o saldo exato no endereço do depósito. Ninguém vende o que já está prometido.", auto: "Gera a separação" },
  { h: "Separação e expedição", p: "Logística separa, escolhe transportadora, motorista e veículo, e expede.", auto: "Baixa o estoque com custo" },
  { h: "NF-e emitida", p: "A nota sai com CFOP, NCM e impostos do cadastro, e o XML fica guardado.", auto: "Lança no fiscal" },
  { h: "Conta a receber", p: "O financeiro recebe o título com vencimento e parcelas, pronto para cobrar.", auto: "Entra no fluxo de caixa" },
];

const AREAS = [
  { h: "Comercial e CRM", p: "Funil, orçamentos e pedidos com aprovação, reserva e o próximo passo sempre visível.", img: "comercial-15-pedido-reservado-257-0-1183-900-760.webp", big: true },
  { h: "Suprimentos", p: "Solicitação, cotação, pedido de compra e recebimento com NF de entrada.", img: "suprimentos-03-pedidos-compra-257-0-1183-900-760.webp" },
  { h: "Estoque e logística", p: "Saldos por endereço, picking, expedição e transporte com estoque exato.", img: "logistica-02-estoque-257-0-1183-592-760.webp" },
  { h: "Financeiro", p: "Contas a pagar e a receber, parcelas e fluxo de caixa a partir do que aconteceu.", img: "financeiro-03-fluxo-caixa-257-0-1183-834-760.webp" },
  { h: "Fiscal", p: "NF-e de entrada e saída, CFOP, NCM e impostos, com o erro explicado em português.", img: "fiscal-02b-nfe-detalhe-257-0-1183-900-760.webp", big: true },
];

export default function NovaLanding() {
  return (
    <div className="nv">
      <header className="nv-top">
        <div className="nv-wrap">
          <div className="nv-top-in">
            <a className="nv-brand" href="#inicio" aria-label="ATLAS.ERP, início">
              <Mark /> ATLAS<span>.ERP</span>
            </a>
            <nav className="nv-nav" aria-label="Seções">
              <a href="#pedido">Siga um pedido</a>
              <a href="#custo">Quanto custa</a>
              <a href="#areas">Áreas</a>
              <a href="#governanca">Governança</a>
            </nav>
            <a className="nv-btn nv-btn-fire nv-btn-sm" href="/login">
              Entrar <Arrow />
            </a>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* ------------------------------------------------ hero */}
        <section className="nv-hero" aria-labelledby="nv-title">
          <div className="nv-glow" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="nv-grid-lines" aria-hidden="true" />
          <div className="nv-grain" aria-hidden="true" />
          <div className="nv-wrap nv-hero-in">
            <span className="nv-eyebrow">ERP empresarial modular</span>
            <h1 id="nv-title" className="nv-display">
              A operação inteira, <em>conectada.</em>
            </h1>
            <p className="nv-lead">
              Do orçamento à nota fiscal, do recebimento ao caixa. No ATLAS.ERP, cada registro de uma área já vira o trabalho da próxima, sem planilha, sem retrabalho e sem número perdido no caminho.
            </p>
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-fire" href="/login">
                Começar agora <Arrow />
              </a>
              <a className="nv-btn nv-btn-line" href="#pedido">
                Siga um pedido
              </a>
            </div>
            <div className="nv-trust">
              <span><b>7 áreas</b> no mesmo sistema</span>
              <span><b>Permissões</b> por papel e por setor</span>
              <span><b>Multiempresa</b> com a Administração Central</span>
            </div>
          </div>
          <div className="nv-wrap nv-stage">
            <div className="nv-frame">
              <img src={`${IMG}inicio-06-painel-executivo.webp`} width={1176} height={884} alt="Painel executivo do ATLAS.ERP com indicadores de vendas, compras, estoque e financeiro." fetchPriority="high" />
              <figure className="nv-float a">
                <span>Pedido reservado</span>
                <img src={`${IMG}comercial-15-pedido-reservado-257-0-1183-900-760.webp`} width={760} height={578} alt="Pedido de venda com o estoque reservado." loading="lazy" />
              </figure>
              <figure className="nv-float b">
                <span>NF-e emitida</span>
                <img src={`${IMG}fiscal-02b-nfe-detalhe-257-0-1183-900-760.webp`} width={760} height={578} alt="Detalhe de uma NF-e emitida no ATLAS.ERP." loading="lazy" />
              </figure>
            </div>
          </div>
        </section>
        <div className="nv-hero-fade" aria-hidden="true" />

        {/* ------------------------------------------------ siga um pedido */}
        <section id="pedido" className="nv-section" aria-labelledby="nv-pedido" style={{ paddingTop: 40 }}>
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-eyebrow">Siga um pedido</span>
              <h2 id="nv-pedido" className="nv-display">Seis áreas tocam o mesmo pedido. Ninguém digita nada duas vezes.</h2>
              <p className="nv-lead">Cada etapa termina disparando a seguinte: o estoque é reservado, a nota sai com os dados do cadastro e o título já nasce no financeiro.</p>
            </div>
            <div className="nv-journey">
              <ol className="nv-steps">
                {STEPS.map((s) => (
                  <li key={s.h}>
                    <h3>{s.h}</h3>
                    <p>{s.p}</p>
                    <span className="auto">→ {s.auto}</span>
                  </li>
                ))}
              </ol>
              <div className="nv-shots">
                <figure className="nv-shot" style={{ margin: 0 }}>
                  <img src={`${IMG}comercial-17-pedido-receber-gerado-0-80-1176-900.webp`} width={1176} height={900} alt="Pedido de venda com a conta a receber já gerada." loading="lazy" />
                  <figcaption>O pedido terminou: a conta a receber já está no financeiro.</figcaption>
                </figure>
                <div className="nv-shots-row">
                  <figure className="nv-shot" style={{ margin: 0 }}>
                    <img src={`${IMG}logistica-10-expedicao-257-0-1183-592-760.webp`} width={760} height={380} alt="Lista de expedições." loading="lazy" />
                    <figcaption>Expedição com estoque exato</figcaption>
                  </figure>
                  <figure className="nv-shot" style={{ margin: 0 }}>
                    <img src={`${IMG}fiscal-02-nfe-257-0-1183-592-760.webp`} width={760} height={380} alt="Lista de notas fiscais eletrônicas." loading="lazy" />
                    <figcaption>NF-e com XML guardado</figcaption>
                  </figure>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ ancoragem */}
        <section id="custo" className="nv-section nv-dark" aria-labelledby="nv-custo">
          <div className="nv-wrap nv-anchor">
            <div className="nv-anchor-cta">
              <span className="nv-eyebrow">Quanto custa operar em silos</span>
              <h2 id="nv-custo" className="nv-display">
                Planilha e retrabalho custam <b>R$ 38 mil</b> por mês a uma empresa média.
              </h2>
              <p className="nv-lead">Conta de exemplo para uma distribuidora com faturamento de R$ 1,5 milhão por mês e 25 pessoas na operação. É o dinheiro que escapa entre uma área e outra.</p>
              <div className="nv-ctas" style={{ justifyContent: "flex-start" }}>
                <a className="nv-btn nv-btn-fire" href="/login">
                  Fechar esse vazamento <Arrow />
                </a>
              </div>
            </div>
            <div className="nv-ledger" aria-label="Custo mensal de exemplo">
              <div><span>Horas redigitando pedidos, notas e títulos</span><b>R$ 12.600</b></div>
              <div><span>Vendas de produto que já estava prometido</span><b>R$ 9.800</b></div>
              <div><span>Juros e multas de contas pagas fora do prazo</span><b>R$ 5.900</b></div>
              <div><span>Nota fiscal refeita por erro de cadastro</span><b>R$ 4.300</b></div>
              <div><span>Estoque parado sem ninguém ver</span><b>R$ 5.400</b></div>
              <div className="tot"><span>Por mês</span><b>R$ 38.000</b></div>
              <small>Mais de R$ 450 mil por ano.</small>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ áreas */}
        <section id="areas" className="nv-section" aria-labelledby="nv-areas">
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-eyebrow">As áreas</span>
              <h2 id="nv-areas" className="nv-display">Cada área cuida de um pedaço da mesma operação.</h2>
            </div>
            <div className="nv-areas">
              {AREAS.map((a) => (
                <article key={a.h} className={`nv-area${a.big ? " big" : ""}`}>
                  <div className="pic">
                    <img src={`${IMG}${a.img}`} width={760} height={578} alt={`Tela de ${a.h} no ATLAS.ERP.`} loading="lazy" />
                  </div>
                  <div className="txt">
                    <h3>{a.h}</h3>
                    <p>{a.p}</p>
                  </div>
                </article>
              ))}
              <article className="nv-area">
                <div className="pic">
                  <img src={`${IMG}inicio-04-fluxo-do-erp-760.webp`} width={760} height={571} alt="Mapa do fluxo do ERP." loading="lazy" />
                </div>
                <div className="txt">
                  <h3>Produção, qualidade e ativos</h3>
                  <p>Ordens de produção com consumo e custo, inspeções, não conformidades e manutenção.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ governança */}
        <section id="governanca" className="nv-section" aria-labelledby="nv-gov" style={{ paddingTop: 0 }}>
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-eyebrow">Governança</span>
              <h2 id="nv-gov" className="nv-display">Uma base, três níveis. Cada pessoa vê só o que é dela.</h2>
            </div>
            <div className="nv-levels">
              <div className="nv-level wine">
                <span className="who">Administração Central</span>
                <h3>A plataforma</h3>
                <p>Cria empresas, define planos e módulos e acompanha todas sem ver os dados de nenhuma.</p>
              </div>
              <div className="nv-level dark">
                <span className="who">Administração da Empresa</span>
                <h3>A empresa</h3>
                <p>Convida pessoas, monta papéis e setores, escolhe as telas de cada perfil e liga os módulos.</p>
              </div>
              <div className="nv-level">
                <span className="who">ERP</span>
                <h3>A operação</h3>
                <p>Cada pessoa trabalha com o que o papel dela permite. A regra vale no banco, não só na tela.</p>
              </div>
            </div>
            <div className="nv-facts" style={{ marginTop: 72 }}>
              <div><b>7</b><span>áreas integradas</span></div>
              <div><b>1</b><span>cadastro para tudo</span></div>
              <div><b>0</b><span>planilhas entre as áreas</span></div>
              <div><b>3</b><span>níveis de acesso</span></div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ final */}
        <section className="nv-final" aria-labelledby="nv-final-t">
          <div className="nv-glow" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="nv-grain" aria-hidden="true" />
          <div className="nv-wrap nv-final-in">
            <span className="nv-eyebrow">ATLAS.ERP</span>
            <h2 id="nv-final-t" className="nv-display">
              Sua operação não deveria funcionar <em>em silos.</em>
            </h2>
            <p>Comece hoje e veja o primeiro pedido passar por todas as áreas sem ninguém redigitar nada.</p>
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-fire" href="/login">
                Começar agora <Arrow />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="nv-foot">
        <div className="nv-wrap">
          <span>© ATLAS.ERP</span>
          <span>Os valores da seção &quot;Quanto custa&quot; são uma conta de exemplo.</span>
        </div>
      </footer>
    </div>
  );
}
