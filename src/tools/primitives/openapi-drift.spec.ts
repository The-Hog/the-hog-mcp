import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { primitiveTools } from "./definitions.js";

const PUBLIC_OPENAPI_URL = "https://docs.thehog.ai/api-reference/openapi.json";
const OPENAPI_DRIFT_ENABLED =
  process.env.THEHOG_RUN_OPENAPI_DRIFT === "1" ||
  Boolean(
    process.env.THEHOG_OPENAPI_SPEC_PATH || process.env.THEHOG_OPENAPI_SPEC_URL,
  );
const OPENAPI_SKIP_REASON =
  "Set THEHOG_RUN_OPENAPI_DRIFT=1 to run live OpenAPI drift checks.";
const CONTROL_INPUT_KEYS = new Set([
  "waitForResult",
  "timeoutSeconds",
  "idempotencyKey",
  "correlationKey",
  "confirm",
]);

test(
  "primitive tools match the public OpenAPI operation allowlist",
  { skip: OPENAPI_DRIFT_ENABLED ? false : OPENAPI_SKIP_REASON },
  async () => {
    const spec = await loadPublicOpenApi();
    const publicOperations = new Set<string>();
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of Object.keys(pathItem)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          publicOperations.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    const toolOperations = new Set(
      primitiveTools.map(
        (tool) => `${tool.endpoint.method} ${tool.endpoint.path}`,
      ),
    );

    assert.deepEqual([...toolOperations].sort(), [...publicOperations].sort());
  },
);

test(
  "primitive tool request inputs match the public OpenAPI request shapes",
  { skip: OPENAPI_DRIFT_ENABLED ? false : OPENAPI_SKIP_REASON },
  async () => {
    const spec = await loadPublicOpenApi();

    for (const tool of primitiveTools) {
      const operation = readOperation(
        spec,
        tool.endpoint.method,
        tool.endpoint.path,
      );
      const pathParams = parameterNames(operation, "path");
      const queryParams = parameterNames(operation, "query");
      const requestShapes = requestShapeByName(spec, operation);
      const bodyKeys = namesForLocation(requestShapes, "body");
      const inputKeys = Object.keys(tool.inputSchema);

      assert.equal(
        inputKeys.some((key) => /^project_?id$/i.test(key)),
        false,
        `${tool.name} must not expose project ID compatibility fields`,
      );

      for (const key of pathParams) {
        assert.equal(
          inputKeys.includes(key),
          true,
          `${tool.name} must expose OpenAPI path parameter ${key}`,
        );
      }

      for (const [key, shape] of requestShapes) {
        if (isInternalCompatibilityField(key)) {
          continue;
        }
        if (shape.required) {
          assert.equal(
            inputKeys.includes(key),
            true,
            `${tool.name} must expose required OpenAPI ${shape.location} field ${key}`,
          );
        }
      }

      const requestKeys = inputKeys.filter(
        (key) => !CONTROL_INPUT_KEYS.has(key) && !pathParams.has(key),
      );

      if (
        ["POST", "PUT", "PATCH"].includes(tool.endpoint.method) &&
        requestKeys.length > 0
      ) {
        assert.equal(
          bodyKeys.size > 0,
          true,
          `${tool.endpoint.method} ${tool.endpoint.path} must expose a JSON request body in public OpenAPI`,
        );
      }
      for (const key of requestKeys) {
        const shape = requestShapes.get(key);
        assert.ok(
          shape,
          `${tool.name} input ${key} must exist in OpenAPI request body or query parameters`,
        );
        assertCompatibleSchema(
          tool.name,
          key,
          tool.inputSchema[key],
          shape.schema,
        );
      }
    }
  },
);

async function loadPublicOpenApi(): Promise<OpenApiSpec> {
  if (process.env.THEHOG_OPENAPI_SPEC_PATH) {
    return JSON.parse(
      await readFile(process.env.THEHOG_OPENAPI_SPEC_PATH, "utf8"),
    ) as OpenApiSpec;
  }
  const url = process.env.THEHOG_OPENAPI_SPEC_URL ?? PUBLIC_OPENAPI_URL;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true, `Failed to fetch ${url}: ${response.status}`);
  return (await response.json()) as OpenApiSpec;
}

