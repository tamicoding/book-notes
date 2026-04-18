import { expect, test } from "@playwright/test";

function uniqueEmail(label) {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
}

test("user can register, log out and log back in", async ({ page }) => {
  const email = uniqueEmail("register");

  await page.goto("/register");
  await page.locator('input[name="name"]').fill("Tamiris");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("segredo123");
  await page.getByRole("button", { name: "Registrar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".header-user span")).toContainText("Olá, Tamiris");

  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("segredo123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".header-user span")).toContainText("Olá, Tamiris");
});

test("user can request password reset and sign in with the new password", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("reset");

  await page.goto("/register");
  await page.locator('input[name="name"]').fill("Leitora");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("senha-antiga");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Gerar link" }).click();

  await expect(page.getByText(/enviamos um link de redefinição/i)).toBeVisible();

  const resetLinkResponse = await request.get(`/__test__/reset-link?email=${encodeURIComponent(email)}`);
  const { resetLink } = await resetLinkResponse.json();

  await page.goto(resetLink);
  await page.locator('input[name="password"]').fill("nova-senha123");
  await page.locator('input[name="confirmPassword"]').fill("nova-senha123");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();

  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(page.getByText(/senha redefinida com sucesso/i)).toBeVisible();

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("nova-senha123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".header-user span")).toContainText("Olá, Leitora");
});

test("user can create, edit, search and delete a book from the UI", async ({ page }) => {
  const email = uniqueEmail("books");

  await page.goto("/register");
  await page.locator('input[name="name"]').fill("Maria");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("minhasenha");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: "Adicionar livro" }).click();
  await page.locator('input[name="title"]').fill("Dom Casmurro");
  await page.locator('input[name="author"]').fill("Machado de Assis");
  await page.locator('textarea[name="notes"]').fill("Clássico brasileiro");
  await page.locator('input[name="rating"]').fill("5");
  await page.locator('input[name="read_date"]').fill("2026-04-18");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page).toHaveURL(/status=created/);
  await expect(page.getByText("Livro adicionado com sucesso.")).toBeVisible();
  await expect(page.getByText("Dom Casmurro")).toBeVisible();

  await page.getByRole("link", { name: "Editar" }).first().click();
  await page.locator('input[name="title"]').fill("Dom Casmurro Revisado");
  await page.locator('textarea[name="notes"]').fill("Relido em 2026");
  await page.locator('input[name="rating"]').fill("4");
  await page.getByRole("button", { name: "Atualizar" }).click();

  await expect(page).toHaveURL(/status=updated/);
  await expect(page.getByText("Livro atualizado com sucesso.")).toBeVisible();
  await expect(page.getByText("Dom Casmurro Revisado")).toBeVisible();

  await page.getByPlaceholder("Pesquisar título ou autor").fill("revisado");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Dom Casmurro Revisado")).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Excluir" }).first().click();
  await expect(page.getByRole("heading", { name: "Excluir livro" })).toBeVisible();
  await page.getByRole("button", { name: "Sim, excluir" }).click();

  await expect(page).toHaveURL(/status=deleted/);
  await expect(page.getByText("Livro removido com sucesso.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sua estante ainda está vazia" })).toBeVisible();
});
