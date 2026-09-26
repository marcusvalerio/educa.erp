import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { hashPassword, serviceAccountSql } from "../scripts/neon-service-account.mjs";

describe("conta de serviço do Neon Auth (script de implantação)", () => {
  test("hash no formato do Better Auth (scrypt N=16384 r=16 p=1, salt:hash)", () => {
    const h: string = hashPassword("senha-de-teste");
    assert.match(h, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    const [salt, key] = h.split(":");
    const again = crypto.scryptSync("senha-de-teste", salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
    assert.equal(again, key);
  });
  test("SQL leva só o hash, e-mail normalizado e papel admin", () => {
    const h: string = hashPassword("nunca-no-sql");
    const sql: string = serviceAccountSql(" Svc@Educa.example.com ", h);
    assert.ok(!sql.includes("nunca-no-sql"));
    assert.ok(sql.includes("'svc@educa.example.com'"));
    assert.ok(sql.includes(h));
    assert.match(sql, /role = 'admin'/);
  });
  test("recusa e-mail que quebraria o SQL e hash fora do formato", () => {
    const h: string = hashPassword("x");
    assert.throws(() => serviceAccountSql("a'; drop table x;--@b.co", h), /E-mail inválido/);
    assert.throws(() => serviceAccountSql("svc@educa.example.com", "abc"), /Hash inválido/);
  });
});
