# The Hog MCP

Run The Hog API from MCP clients such as Claude, Claude Code, Cursor, Codex,
VS Code, and Windsurf.

The Hog supports two MCP setup options:

| Option | Best for | Authentication |
| --- | --- | --- |
| Hosted remote MCP | Claude web/desktop connectors and users who do not want to install Node or manage local config files | Sign in with The Hog through OAuth |
| Local stdio MCP | Claude Code, Cursor, Codex, VS Code, Windsurf, and local coding agents that run a command on your machine | Pass your The Hog API key and API secret as environment variables |

## Quick Start

### Hosted remote MCP

Use this URL in any MCP client that supports remote connectors:

```text
https://mcp.thehog.ai/mcp
```

Remote MCP uses OAuth. You do not need to create or paste an API key. Your MCP
client opens a browser sign-in flow, you sign in with The Hog, and the connector
is associated with the organization you select. Remote connections can be
revoked from the Remote MCP page in the dashboard.

### Local stdio MCP

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

For Claude web or hosted Claude connectors, use `https://mcp.thehog.ai/mcp`.
Use this local stdio setup when Claude Desktop is running MCP commands on your
machine. Claude Desktop uses a local JSON config file for MCP servers.

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

Hosted remote MCP uses OAuth and does not require you to paste API keys into
your MCP client. Dashboard-created local stdio credentials require both
`THEHOG_ACCESS_KEY` and `THEHOG_SECRET_KEY`. Do not commit config files that
contain real credentials. Prefer user-level MCP configuration for personal
credentials, or use your client's environment-variable or secret-input support
where available.

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

The local stdio server runs on your machine and calls The Hog API endpoints
under `https://developer.thehog.ai/api/...` with your The Hog API credentials.
The configurable base URL is `https://developer.thehog.ai`; endpoint paths
include `/api/...`. It does not host a public endpoint and does not require
OAuth for local stdio use. Do not commit MCP config files that contain real API
keys.

The hosted remote MCP server runs at `https://mcp.thehog.ai/mcp`, uses OAuth,
and can be revoked from the dashboard.

## Source

Source code is available at https://github.com/The-Hog/the-hog-mcp.

## License

MIT

## Versioning

The package is in the `0.x` release line while the tool surface stabilizes: patch versions contain compatible fixes, and minor versions may add tools or adjust tool schemas before `1.0.0`.
