# Manual oficial do EDUCA.ERP

| Documento | Para quem |
|---|---|
| [Manual do Usuário](MANUAL_DO_USUARIO.md) | Quem usa o ERP no dia a dia: navegação, módulos, cadastros, pedidos, painéis. |
| [Manual de Administração](MANUAL_DE_ADMINISTRACAO.md) | Administrador da empresa (usuários, convites, papéis, RBAC) e Owner/Admin da plataforma (Administração Central). |
| [Cobertura do manual](MANUAL_COVERAGE.md) | Matriz funcionalidade × documentação × captura × fluxo validado, e os problemas encontrados. |

- **Versão documentada:** interface redesenhada (`claude/educa-redesign`) em modo PostgreSQL/Neon Auth, verificada em ambiente local de QA em 27/09/2026. A produção ainda usa a interface anterior.
- **Imagens:** `assets/<módulo>/*.webp`, capturadas da aplicação real com dados fictícios. Nenhum segredo ou dado de cliente aparece nas figuras; o código de convite foi ocultado.
- **Regra editorial:** só está descrito como disponível o que foi aberto e, quando possível, executado na interface. O que existe só por API, o que falhou e o que não foi executado está marcado no texto.
