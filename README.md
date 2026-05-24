# The Hog MCP

Run The Hog API from MCP clients such as Claude, Cursor, and Codex.

## Install

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

## Claude Code

```bash
claude mcp add --transport stdio --env THEHOG_API_KEY=YOUR_THEHOG_API_KEY thehog -- npx -y @thehog/mcp@latest
```

## Cursor

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

## Codex

```bash
codex mcp add thehog --env THEHOG_API_KEY=YOUR_THEHOG_API_KEY -- npx -y @thehog/mcp@latest
```

## Security

The server runs locally over stdio and calls The Hog API endpoints under `https://developer.thehog.ai/api/...` with your The Hog API credentials. The configurable base URL is `https://developer.thehog.ai`; endpoint paths include `/api/...`. It does not host a public endpoint and does not require OAuth for local stdio use. Do not commit MCP config files that contain real API keys.

## Source

Source code is available at https://github.com/The-Hog/the-hog-mcp.

## License

MIT

## Versioning

The package is in the `0.x` release line while the tool surface stabilizes: patch versions contain compatible fixes, and minor versions may add tools or adjust tool schemas before `1.0.0`.
