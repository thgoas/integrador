import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DEST_PG_HOST: z.string().default('localhost'),
  DEST_PG_PORT: z.coerce.number().default(5432),
  DEST_PG_DATABASE: z.string().default('powerbi'),
  DEST_PG_USER: z.string().default('postgres'),
  DEST_PG_PASSWORD: z.string().default(''),
  ENCRYPT_KEY: z.string().min(32, 'ENCRYPT_KEY must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  APP_USER: z.string().default('admin'),
  APP_PASSWORD: z.string().min(1).default('admin123'),
})

export const env = schema.parse(process.env)
