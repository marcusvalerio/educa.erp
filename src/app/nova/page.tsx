import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./nova.css";

// Landing nova (/nova): proposta de landing comercial do Atlas, ao lado da
// atual (/), sem substituí-la. Página estática e pública; os números são de
// exemplo e aparecem marcados como tal.

const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-nova", display: "swap" });

export const metadata: Metadata = {
  title: "Atlas — o ERP que já sabe o que precisa de você",
  description: "ERP para operações de logística nacional e internacional: ele lê os seus dados, acha o que importa e entrega pronto para decidir.",
  robots: { index: false, follow: false },
};

const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M14 3 L25 25 H3 Z" fill="none" stroke="#1b2b1b" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M9 18 H19" stroke="#027944" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const THINKS = [
  { q: "O disjuntor 32A acaba em 5 dias.", p: "Saldo de 40 un. ÷ consumo médio de 8 un./dia, com fornecedor que entrega em 7.", a: "Comprar 40 un." },
  { q: "O caixa encosta em R$ 38 mil no dia 12.", p: "Recebíveis menos pagáveis, dia a dia, nos próximos 60 dias.", a: "Antecipar R$ 40 mil" },
  { q: "O contêiner entra em demurrage na quinta.", p: "Free time de 7 dias contado da descarga em Santos. Depois, US$ 150 por dia.", a: "Agendar retirada" },
  { q: "A separação segura os pedidos 2,6× mais que o normal.", p: "Tempo médio em cada etapa do pedido, comparado aos últimos 90 dias.", a: "Ver o gargalo" },
];

const MODS = [
  { h: "Comercial", p: "Pedido que trava aparece sozinho, com o motivo. Cliente com atraso pede confirmação antes de vender de novo.", b: "Pedidos parados · risco de cliente · margem por pedido", wide: true },
  { h: "Suprimentos", p: "O ponto de pedido é calculado pelo consumo real e pelo prazo de cada fornecedor.", b: "Compra sugerida em um toque" },
  { h: "Estoque e expedição", p: "Reserva, separação e expedição com estoque exato e o próximo passo sempre na tela.", b: "Ruptura prevista · expedições atrasadas" },
  { h: "Produção", p: "Material sai do estoque ao apontar a produção, e o custo do produto pronto entra certo.", b: "Ordens atrasadas · custo real" },
  { h: "Financeiro", p: "Caixa dos próximos 60 dias, títulos vencendo e quem cobrar primeiro, por valor.", b: "Caixa futuro · cobrança por impacto" },
  { h: "Comércio exterior", p: "Processo de importação com linha do tempo, Incoterm explicado, free time, documentos e custo na porta.", b: "Demurrage · landed cost · câmbio", wide: true },
  { h: "Fiscal", p: "Nota de entrada e de saída separadas, com o erro em português e o botão para corrigir.", b: "NF-e · CFOP · NCM" },
];

