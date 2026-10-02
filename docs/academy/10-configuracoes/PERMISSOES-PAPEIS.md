# Aula 10 — Anexo: permissões dos papéis personalizados

Lista exata das permissões dos papéis **Financeiro**, **Fiscal** e **Logística** usados na homologação (conferida ao vivo em 02/10/2026). É a receita que a Ana marca na matriz de permissões na aula 10. Os códigos são os do catálogo; na matriz eles aparecem agrupados por módulo e recurso.

## Financeiro — 43 permissões

| Recurso | Ações |
|---|---|
| `accounts_payable` | approve, cancel, create, update, view |
| `accounts_receivable` | approve, cancel, create, update, view |
| `bank_reconciliation` | create, update, view |
| `brands` | read |
| `categories` | read |
| `cost_centers` | view |
| `customers` | read |
| `dashboard` | view |
| `financial_accounts` | create, update, view |
| `financial_categories` | create, update, view |
| `financial_reports` | view |
| `financial_transactions` | create, view |
| `payment_terms` | view |
| `payments` | cancel, create, reverse, view |
| `products` | read |
| `receipts` | cancel, create, reverse, view |
| `reports` | view |
| `sales_orders` | view |
| `suppliers` | read |
| `units` | read |
| `warehouse_locations` | read |
| `warehouses` | read |

## Fiscal — 44 permissões

| Recurso | Ações |
|---|---|
| `brands` | read |
| `categories` | read |
| `customers` | read |
| `dashboard` | view |
| `fiscal_cfops` | create, update, view |
| `fiscal_document_events` | create, view |
| `fiscal_document_files` | view |
| `fiscal_document_packages` | view |
| `fiscal_document_references` | view |
| `fiscal_documents` | authorize, calculate, cancel, create, ready, submit_authorization, update, view |
| `fiscal_establishments` | create, update, view |
| `fiscal_ncms` | create, update, view |
| `fiscal_operation_natures` | create, update, view |
| `fiscal_provider_configs` | view |
| `fiscal_reports` | view |
| `fiscal_tax_codes` | view |
| `payment_terms` | view |
| `product_fiscal_profiles` | create, update, view |
| `products` | read |
| `reports` | view |
| `sales_orders` | view |
| `suppliers` | read |
| `tax_rules` | view |
| `units` | read |
| `warehouse_locations` | read |
| `warehouses` | read |

## Logística — 43 permissões

| Recurso | Ações |
|---|---|
| `brands` | read |
| `carriers` | read |
| `categories` | read |
| `customers` | read |
| `dashboard` | view |
| `deliveries` | confirm, create, fail, update, view |
| `drivers` | read |
| `inventory_reports` | view |
| `logistics_reports` | view |
| `payment_terms` | view |
| `pick_lists` | cancel, complete, create, update, view |
| `products` | read |
| `purchase_receipts` | confirm, view |
| `reports` | view |
| `sales_orders` | reserve, view |
| `shipments` | approve, cancel, create, ship, update, view |
| `stock` | count, create, request, transfer, view |
| `suppliers` | read |
| `units` | read |
| `vehicles` | read |
| `warehouse_locations` | create, read, update |
| `warehouses` | read |
