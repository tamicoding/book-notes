import { z } from "zod";

import { ValidationError } from "../utils/validation.js";

const trimmedString = z.string().trim();
const optionalTrimmedString = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value) => (typeof value === "string" ? value.trim() : ""));

const emailField = trimmedString
  .toLowerCase()
  .email("Informe um email válido.");

const passwordField = z
  .string()
  .min(6, "A senha deve ter pelo menos 6 caracteres.");

const dateField = optionalTrimmedString.superRefine((value, ctx) => {
  if (value && Number.isNaN(Date.parse(value))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data de leitura é inválida.",
    });
  }
});

const ratingField = optionalTrimmedString.transform((value, ctx) => {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A nota precisa ser um número inteiro entre 0 e 5.",
    });
    return z.NEVER;
  }

  return parsed;
});

export const registerSchema = z.object({
  name: trimmedString.min(1, "Informe seu nome."),
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: trimmedString.toLowerCase().email("Informe email e senha válidos."),
  password: z.string().min(1, "Informe email e senha válidos."),
});

export const forgotPasswordSchema = z.object({
  email: trimmedString.toLowerCase().email("Digite um email válido."),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "Senha muito curta (mínimo 6 caracteres)."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const bookSchema = z.object({
  title: trimmedString.min(1, "O título é obrigatório."),
  author: optionalTrimmedString,
  notes: optionalTrimmedString,
  rating: ratingField,
  read_date: dateField,
});

export const searchSchema = z.object({
  q: optionalTrimmedString,
});

export function parseWithSchema(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(issue?.message || "Dados inválidos.", result.error.issues);
  }

  return result.data;
}
