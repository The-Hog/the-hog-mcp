import { monitoringWorkflowTools } from './monitoring.js';
import { prospectingWorkflowTools } from './prospecting.js';
import { researchWorkflowTools } from './research.js';
import { socialWorkflowTools } from './social.js';
import type { WorkflowToolDefinition } from './types.js';

export const workflowTools: WorkflowToolDefinition[] = [
  ...prospectingWorkflowTools,
  ...researchWorkflowTools,
  ...monitoringWorkflowTools,
  ...socialWorkflowTools,
];

assertUniqueNames();

function assertUniqueNames(): void {
  const names = workflowTools.map((tool) => tool.name);
  if (new Set(names).size !== names.length) {
    throw new Error('Workflow MCP tool names must be unique.');
  }
}
