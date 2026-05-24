export type {
  HttpMethod,
  TheHogRequest,
  TheHogResponse,
  TheHogToolClient,
} from './client/thehog-client.js';

export { registerToolDefinitions } from './tools/register.js';
export type {
  RegisterToolDefinitionsOptions,
  ToolClientProvider,
  ToolRequestContext,
} from './tools/register.js';
export type {
  McpToolDefinition,
  ToolInput,
  ToolShape,
} from './tools/types.js';

export { primitiveTools } from './tools/primitives/definitions.js';
export type { PublicPrimitiveToolName } from './tools/primitives/definitions.js';
export { registerPrimitiveTools } from './tools/primitives/register.js';
export type {
  PrimitiveToolDefinition,
} from './tools/primitives/types.js';

export { workflowTools } from './tools/workflows/definitions.js';
export { registerWorkflowTools } from './tools/workflows/register.js';
export type {
  WorkflowContext,
  WorkflowStepResult,
  WorkflowToolDefinition,
  WorkflowWarning,
} from './tools/workflows/types.js';
