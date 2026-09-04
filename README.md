# Educa ERP — Logístico

Sistema de gestão empresarial e operações logísticas.

## Fase 1 — Estrutura inicial dos módulos

Esta fase entrega a estrutura visual e de navegação completa do ERP: menu
lateral, dashboard inicial e as telas principais de todos os módulos
previstos, utilizando dados simulados. Não há banco de dados definitivo,
autenticação real, integrações externas ou emissão fiscal real nesta etapa.

### Módulos

Dashboard · Cadastros · Comercial · Suprimentos · Logística · Financeiro ·
Fiscal · Gestão · Configurações

### Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4
- [Recharts](https://recharts.org) para os gráficos do dashboard
- [lucide-react](https://lucide.dev) para ícones
- Fontes: [Inter](https://fonts.google.com/specimen/Inter) (texto) e
  [Supreme](https://www.fontshare.com/fonts/supreme) (títulos e destaques)

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # build de produção
npm run lint    # eslint
```

## Estrutura do projeto

```
src/
  app/                  rotas (App Router) — uma pasta por módulo/submódulo
  components/
    layout/              Sidebar, Topbar, AppShell
    ui/                   componentes reutilizáveis (tabela, filtros, cards, etc.)
    dashboard/            gráficos do dashboard
    ModulePage.tsx        template genérico usado por todas as telas de listagem
    ModuleLanding.tsx     template das páginas iniciais de cada módulo
  lib/
    nav.ts                estrutura do menu lateral
    pages/                configuração (título, filtros, colunas) de cada tela
    mock/                 geradores de dados simulados
```

A arquitetura foi pensada para receber, nas próximas fases, integração com
banco de dados e regras de negócio reais sem necessidade de reconstrução:
os dados hoje mockados em `src/lib/mock` e `src/lib/pages` são o ponto de
substituição por chamadas a uma API/backend.
