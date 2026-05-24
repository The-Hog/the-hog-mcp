import type { McpToolDefinition } from '../types.js';

export type WorkflowToolDefinition = McpToolDefinition;

export interface WorkflowWarning {
  step: string;
  message: string;
  asyncId?: string;
  error?: Record<string, unknown>;
}

export interface WorkflowStepResult {
  initial?: unknown;
  final?: unknown;
  requestId: string | null;
  asyncId: string | null;
  timedOut?: boolean;
  pollAttempts?: number;
}

export interface WorkflowContext {
  name: string;
  warnings: WorkflowWarning[];
  childOperationIds: string[];
  requestIds: string[];
}
