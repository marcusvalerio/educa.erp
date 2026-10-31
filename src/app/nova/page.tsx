/* eslint-disable @next/next/no-img-element -- prints estáticos da landing (/landing/img), já otimizados em webp */
import type { Metadata } from "next";
import { LeakCalculator, LiveLeak } from "./Leak";
import { ChaosField, Diagnostic, LeadForm, LiveOrder, SilenceButton, type Noise } from "./Interactive";
import "./nova.css";

// Landing nova (/nova): proposta comercial do ATLAS.ERP atual, ao lado da
// landing de hoje (/), sem substituí-la. Narrativa: o caos de hoje → o
// silêncio de uma operação conectada → quanto custa para VOCÊ (calculadora
// com a conta à mostra e o contador do dia) → como funciona → CTA.
// Telas reais do sistema (public/landing/img); valores são estimativas.

export const metadata: Metadata = {
  title: "ATLAS.ERP — a operação inteira, conectada",
  description: "Vendas, compras, estoque, expedição, produção, financeiro e fiscal em um ERP só: um registro numa área vira trabalho na próxima, sem planilha no meio.",
  robots: { index: false, follow: false },
};


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

// O barulho de uma operação desconectada: o que chega no celular do gestor.
const NOISE: Noise[] = [
  { who: "Vendas", t: "Tem 40 unidades pra entregar amanhã?", at: "08:12", ok: "Disponível: 40 un. reservadas" },
  { who: "Financeiro", t: "Alguém lançou o boleto da Kessler?", at: "08:31", ok: "Boleto lançado e conciliado" },
  { who: "Expedição", t: "Esse pedido já pode sair?", at: "08:47", ok: "Pedido liberado para expedição" },
  { who: "Cliente", t: "Cadê a minha nota fiscal?", at: "09:05", ok: "NF-e enviada ao cliente" },
  { who: "Compras", t: "Qual era o preço da última cotação?", at: "09:22", ok: "Última cotação: R$ 12,40" },
  { who: "Estoque", t: "No sistema tem 12, aqui tem 4.", at: "09:40", ok: "Saldo conferido: 4 un." },
  { who: "Diretoria", t: "Quanto a gente tem a receber esse mês?", at: "10:03", ok: "A receber no mês: R$ 412 mil" },
  { who: "Fiscal", t: "Esse CFOP tá certo?", at: "10:18", ok: "CFOP 5102 validado" },
  { who: "Vendas", t: "Vendi, mas o estoque era de outro pedido.", at: "10:44", ok: "Estoque reservado para o pedido certo" },
  { who: "Financeiro", t: "Venceu ontem. Ninguém avisou.", at: "11:02", ok: "Pago em dia, sem juros" },
  { who: "Produção", t: "Faltou matéria-prima de novo.", at: "11:27", ok: "Ordem de compra gerada" },
  { who: "Planilha", t: "versao_final_AGORA_vai (3).xlsx", at: "11:50", ok: "Uma versão só, no sistema" },
];

const STEPS = [
  { h: "Orçamento", p: "O comercial monta a proposta com os produtos, preços e condições do cliente.", auto: "Vira pedido com um clique" },
  { h: "Pedido aprovado", p: "Quem tem permissão aprova. O histórico guarda quem aprovou e quando.", auto: "Libera a reserva" },
  { h: "Estoque reservado", p: "O sistema reserva o saldo exato no endereço do depósito. Ninguém vende o que já está prometido.", auto: "Gera a separação" },
  { h: "Separação e expedição", p: "Logística separa, escolhe transportadora, motorista e veículo, e expede.", auto: "Baixa o estoque com custo" },
  { h: "NF-e emitida", p: "A nota sai com CFOP, NCM e impostos do cadastro, e o XML fica guardado.", auto: "Lança no fiscal" },
  { h: "Conta a receber", p: "O financeiro recebe o título com vencimento e parcelas, pronto para cobrar.", auto: "Entra no fluxo de caixa" },
];

