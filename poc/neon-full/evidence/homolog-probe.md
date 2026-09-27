# Sonda da homologação no runner do GitHub (2026-09-27)

Esta sessão não alcança `*.vercel.app` nem `*.neon.tech` (política de rede: 403 no
proxy). A sonda (`homolog/probe-preview.mjs`) rodou no runner do GitHub Actions,
que tem internet, pelo workflow `homolog-probe`. Ela não usa segredos e não grava
nada: só GET e um POST de login vindo de outra origem, que o app recusa antes de
falar com qualquer provedor.

| Execução | Commit | Resultado |
|---|---|---|
| [run 36288828502](https://github.com/marcusvalerio/educa.erp/actions/runs/36288828502) | `3f6453f` | Preview respondeu 302 em tudo e a sonda registrou "proteção: não" (bug da sonda: só procurava 401). Corrigido em `05e683e` |
| [run 36289159365](https://github.com/marcusvalerio/educa.erp/actions/runs/36289159365) | `efaaca3` | saída abaixo |

```
## preview: https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app
- GET /login → 302; redireciona para https://vercel.com/sso-api; borda: sfo1
- Deployment Protection da Vercel: SIM (Vercel Authentication; o E2E precisa de VERCEL_BYPASS_TOKEN ou da proteção desligada para este Preview)
- Neon Auth https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth /ok → 200
## produção (só leitura): https://educaerp.vercel.app
- GET /login → 200; borda: sfo1
- Deployment Protection da Vercel: não
- Neon Auth https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth /ok → 200
- GET /api/session/context sem cookie → 401 {"success":false,"error":{"code":"UNAUTHORIZED","message":"Autenticação necessária."}}; borda/função: sfo1 → iad1
- POST /api/auth/sign-in de outra origem → 404 ⇒ AUTH_PROVIDER=supabase
```

## Leitura

| Achado | Classe | Consequência |
|---|---|---|
| O Preview da branch existe (integração Vercel↔GitHub) e está atrás da **Vercel Authentication** | (e) Vercel | nenhum teste externo chega ao app, nem o E2E. Resolver no painel: desligar a proteção só para este Preview, ou criar um *Protection Bypass for Automation* (segredo `VERCEL_BYPASS_TOKEN`) |
| O modo do Preview não pôde ser lido (a proteção barra antes) | (e) Vercel | sem as variáveis de Preview da branch, o build usa as de Preview padrão (modo Supabase) |
| Produção em `AUTH_PROVIDER=supabase`, sem proteção, 401 correto sem sessão | — | confirma que a produção **não foi alterada** |
| **Funções de produção em `iad1` (Washington)**; o banco Neon está em sa-east-1 | (c) infraestrutura | pré-condição nova do cutover: região das funções = `gru1` (runbook passo 5). Com `iad1`, toda consulta faria ida e volta EUA↔São Paulo |
| Neon Auth de homologação e de produção respondem 200 | — | provedores no ar |
| A 1ª versão da sonda não detectava proteção por redirecionamento | (f) teste | corrigido e reexecutado |