function readOperation(
  spec: OpenApiSpec,
  method: string,
  path: string,
): OpenApiOperation {
  const operation = spec.paths[path]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation ${method} ${path}`);
  return operation;
}

function parameterNames(
  operation: OpenApiOperation,
  location: OpenApiParameterLocation,
): Set<string> {
  return new Set(
    (operation.parameters ?? [])
      .filter((parameter) => parameter.in === location)
      .map((parameter) => parameter.name),
  );
}

function requestShapeByName(
  spec: OpenApiSpec,
  operation: OpenApiOperation,
): Map<string, RequestShape> {
  const shapes = new Map<string, RequestShape>();
  for (const parameter of operation.parameters ?? []) {
    if (parameter.in === "path" || parameter.in === "query") {
      shapes.set(parameter.name, {
        location: parameter.in,
        required: parameter.required === true || parameter.in === "path",
        schema: parameter.schema ?? {},
      });
    }
  }

  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (schema) {
    const bodySchema = resolveSchema(spec, schema, new Set());
    const required = new Set(bodySchema.required ?? []);
    for (const [name, propertySchema] of Object.entries(
      bodySchema.properties ?? {},
    )) {
      shapes.set(name, {
        location: "body",
        required: required.has(name),
        schema: propertySchema,
      });
    }
    for (const variant of [
      ...(bodySchema.allOf ?? []),
      ...(bodySchema.anyOf ?? []),
      ...(bodySchema.oneOf ?? []),
    ]) {
      for (const [name, shape] of requestShapeByName(spec, {
        requestBody: { content: { "application/json": { schema: variant } } },
      })) {
        shapes.set(name, shape);
      }
    }
  }

  return shapes;
}

function namesForLocation(
  shapes: Map<string, RequestShape>,
  location: OpenApiParameterLocation,
): Set<string> {
  return new Set(
    [...shapes.entries()]
      .filter(([, shape]) => shape.location === location)
      .map(([name]) => name),
  );
}

function resolveSchema(
  spec: OpenApiSpec,
  schema: OpenApiSchema,
  seen: Set<string>,
): OpenApiSchema {
  if (!schema.$ref) return schema;
  if (seen.has(schema.$ref)) return {};
  seen.add(schema.$ref);
  const schemaName = schema.$ref.replace("#/components/schemas/", "");
  return resolveSchema(
    spec,
    spec.components?.schemas?.[schemaName] ?? {},
    seen,
  );
}

function assertCompatibleSchema(
  toolName: string,
  key: string,
  zodSchema: unknown,
  openApiSchema: OpenApiSchema,
): void {
  const zodShape = readZodShape(zodSchema);
  const openApiShape = readOpenApiShape(openApiSchema);
  if (openApiShape.types.size > 0 && zodShape.types.size > 0) {
    assert.equal(
      intersects(zodShape.types, openApiShape.types),
      true,
      `${toolName} input ${key} type ${[...zodShape.types].join("|")} must be compatible with OpenAPI type ${[...openApiShape.types].join("|")}`,
    );
  }
  if (openApiShape.enumValues.length > 0 && zodShape.enumValues.length > 0) {
    assert.deepEqual(
      [...zodShape.enumValues].sort(),
      [...openApiShape.enumValues].sort(),
      `${toolName} input ${key} enum values must match OpenAPI`,
    );
  }
}

function readOpenApiShape(schema: OpenApiSchema): SchemaShape {
  const types = new Set<string>();
  const rawTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  for (const type of rawTypes) {
    if (type === "integer") {
      types.add("number");
    } else if (type !== "null") {
      types.add(type);
    }
  }
  return {
    types,
    enumValues: (schema.enum ?? []).filter(
      (value): value is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof value),
    ),
  };
}

function readZodShape(schema: unknown): SchemaShape {
  const inner = unwrapZod(schema);
  const def = zodDef(inner);
  switch (def?.type) {
    case "string":
      return { types: new Set(["string"]), enumValues: [] };
    case "number":
      return { types: new Set(["number"]), enumValues: [] };
    case "boolean":
      return { types: new Set(["boolean"]), enumValues: [] };
    case "array":
      return { types: new Set(["array"]), enumValues: [] };
    case "object":
    case "record":
      return { types: new Set(["object"]), enumValues: [] };
    case "enum":
      return {
        types: new Set(["string"]),
        enumValues: Object.values(def.entries ?? {}).filter(
          (value): value is string | number | boolean =>
            ["string", "number", "boolean"].includes(typeof value),
        ),
      };
    case "literal": {
      const values = (def.values ?? []).filter(
        (value): value is string | number | boolean =>
          ["string", "number", "boolean"].includes(typeof value),
      );
      return {
        types: new Set(values.map((value) => typeof value)),
        enumValues: values,
      };
    }
    case "unknown":
      return { types: new Set(), enumValues: [] };
    default:
      return { types: new Set(), enumValues: [] };
  }
}

function unwrapZod(schema: unknown): unknown {
  let current = schema;
  for (let index = 0; index < 8; index += 1) {
    const def = zodDef(current);
    if (
      def?.type === "optional" ||
      def?.type === "nullable" ||
      def?.type === "default" ||
      def?.type === "catch"
    ) {
      current = def.innerType;
      continue;
    }
    return current;
  }
  return current;
}

function zodDef(schema: unknown): ZodDef | null {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  const candidate = schema as { _def?: ZodDef; def?: ZodDef };
  return candidate._def ?? candidate.def ?? null;
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function isInternalCompatibilityField(key: string): boolean {
  return /^project_?id$/i.test(key);
}

interface OpenApiSpec {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

interface OpenApiOperation {
  parameters?: Array<{
    in: OpenApiParameterLocation;
    name: string;
    required?: boolean;
    schema?: OpenApiSchema;
  }>;
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: OpenApiSchema;
      };
    };
  };
}

type OpenApiParameterLocation = "path" | "query" | "header" | "cookie" | "body";

interface OpenApiSchema {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
}

interface RequestShape {
  location: OpenApiParameterLocation;
  required: boolean;
  schema: OpenApiSchema;
}

interface SchemaShape {
  types: Set<string>;
  enumValues: Array<string | number | boolean>;
}

interface ZodDef {
  type?: string;
  innerType?: unknown;
  entries?: Record<string, unknown>;
  values?: unknown[];
}
