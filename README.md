# The Hog MCP

Run The Hog API from MCP clients such as Claude, Claude Code, Cursor, Codex,
VS Code, and Windsurf.

## Quick Start

Use a The Hog API key:

```bash
THEHOG_API_KEY=YOUR_THEHOG_API_KEY npx -y @thehog/mcp@latest
```

Access-key authentication is also supported:

```bash
THEHOG_ACCESS_KEY=YOUR_THEHOG_ACCESS_KEY THEHOG_SECRET_KEY=YOUR_THEHOG_SECRET_KEY npx -y @thehog/mcp@latest
```

Optional:

```bash
THEHOG_API_BASE_URL=https://developer.thehog.ai
```

The default base URL is `https://developer.thehog.ai`; the server calls API
paths under `/api/...`.

## Client Setup

Most MCP clients can run this server as a local stdio process:

```json
{
  "mcpServers": {
    "thehog": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thehog/mcp@latest"],
      "env": {
        "THEHOG_API_KEY": "YOUR_THEHOG_API_KEY"
      }
    }
  }
}
```

If your client supports environment-variable interpolation, prefer referencing an
existing environment variable instead of writing the key directly into a config
file.

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
        "THEHOG_API_KEY": "YOUR_THEHOG_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop after saving the file. If Claude cannot find `npx`, use
the absolute path from `which npx`.

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env THEHOG_API_KEY=YOUR_THEHOG_API_KEY \
  thehog -- npx -y @thehog/mcp@latest
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
        "THEHOG_API_KEY": "${env:THEHOG_API_KEY}"
      }
    }
  }
}
```

Restart Cursor, then check Settings -> Tools & MCP.

### Codex

```bash
codex mcp add thehog \
  --env THEHOG_API_KEY=YOUR_THEHOG_API_KEY \
  -- npx -y @thehog/mcp@latest
```

You can also edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.thehog]
command = "npx"
args = ["-y", "@thehog/mcp@latest"]
enabled = true

[mcp_servers.thehog.env]
THEHOG_API_KEY = "YOUR_THEHOG_API_KEY"
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
        "THEHOG_API_KEY": "${input:thehog-api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "thehog-api-key",
      "description": "The Hog API key",
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
        "THEHOG_API_KEY": "${env:THEHOG_API_KEY}"
      }
    }
  }
}
```

Refresh MCP servers from Cascade after saving.

## Authentication

Recommended:

```json
{
  "env": {
    "THEHOG_API_KEY": "YOUR_THEHOG_API_KEY"
  }
}
```

Alternative access-key authentication:

```json
{
  "env": {
    "THEHOG_ACCESS_KEY": "YOUR_THEHOG_ACCESS_KEY",
    "THEHOG_SECRET_KEY": "YOUR_THEHOG_SECRET_KEY"
  }
}
```

Do not commit config files that contain real credentials. Prefer user-level MCP
configuration for personal keys, or use your client's environment-variable or
secret-input support where available.

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
