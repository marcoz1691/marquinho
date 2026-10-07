import { test, expect, abrirPortada, datos } from "./fixtures.js";

// Valores esperados calculados a mano: SBU 2026 = $482, IVA 15 %.
const resultado = async (page, total, base, iva) => {
  await expect(page.locator("#rTotal")).toHaveText(total);
  if (base) await expect(page.locator("#rBase")).toHaveText(base);
  if (iva) await expect(page.locator("#rIva")).toHaveText(iva);
};

test.describe("Calculadora de tarifas", () => {
  test.beforeEach(async ({ page }) => {
    await abrirPortada(page);
    await page.locator("#calculadora").scrollIntoViewIfNeeded();
  });

  test("CF-50 muestra el año de tarifas y el SBU vigente", async ({ page }) => {
    await expect(page.locator("#anioTarifa")).toHaveText("2026");
    await expect(page.locator("#sbuTxt")).toHaveText("$482,00");
  });

  test("CF-51 lista solo trámites con tarifa calculable, agrupados por categoría", async ({ page }) => {
    const calculables = datos.tramites.filter((t) => t.tarifa.tipo !== "consultar");
    await expect(page.locator("#calcTramite option")).toHaveCount(calculables.length);
    await expect(page.locator("#calcTramite option[value=arrendamiento]")).toHaveCount(0);
    await expect(page.locator("#calcTramite optgroup").first()).toHaveAttribute("label", "Poderes");
  });

  test("CF-52 calcula una tarifa porcentual del SBU con IVA", async ({ page }) => {
    await page.selectOption("#calcTramite", "poder-natural");
    await resultado(page, "$66,52", "$57,84", "$8,68");
    await expect(page.locator("#calcMontoWrap")).toBeHidden();
    await expect(page.locator("#calcQtyWrap")).toBeHidden();
  });

  test("CF-53 multiplica por cantidad en tarifas 'por unidad'", async ({ page }) => {
    await page.selectOption("#calcTramite", "salida-pais");
    await expect(page.locator("#calcQtyWrap")).toBeVisible();
    await expect(page.locator("#calcUnit")).toHaveText("(por menor)");
    await resultado(page, "$27,72", "$24,10", "$3,62");
    await page.fill("#calcQty", "2");
    await resultado(page, "$55,43", "$48,20", "$7,23");
  });

  test("CF-54 calcula tarifas fijas por hoja", async ({ page }) => {
    await page.selectOption("#calcTramite", "copias-certificadas");
    await page.fill("#calcQty", "2");
    await resultado(page, "$4,12", "$3,58", "$0,54");
  });

  test("CF-55 una cantidad vacía, cero o negativa cuenta como 1", async ({ page }) => {
    await page.selectOption("#calcTramite", "salida-pais");
    for (const v of ["", "0", "-3"]) {
      await page.fill("#calcQty", v);
      await resultado(page, "$27,72");
    }
  });

  test("CF-56 por cuantía pide el valor del contrato antes de calcular", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await expect(page.locator("#calcMontoWrap")).toBeVisible();
    await resultado(page, "-", "-", "-");
    await expect(page.locator("#calcNote")).toHaveText("Ingresa el valor del contrato o del avalúo.");
  });

  test("CF-57 por cuantía aplica el rango de la tabla de transferencias", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "85000");
    // $60.000,01 a $90.000 = 0,8 SBU = $385,60
    await resultado(page, "$443,44", "$385,60", "$57,84");
    await expect(page.locator("#calcNote")).toContainText("Rango $60.000,01 a $90.000,00: 0,8 SBU.");
  });

  test("CF-58 el límite superior de un rango pertenece a ese rango", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "10000");
    await resultado(page, "$110,86", "$96,40");
    await page.fill("#calcMonto", "10000.01");
    await expect(page.locator("#rBase")).toHaveText("$168,70");
  });

  test("CF-66 el IVA se redondea al centavo hacia arriba en la mitad ($25,305 → $25,31)", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "20000");
    await resultado(page, "$194,01", "$168,70", "$25,31");
  });

  test("CF-59 acepta el monto escrito con comas de miles (85,000)", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "85,000");
    await resultado(page, "$443,44");
  });

  test("CF-60 acepta el monto escrito como lo muestra la propia web (85.000)", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "85.000");
    await resultado(page, "$443,44");
  });

  test("CF-61 acepta el monto con miles y decimales (1.250.000,50)", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "1.250.000,50");
    // $1.000.000,01 a $2.000.000 = 10 SBU = $4.820
    await resultado(page, "$5.543,00", "$4.820,00");
  });

  test("CF-62 el último rango sin tope se describe como 'desde'", async ({ page }) => {
    await page.selectOption("#calcTramite", "compraventa");
    await page.fill("#calcMonto", "5000000");
    await resultado(page, "$11.086,00", "$9.640,00");
    await expect(page.locator("#calcNote")).toContainText("Rango desde $3.000.000,01: 20 SBU.");
  });

  test("CF-63 fuera de la tabla de sociedades pide consultar con la notaría", async ({ page }) => {
    await page.selectOption("#calcTramite", "constitucion-compania");
    await page.fill("#calcMonto", "2000000");
    await resultado(page, "-", "-", "-");
    await expect(page.locator("#calcNote")).toHaveText("Para este valor, consulta con la notaría.");
  });

  test("CF-64 usa la tabla correcta según el trámite (hipoteca)", async ({ page }) => {
    await page.selectOption("#calcTramite", "hipoteca");
    await page.fill("#calcMonto", "85000");
    // 0,54 SBU = $260,28
    await resultado(page, "$299,32", "$260,28");
  });

  test("CF-65 la nota del trámite se muestra bajo el resultado", async ({ page }) => {
    await page.selectOption("#calcTramite", "poder-natural");
    await expect(page.locator("#calcNote")).toHaveText("Cada otorgante adicional suma 3% del SBU.");
  });

  test.describe("Documentos habilitantes", () => {
    const hab = (page, id) => page.locator(`[data-hab="${id}"]`);
    const mas = (page, id) => hab(page, id).locator("[data-mas]");
    const menos = (page, id) => hab(page, id).locator("[data-menos]");
    const hojas = (page, id) => hab(page, id).locator("input");

    test("CF-67 muestra cada habilitante con su precio por hoja y en cero", async ({ page }) => {
      await expect(page.locator("#calc")).toContainText("Documentos habilitantes");
      await expect(hab(page, "copias")).toContainText("Copias certificadas o compulsas");
      await expect(hab(page, "copias")).toContainText("$1,79 + IVA por hoja");
      await expect(hab(page, "materializaciones")).toContainText("$1,34 + IVA por hoja");
      await expect(hojas(page, "copias")).toHaveValue("0");
      await expect(mas(page, "copias")).toHaveAccessibleName("Agregar una hoja de copias certificadas o compulsas");
      await expect(menos(page, "copias")).toHaveAccessibleName("Quitar una hoja de copias certificadas o compulsas");
    });

    test("CF-68 un poder más 2 copias certificadas suma $70,64", async ({ page }) => {
      await page.selectOption("#calcTramite", "poder-natural");
      await expect(page.locator("#rHabWrap")).toBeHidden();
      await mas(page, "copias").click();
      await mas(page, "copias").click();
      await expect(hojas(page, "copias")).toHaveValue("2");
      await resultado(page, "$70,64", "$57,84", "$9,22");
      await expect(page.locator("#rHabWrap")).toBeVisible();
      await expect(page.locator("#rHab")).toHaveText("$3,58");
      await expect(page.locator("#calc .calc__total span")).toHaveText("Total estimado");
    });

    test("CF-69 agregar una materialización actualiza el total", async ({ page }) => {
      await page.selectOption("#calcTramite", "poder-natural");
      await mas(page, "materializaciones").click();
      // $57,84 + $1,34 de base; IVA $8,68 + $0,20 = $8,88
      await resultado(page, "$68,06", "$57,84", "$8,88");
      await expect(page.locator("#rHab")).toHaveText("$1,34");
    });

    test("CF-152 quitar hojas nunca baja de cero y lo escrito se acota a 0–200", async ({ page }) => {
      await page.selectOption("#calcTramite", "poder-natural");
      await menos(page, "copias").click();
      await expect(hojas(page, "copias")).toHaveValue("0");
      await mas(page, "copias").click();
      await menos(page, "copias").click();
      await menos(page, "copias").click();
      await expect(hojas(page, "copias")).toHaveValue("0");
      await resultado(page, "$66,52");
      await hojas(page, "copias").fill("999");
      await hojas(page, "copias").blur();
      await expect(hojas(page, "copias")).toHaveValue("200");
      await hojas(page, "copias").fill("-5");
      await hojas(page, "copias").blur();
      await expect(hojas(page, "copias")).toHaveValue("0");
      await resultado(page, "$66,52");
    });

    test("CF-153 el aviso cambia cuando se agregan habilitantes", async ({ page }) => {
      await page.selectOption("#calcTramite", "poder-natural");
      await expect(page.locator("#calcAviso")).toHaveText(/no incluye documentos habilitantes/);
      await mas(page, "copias").click();
      await expect(page.locator("#calcAviso")).toHaveText("Incluye los documentos habilitantes que agregaste; se cobran por hoja.");
      await menos(page, "copias").click();
      await expect(page.locator("#calcAviso")).toHaveText(/no incluye documentos habilitantes/);
      await expect(page.locator("#calcNote")).toHaveText("Cada otorgante adicional suma 3% del SBU.");
    });

    test("CF-154 elegir un trámite desde su ficha reinicia los habilitantes", async ({ page }) => {
      await page.selectOption("#calcTramite", "poder-natural");
      await mas(page, "copias").click();
      await mas(page, "materializaciones").click();
      await page.locator('#lista [data-sel="divorcio"]').click();
      await page.locator("#detalleTramite").getByRole("button", { name: "Calcular costo" }).click();
      await expect(page.locator("#calcTramite")).toHaveValue("divorcio");
      await expect(hojas(page, "copias")).toHaveValue("0");
      await expect(hojas(page, "materializaciones")).toHaveValue("0");
      await expect(page.locator("#rTotal")).toHaveText("$216,18");
      await expect(page.locator("#rHabWrap")).toBeHidden();
    });

    test("CF-155 la ficha del trámite aclara que no incluye documentos habilitantes", async ({ page }) => {
      await expect(page.locator("#detalleTramite .tp__aviso")).toContainText("no incluye documentos habilitantes");
    });

    test("CF-156 en las propias copias certificadas no hay aviso ni se ofrece sumarlas otra vez", async ({ page }) => {
      await page.locator('#lista [data-sel="copias-certificadas"]').click();
      await expect(page.locator("#detalleTramite .tp__nombre")).toHaveText("Copias certificadas");
      await expect(page.locator("#detalleTramite .tp__aviso")).toHaveCount(0);
      await page.selectOption("#calcTramite", "copias-certificadas");
      await expect(page.locator('[data-hab="copias"]')).toBeHidden();
      await expect(page.locator('[data-hab="materializaciones"]')).toBeVisible();
      await expect(page.locator("#calcAviso")).toBeHidden();
      await mas(page, "materializaciones").click();
      await expect(page.locator("#calcAviso")).toContainText("Incluye los documentos habilitantes");
    });
  });
});
