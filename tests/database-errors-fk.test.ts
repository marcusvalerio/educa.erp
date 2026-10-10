// translatePostgresError: violação de FK numa GRAVAÇÃO (id relacionado que não
// existe na empresa — inclusive de outra empresa, 0091) é 422 sem texto
// técnico; numa EXCLUSÃO continua 409 (há vínculos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { translatePostgresError } from "@/lib/database/errors";

test("FK na gravação → 422 RELATED_NOT_FOUND, sem nome de constraint nem id", () => {
  const e = translatePostgresError({
    code: "23503",
    message: 'insert or update on table "unit_conversions" violates foreign key constraint "unit_conversions_to_unit_id_same_company_fk"',
    details: "Key (to_unit_id, company_id)=(11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222) is not present in table \"units\".",
  });
  assert.equal(e.status, 422);
  assert.equal(e.code, "RELATED_NOT_FOUND");
  assert.doesNotMatch(e.message, /unit_conversions|constraint|1111|2222/);
});

test("FK na exclusão → 409 HAS_DEPENDENTS (inalterado)", () => {
  const e = translatePostgresError({ code: "23503", message: 'update or delete on table "units" violates foreign key constraint "products_unit_id_fkey" on table "products"' });
  assert.equal(e.status, 409);
  assert.equal(e.code, "HAS_DEPENDENTS");
});
