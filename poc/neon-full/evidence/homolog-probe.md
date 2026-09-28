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
| [run 36293119479](https://github.com/marcusvalerio/educa.erp/actions/runs/36293119479) | `fdfd931` | sonda com a conferência do Neon Auth de homologação; saída em §Rodada 3 |

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

## Rodada 3 (commit `fdfd931`, run 36293119479)

A sonda passou a conferir a configuração do Neon Auth de homologação com pedidos
que não gravam nada: recuperação para um e-mail inexistente (nenhum e-mail sai) e
cadastro com senha curta demais (nenhuma conta é criada).

```
## preview: https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app
- GET /login → 302; redireciona para https://vercel.com/sso-api; borda: cle1
- Deployment Protection da Vercel: SIM (Vercel Authentication; o E2E precisa de VERCEL_BYPASS_TOKEN ou da proteção desligada para este Preview)
- Neon Auth https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth /ok → 200
- recuperação (origem = Preview, redirect no Preview) → 200  ⇒ OK (e-mail/senha ligado, origem confiável)
- recuperação com redirect de outra origem → 403 INVALID_REDIRECT_URL ⇒ recusado (OK)
- origem localhost → 200  ⇒ allow_localhost LIGADO
- cadastro público (senha inválida, não cria conta) → 400 PASSWORD_TOO_SHORT ⇒ allow_sign_up LIGADO
## produção (só leitura): https://educaerp.vercel.app
- GET /login → 200; borda: cle1
- Deployment Protection da Vercel: não
- Neon Auth https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth /ok → 200
- GET /api/session/context sem cookie → 401 {"success":false,"error":{"code":"UNAUTHORIZED","message":"Autenticação necessária."}}; borda/função: cle1 → iad1
- POST /api/auth/sign-in de outra origem → 404 ⇒ AUTH_PROVIDER=supabase
```

| Achado | Consequência |
|---|---|
| Recuperação de senha no Neon Auth de homologação: 200 com origem e redirect do Preview; 403 para redirect de outra origem | recuperação funciona e as trusted origins seguram redirect externo |
| `allow_localhost` e `allow_sign_up` **ligados** (o mesmo que `get_neon_auth_config` mostra) | ação no Console (o MCP só altera o nome da configuração). A sonda confirma quando mudar |
| Preview continua atrás da Vercel Authentication | E2E não roda até haver bypass ou proteção desligada |
| Produção inalterada: modo Supabase, funções em `iad1` | o `vercel.json` com `gru1` só vale para a produção quando o código chegar à `main` (merge no cutover) |

A mesma sonda, contra a pilha local (dublê com cadastro e localhost desligados),
respondeu "desligado (OK)" nos dois itens. A detecção funciona nos dois sentidos.
