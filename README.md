# The Hog MCP

Run The Hog API from MCP clients such as Claude, Claude Code, Cursor, Codex,
VS Code, and Windsurf.

## Quick Start

Use the API key and API secret from the Credentials page:

```bash
THEHOG_ACCESS_KEY=YOUR_THEHOG_ACCESS_KEY THEHOG_SECRET_KEY=YOUR_THEHOG_SECRET_KEY npx -y @thehog/mcp@latest
```

In the dashboard UI, the public API key is the MCP `THEHOG_ACCESS_KEY`. The API
secret is the MCP `THEHOG_SECRET_KEY`. Both are required for dashboard-created
credentials.

Optional:

```bash
THEHOG_API_BASE_URL=https://developer.thehog.ai
```

The default base URL is `https://developer.thehog.ai`; the server calls API
paths under `/api/...`.

## Client Setup

Most MCP clients can run this server as a local stdio process with `npx` and the
two The Hog credential environment variables. If your client supports
environment-variable interpolation, prefer referencing existing environment
variables instead of writing keys directly into a config file.

### Claude Desktop

For regular Claude chat, use the Claude Desktop app. The claude.ai web app
cannot launch a local stdio command like `npx`; hosted remote MCP connectors are
a different deployment model. Claude Desktop uses a local JSON config file for
MCP servers.

Config locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add The Hog:

```json
{
  "mcpServers": {
    "thehog": {
      "command": "npx",
      "args": ["-y", "@thehog/mcp@latest"],
      "env": {
        "THEHOG_ACCESS_KEY": "YOUR_API_KEY",
        "THEHOG_SECRET_KEY": "YOUR_API_SECRET"
      }
    }
  }
}
```

Restart Claude Desktop after saving the file. If Claude cannot find `npx`, use
the absolute path from `which npx`.

### Claude Code

```bash
claude mcp add thehog \
  -e THEHOG_ACCESS_KEY=YOUR_API_KEY \
  -e THEHOG_SECRET_KEY=YOUR_API_SECRET \
  -- npx -y @thehog/mcp@latest
```

Verify:

```bash
claude mcp list
```

### Cursor

Use either global config at `~/.cursor/mcp.json` or project config at
`.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "thehog": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thehog/mcp@latest"],
      "env": {
        "THEHOG_ACCESS_KEY": "${env:THEHOG_ACCESS_KEY}",
        "THEHOG_SECRET_KEY": "${env:THEHOG_SECRET_KEY}"
      }
    }
  }
}
```

Restart Cursor, then check Settings -> Tools & MCP.

### Codex

```bash
codex mcp add thehog \
  --env THEHOG_ACCESS_KEY=YOUR_API_KEY \
  --env THEHOG_SECRET_KEY=YOUR_API_SECRET \
  -- npx -y @thehog/mcp@latest
```

You can also edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.thehog]
command = "npx"
args = ["-y", "@thehog/mcp@latest"]
enabled = true

[mcp_servers.thehog.env]
THEHOG_ACCESS_KEY = "YOUR_API_KEY"
THEHOG_SECRET_KEY = "YOUR_API_SECRET"
```

Verify:

```bash
codex mcp list
```

### VS Code / GitHub Copilot

VS Code uses `servers` instead of `mcpServers`. Add this to workspace
`.vscode/mcp.json` or to your user MCP configuration:

```json
{
  "servers": {
    "thehog": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thehog/mcp@latest"],
      "env": {
        "THEHOG_ACCESS_KEY": "${input:thehog-api-key}",
        "THEHOG_SECRET_KEY": "${input:thehog-api-secret}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "thehog-api-key",
      "description": "The Hog API key",
      "password": true
    },
    {
      "type": "promptString",
      "id": "thehog-api-secret",
      "description": "The Hog API secret",
      "password": true
    }
  ]
}
```

Use the Command Palette commands `MCP: Open User Configuration`,
`MCP: Open Workspace Folder MCP Configuration`, and `MCP: List Servers` to edit
and verify the server.

### Windsurf

Add this to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "thehog": {
      "command": "npx",
      "args": ["-y", "@thehog/mcp@latest"],
      "env": {
        "THEHOG_ACCESS_KEY": "${env:THEHOG_ACCESS_KEY}",
        "THEHOG_SECRET_KEY": "${env:THEHOG_SECRET_KEY}"
      }
    }
  }
}
```

Refresh MCP servers from Cascade after saving.

## Authentication

Dashboard-created credentials require both `THEHOG_ACCESS_KEY` and
`THEHOG_SECRET_KEY`. Do not commit config files that contain real credentials.
Prefer user-level MCP configuration for personal credentials, or use your
client's environment-variable or secret-input support where available.

## Library API

The package also exports its public tool definitions and registration helpers for
advanced integrations that need to provide their own client resolution:

```ts
import {
  primitiveTools,
  registerToolDefinitions,
  workflowTools,
  type TheHogToolClient,
} from '@thehog/mcp';

registerToolDefinitions(server, [...primitiveTools, ...workflowTools], {
  getClient: async (context): Promise<TheHogToolClient> => {
    return clientForCurrentRequest(context);
  },
});
```

`TheHogToolClient` is the minimal interface used by tools: `request()` plus
`createIdempotencyKey()`. Hosted or embedded integrations should resolve it per
tool call with `getClient(context)` so credentials stay scoped to the active MCP
request. Local single-user stdio integrations can return the same client each
time.

## Security

The server runs locally over stdio and calls The Hog API endpoints under
`https://developer.thehog.ai/api/...` with your The Hog API credentials. The
configurable base URL is `https://developer.thehog.ai`; endpoint paths include
`/api/...`. It does not host a public endpoint and does not require OAuth for
local stdio use. Do not commit MCP config files that contain real API keys.

## Source

Source code is available at https://github.com/The-Hog/the-hog-mcp.

## License

MIT

## Versioning

The package is in the `0.x` release line while the tool surface stabilizes: patch versions contain compatible fixes, and minor versions may add tools or adjust tool schemas before `1.0.0`.
