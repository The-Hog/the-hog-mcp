import { z } from 'zod/v4';
import { entityFiltersSchema } from '../schemas.js';

export const operationIdField = {
  id: z.string().min(1).describe('Operation, enrichment, search, or monitor ID.'),
};

export const searchBodyShape = {
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
  includeSignals: z.boolean().optional(),
  filters: entityFiltersSchema.optional(),
};

export const socialLimit = (max: number, description: string) =>
  z.number().int().min(1).max(max).optional().describe(description);