const AREAS = [
  { h: "Comercial e CRM", p: "Funil, orçamentos e pedidos com aprovação, reserva e o próximo passo sempre visível.", img: "pedidos.jpg", big: true },
  { h: "Suprimentos", p: "Solicitação, cotação, pedido de compra e recebimento com NF de entrada.", img: "compras.jpg" },
  { h: "Estoque e logística", p: "Saldos por endereço, picking, expedição e transporte com estoque exato.", img: "estoque.jpg" },
  { h: "Financeiro", p: "Contas a pagar e a receber, parcelas e fluxo de caixa a partir do que aconteceu.", img: "fluxo.jpg", big: true },
  { h: "Fiscal", p: "NF-e de entrada e saída, CFOP, NCM e impostos, com o erro explicado em português.", img: "nota-detalhe.jpg", big: true },
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
              <a href="#silencio">Como é</a>
              <a href="#ao-vivo">Ao vivo</a>
              <a href="#diagnostico">Diagnóstico</a>
              <a href="#custo">Quanto custa</a>
              <a href="#pedido">Siga um pedido</a>
              <a href="#areas">Áreas</a>
            </nav>
            <a className="nv-btn nv-btn-fire nv-btn-sm" href="/login">
              Entrar <Arrow />
            </a>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* ------------------------------------------------ 1. o caos */}
        <section className="nv-hero nv-chaos" aria-labelledby="nv-title">
          <div className="nv-glow" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <ChaosField items={NOISE} />
          <div className="nv-grain" aria-hidden="true" />
          <div className="nv-wrap nv-hero-in">
            <span className="nv-eyebrow">Segunda-feira, 11h50</span>
            <h1 id="nv-title" className="nv-display">
              Sua empresa fala com você o dia inteiro. <em>Quase sempre tarde demais.</em>
            </h1>
            <p className="nv-lead">
              Pedido que ninguém sabe se saiu. Estoque que existe na planilha e não na prateleira. Boleto que venceu ontem. Não é falta de gente boa. É uma operação que não conversa.
            </p>
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-fire" href="#custo">
                Ver quanto isso me custa <Arrow />
              </a>
              <SilenceButton />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 2. o silêncio */}
        <section id="silencio" className="nv-quiet" aria-labelledby="nv-quiet-t">
          <div className="nv-wrap nv-quiet-in">
            <span className="nv-eyebrow">Agora imagine o contrário</span>
            <h2 id="nv-quiet-t" className="nv-display">
              Silêncio. Porque tudo <em>já aconteceu.</em>
            </h2>
            <p className="nv-lead">
              O pedido aprovado reservou o estoque. A expedição baixou o saldo. A nota saiu com os impostos certos. O título já está no financeiro. Ninguém perguntou nada para ninguém.
            </p>
          </div>
          <div className="nv-wrap nv-stage">
            <div className="nv-frame">
              <img src="/nova/inicio.jpg" width={2160} height={1350} alt="Painel executivo do ATLAS.ERP com indicadores de vendas, compras, estoque e financeiro." fetchPriority="high" />
              <figure className="nv-float a">
                <span>Estoque reservado sozinho</span>
                <img src="/nova/pedido-reservado.jpg" width={2160} height={1350} alt="Pedido de venda com o estoque reservado." />
              </figure>
              <figure className="nv-float b">
                <span>NF-e emitida sem redigitar</span>
                <img src="/nova/nota-detalhe.jpg" width={2160} height={1350} alt="Detalhe de uma NF-e emitida no ATLAS.ERP." />
              </figure>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ pedido ao vivo */}
        <section id="ao-vivo" className="nv-section" aria-labelledby="nv-vivo-t" style={{ paddingTop: 0 }}>
          <div className="nv-wrap">
            <div className="nv-head nv-head-center">
              <span className="nv-eyebrow">Faça um pedido agora</span>
              <h2 id="nv-vivo-t" className="nv-display">Escolha um produto. <em>Veja seis áreas trabalharem sozinhas.</em></h2>
            </div>
            <LiveOrder />
          </div>
        </section>

        {/* ------------------------------------------------ diagnóstico */}
        <section id="diagnostico" className="nv-section" aria-labelledby="nv-diag-t" style={{ paddingTop: 0 }}>
          <div className="nv-wrap">
            <div className="nv-head nv-head-center">
              <span className="nv-eyebrow">Diagnóstico de 60 segundos</span>
              <h2 id="nv-diag-t" className="nv-display">Seis perguntas. <em>Uma nota honesta.</em></h2>
              <p className="nv-lead" style={{ textAlign: "center" }}>Responda com sinceridade. Ninguém está olhando, e o resultado aparece só para você.</p>
            </div>
            <Diagnostic />
          </div>
        </section>

        {/* ------------------------------------------------ 3. o seu número */}
        <section id="custo" className="nv-section nv-dark nv-cost" aria-labelledby="nv-custo">
          <div className="nv-glow dim" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="nv-wrap" style={{ position: "relative", zIndex: 1 }}>
            <div className="nv-head nv-head-center">
              <span className="nv-eyebrow">Quanto custa operar em silos</span>
              <h2 id="nv-custo" className="nv-display">
                Coloque os números da sua empresa. <em>Olhe para o resultado.</em>
              </h2>
            </div>
            <LeakCalculator />
            <div className="nv-cost-cta">
              <LiveLeak prefix="Hoje, desde as 8h, já escaparam" />
              <a className="nv-btn nv-btn-fire" href="#contato">
                Estancar isso agora <Arrow />
              </a>
            </div>
            <div id="contato" style={{ marginTop: 48 }}>
              <LeadForm />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 4. siga um pedido */}
        <section id="pedido" className="nv-section" aria-labelledby="nv-pedido">
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-eyebrow">Como o silêncio acontece</span>
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
                  <img src="/nova/receber.jpg" width={2160} height={1350} alt="Pedido de venda com a conta a receber já gerada." loading="lazy" />
                  <figcaption>O pedido terminou: a conta a receber já está no financeiro.</figcaption>
                </figure>
                <div className="nv-shots-row">
                  <figure className="nv-shot" style={{ margin: 0 }}>
                    <img src="/nova/expedicao.jpg" width={2160} height={1350} alt="Lista de expedições." loading="lazy" />
                    <figcaption>Expedição com estoque exato</figcaption>
                  </figure>
                  <figure className="nv-shot" style={{ margin: 0 }}>
                    <img src="/nova/notas.jpg" width={2160} height={1350} alt="Lista de notas fiscais eletrônicas." loading="lazy" />
                    <figcaption>NF-e com XML guardado</figcaption>
                  </figure>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 5. áreas */}
        <section id="areas" className="nv-section" aria-labelledby="nv-areas" style={{ paddingTop: 0 }}>
          <div className="nv-wrap">
            <div className="nv-head">
              <span className="nv-eyebrow">As áreas</span>
              <h2 id="nv-areas" className="nv-display">Cada área cuida de um pedaço da mesma operação.</h2>
            </div>
            <div className="nv-areas">
              {AREAS.map((a) => (
                <article key={a.h} className={`nv-area${a.big ? " big" : ""}`}>
                  <div className="pic">
                    <img src={`/nova/${a.img}`} width={2160} height={1350} alt={`Tela de ${a.h} no ATLAS.ERP.`} loading="lazy" />
                  </div>
                  <div className="txt">
                    <h3>{a.h}</h3>
                    <p>{a.p}</p>
                  </div>
                </article>
              ))}
              <article className="nv-area">
                <div className="pic">
                  <img src="/nova/producao.jpg" width={2160} height={1350} alt="Ordens de produção no ATLAS.ERP." loading="lazy" />
                </div>
                <div className="txt">
                  <h3>Produção, qualidade e ativos</h3>
                  <p>Ordens de produção com consumo e custo, inspeções, não conformidades e manutenção.</p>
                </div>
              </article>
            </div>

            <div className="nv-levels" style={{ marginTop: 96 }}>
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
          </div>
        </section>

        {/* ------------------------------------------------ 6. final */}
        <section className="nv-final" aria-labelledby="nv-final-t">
          <div className="nv-glow" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="nv-grain" aria-hidden="true" />
          <div className="nv-wrap nv-final-in">
            <h2 id="nv-final-t" className="nv-display">
              Amanhã, às 11h50, o seu celular pode estar <em>em silêncio.</em>
            </h2>
            <LiveLeak prefix="Enquanto isso, hoje já escaparam" />
            <div className="nv-ctas">
              <a className="nv-btn nv-btn-fire" href="#contato">
                Quero o meu diagnóstico <Arrow />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="nv-foot">
        <div className="nv-wrap">
          <span>© ATLAS.ERP</span>
          <span>Os valores da calculadora são estimativas, com a conta mostrada na tela.</span>
        </div>
      </footer>
    </div>
  );
}
