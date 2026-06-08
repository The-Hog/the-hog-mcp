import type { McpToolDefinition } from '../types.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export type WorkflowToolDefinition = McpToolDefinition;

export const workflowToolAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export interface WorkflowWarning {
  step: string;
  message: string;
  asyncId?: string;
  status?: 'still_running';
  nextTool?: string;
  nextInput?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export interface WorkflowStepResult {
  initial?: unknown;
  final?: unknown;
  requestId: string | null;
  asyncId: string | null;
  pollCompleted: boolean;
  timedOut?: boolean;
  pollAttempts?: number;
  nextPollAfterMs?: number;
}

export interface WorkflowContext {
  name: string;
  warnings: WorkflowWarning[];
  childOperationIds: string[];
  requestIds: string[];
}