export default function NovaLanding() {
  return (
    <div className={`nv ${geist.variable}`}>
      <header className="nv-top">
        <div className="nv-wrap">
          <div className="nv-top-in">
            <a className="nv-brand" href="#inicio" aria-label="Atlas, início">
              <Mark /> Atlas
            </a>
            <nav className="nv-nav" aria-label="Seções">
              <a href="#pensa">Como pensa</a>
              <a href="#custo">Quanto custa não ver</a>
              <a href="#comex">Comércio exterior</a>
              <a href="#modulos">Módulos</a>
            </nav>
            <a className="nv-btn nv-btn-primary" href="/login">
              Entrar <Arrow />
            </a>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* ------------------------------------------------ hero */}
        <section className="nv-hero" aria-labelledby="nv-title">
          <div className="nv-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="nv-grain" />
          </div>
          <div className="nv-wrap nv-hero-in">
            <span className="nv-kicker">ERP para logística nacional e internacional</span>
            <h1 id="nv-title">
              O ERP que já sabe <em>o que precisa de você</em> hoje.
            </h1>
            <p className="nv-lead">
              O Atlas lê a sua operação inteira, encontra o que vai dar errado antes de acontecer e entrega cada decisão com o valor em reais e o botão para resolver.
            </p>
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-primary" href="/login">
                Começar agora <Arrow />
              </a>
              <a className="nv-btn nv-btn-ghost" href="#pensa">
                Ver como ele pensa
              </a>
            </div>
            <p className="nv-proof">Vendas, compras, estoque, expedição, produção, financeiro, fiscal e comércio exterior em um só lugar.</p>

            <div className="nv-shot" role="img" aria-label="Tela do painel Hoje do Atlas: três decisões em foco, a curva de caixa e o estoque que acaba primeiro.">
              <div className="nv-device">
                <div className="nv-screen">
                  <div className="nv-scr-hero">
                    <span className="nv-scr-meta">Terça-feira, 27 de outubro · Boa tarde, Douglas</span>
                    <p className="nv-scr-title">R$ 74 mil dependem de três decisões suas hoje.</p>
                    <div className="nv-decisions">
                      <div className="nv-decision">
                        <b>R$ 48.320</b>
                        <span>Cobrar 7 clientes em atraso. O mais antigo venceu há 12 dias.</span>
                        <i>Cobrar todos</i>
                      </div>
                      <div className="nv-decision">
                        <b>US$ 4.500</b>
                        <span>Retirar o contêiner antes do demurrage, na quinta.</span>
                        <i>Agendar retirada</i>
                      </div>
                      <div className="nv-decision">
                        <b>R$ 21.940</b>
                        <span>Destravar 2 pedidos parados na separação há 4 dias.</span>
                        <i>Ver pedidos</i>
                      </div>
                    </div>
                  </div>
                  <div className="nv-scr-row">
                    <div className="nv-scr-card">
                      <h4>O caixa encosta em R$ 38 mil no dia 12</h4>
                      <svg className="nv-curve" viewBox="0 0 600 86" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                          <linearGradient id="nvArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#a5dbe5" stopOpacity=".8" />
                            <stop offset="1" stopColor="#a5dbe5" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0 20 L60 28 L120 40 L180 55 L230 68 L260 72 L300 62 L360 44 L420 36 L480 28 L540 20 L600 12 L600 86 L0 86 Z" fill="url(#nvArea)" />
                        <path d="M0 20 L60 28 L120 40 L180 55 L230 68 L260 72 L300 62 L360 44 L420 36 L480 28 L540 20 L600 12" fill="none" stroke="#1b2b1b" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
                        <line x1="0" x2="600" y1="66" y2="66" stroke="#8a5a00" strokeOpacity=".5" vectorEffect="non-scaling-stroke" />
                      </svg>
                      <small>Linha âmbar: mínimo seguro de R$ 50 mil</small>
                    </div>
                    <div className="nv-scr-card">
                      <h4>Estoque que acaba primeiro</h4>
                      <div className="nv-mini-list">
                        <div><span>Disjuntor 32A</span><b>5 dias</b></div>
                        <div><span>Cabo flexível 2,5 mm</span><b>9 dias</b></div>
                        <div><span>Quadro 12 circuitos</span><b>14 dias</b></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ como pensa */}
        <section id="pensa" className="nv-section" aria-labelledby="nv-pensa">
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-kicker">Como ele pensa</span>
              <h2 id="nv-pensa">Frases prontas para decidir, no lugar de relatórios para interpretar.</h2>
              <p className="nv-lead">Cada aviso nasce de uma regra simples sobre os seus próprios dados. Você vê a conta, entende o motivo e age no mesmo lugar.</p>
            </div>
            <div className="nv-thinks">
              {THINKS.map((t) => (
                <article className="nv-think" key={t.q}>
                  <q>{t.q}</q>
                  <p>{t.p}</p>
                  <span className="nv-act">
                    {t.a} <Arrow />
                  </span>
                </article>
              ))}
            </div>
            <div className="nv-noai">
              <span><b>Sem caixa-preta.</b> Toda previsão mostra de onde veio.</span>
              <span><b>Sem IA para configurar.</b> Funciona com os dados do dia a dia.</span>
              <span><b>Por papel.</b> Financeiro, logística e diretoria veem o que importa para cada um.</span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ ancoragem */}
        <section id="custo" className="nv-section" aria-labelledby="nv-custo" style={{ paddingTop: 0 }}>
          <div className="nv-wrap">
            <div className="nv-anchor">
              <div className="nv-anchor-text">
                <span className="nv-kicker">Quanto custa não ver</span>
                <h2 id="nv-custo">
                  Numa importadora média, o que passa despercebido custa <span className="nv-num">R$ 41 mil</span> por mês.
                </h2>
                <p className="nv-lead">Conta de exemplo, para uma empresa com faturamento de R$ 2 milhões por mês. Cada linha é um problema que o Atlas avisa antes de virar custo.</p>
                <div className="nv-ctas" style={{ justifyContent: "flex-start" }}>
                  <a className="nv-btn nv-btn-primary" href="/login">
                    Parar de perder dinheiro <Arrow />
                  </a>
                </div>
              </div>
              <div className="nv-ledger" aria-label="Custo mensal de exemplo do que passa despercebido">
                <div><span>Demurrage de 2 contêineres por 9 dias</span><b>R$ 14.850</b></div>
                <div><span>Juros e multa de títulos pagos com atraso</span><b>R$ 6.200</b></div>
                <div><span>Vendas perdidas por ruptura de estoque</span><b>R$ 11.300</b></div>
                <div><span>Cobrança tardia: capital parado em vencidos</span><b>R$ 5.450</b></div>
                <div><span>Margem errada por custo de importação mal calculado</span><b>R$ 3.200</b></div>
                <div className="tot"><span>Por mês</span><b>R$ 41.000</b></div>
                <small>Por ano, quase meio milhão de reais.</small>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ comex */}
        <section id="comex" className="nv-section nv-comex" aria-labelledby="nv-comex-t">
          <div className="nv-wrap">
            <div className="nv-comex-grid">
              <div>
                <div className="nv-head" style={{ marginBottom: 28 }}>
                  <span className="nv-kicker">Comércio exterior</span>
                  <h2 id="nv-comex-t">Você sabe exatamente quando a carga passa a ser sua.</h2>
                  <p className="nv-lead">Cada importação tem linha do tempo, Incoterm explicado em português, documentos que faltam, free time contando e o custo real na porta, por unidade.</p>
                </div>
                <div className="nv-stage" aria-hidden="true">
                  <div className="nv-shadow" />
                  <div className="nv-cont">
                    <div className="nv-face f"><span>TGHU 441022 1</span><small>45G1 · MAX GROSS 32.500 KG</small></div>
                    <div className="nv-face b" />
                    <div className="nv-face l" />
                    <div className="nv-face r" />
                    <div className="nv-face t" />
                    <div className="nv-face u" />
                  </div>
                </div>
              </div>
              <div className="nv-cargo">
                <span className="nv-pill">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3 2 20h20L12 3z" />
                    <path d="M12 10v4" />
                    <path d="M12 17h.01" />
                  </svg>
                  Responsabilidade do comprador desde 18 set
                </span>
                <div className="nv-glass-dark">
                  <dl className="nv-facts">
                    <div><dt>Contrato</dt><dd>FOB Xangai</dd></div>
                    <div><dt>Contêiner</dt><dd>40&apos; HC · lacre íntegro</dd></div>
                    <div><dt>Mercadoria</dt><dd>4.800 disjuntores</dd></div>
                    <div><dt>Chegada</dt><dd>03 nov · Santos</dd></div>
                    <div><dt>Free time</dt><dd>acaba quinta</dd></div>
                    <div><dt>Custo na porta</dt><dd>R$ 112,22/un.</dd></div>
                  </dl>
                </div>
                <div className="nv-glass-dark">
                  <div className="nv-route">
                    <span className="done">Fábrica</span>
                    <span className="done">Terminal</span>
                    <span className="done handover">A bordo</span>
                    <span className="done">Navegando</span>
                    <span>Santos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ módulos */}
        <section id="modulos" className="nv-section" aria-labelledby="nv-mods">
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-kicker">Módulos</span>
              <h2 id="nv-mods">Um sistema só, do pedido à entrega, do porto ao caixa.</h2>
            </div>
            <div className="nv-mods">
              {MODS.map((m) => (
                <article key={m.h} className={`nv-mod${m.wide ? " wide" : ""}`}>
                  <h3>{m.h}</h3>
                  <p>{m.p}</p>
                  <b>{m.b}</b>
                </article>
              ))}
            </div>
            <div className="nv-rules" style={{ marginTop: 72 }}>
              <div><h3>Pronto para decidir</h3><p>Todo número leva a uma ação, com o valor em reais.</p></div>
              <div><h3>Avisa antes</h3><p>Ruptura, caixa apertado e demurrage chegam com dias de antecedência.</p></div>
              <div><h3>Preenche por você</h3><p>Cliente, produto e fornecedor trazem condição, unidade, NCM e custo.</p></div>
              <div><h3>Seguro por papel</h3><p>Cada pessoa vê e faz só o que o papel dela permite.</p></div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ final */}
        <section className="nv-final" aria-labelledby="nv-final-t">
          <div className="nv-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="nv-grain" />
          </div>
          <div className="nv-wrap nv-final-in">
            <h2 id="nv-final-t">Sua operação, um passo à frente.</h2>
            <p>Abra o Atlas amanhã de manhã e saiba, em uma frase, o que precisa de você hoje.</p>
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-light" href="/login">
                Começar agora <Arrow />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="nv-wrap nv-foot">
        <span>Atlas · ERP para logística nacional e internacional</span>
        <span>Números desta página são exemplos.</span>
      </footer>
    </div>
  );
}
