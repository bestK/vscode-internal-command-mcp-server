# VSCode Internal Command MCP Server

🚀 A VSCode extension based on the [FastMCP](https://github.com/punkpeye/fastmcp) framework that transforms VSCode into an MCP (Model Context Protocol) server, allowing external clients to execute VSCode internal commands via HTTP Streaming and Server-Sent Events (SSE).

[中文文档](../README.md)

## ✨ Features

* 🌐 **HTTP Streaming Support**: Real-time communication using the `text/event-stream` protocol
* 🔧 **VSCode Command Execution**: Remotely execute any VSCode internal command
* 📊 **Workspace Information Query**: Retrieve current workspace status and file information
* ⚡ **Asynchronous Background Execution**: Supports async command execution without blocking the UI
* ⏰ **Configurable Delay**: Allows setting command execution delay
* 🛡️ **Security Control**: Configurable command whitelist mechanism
* 📡 **Real-time Status Monitoring**: Status bar shows server running status
* 🔗 **Standard MCP Protocol**: Fully compliant with the Model Context Protocol specification
* ⚡ **High Performance**: Based on FastMCP framework, supports concurrent requests and session management
* 🩺 **Health Check**: Built-in health check endpoint

## 📦 Installation

### 1. Clone the project

```bash
git clone https://github.com/bestk/vscode-internal-command-mcp-server
cd vscode-internal-command-mcp-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Compile the project

```bash
npm run compile
```

### 4. Install in VSCode

* Press `F5` to launch the extension development host
* Or package as a `.vsix` file and install

## ⚙️ Configuration

Configure server parameters in VSCode settings:

```json
{
    "vscode-internal-command-mcp-server.port": 8080,
    "vscode-internal-command-mcp-server.host": "localhost",
    "vscode-internal-command-mcp-server.autoStart": true,
    "vscode-internal-command-mcp-server.asyncExecution": true,
    "vscode-internal-command-mcp-server.executionDelay": 1000,
    "vscode-internal-command-mcp-server.showAsyncNotifications": false,
    "vscode-internal-command-mcp-server.allowedCommands": [
        "editor.action.formatDocument",
        "workbench.action.files.save",
        "editor.action.clipboardCopyAction"
    ]
}
```

### Configuration Details

| Setting                  | Type      | Default     | Description                                                          |
| ------------------------ | --------- | ----------- | -------------------------------------------------------------------- |
| `port`                   | number    | 8080        | MCP server port                                                      |
| `host`                   | string    | "localhost" | MCP server host address                                              |
| `autoStart`              | boolean   | true        | Auto-start the server when extension activates                       |
| `asyncExecution`         | boolean   | true        | Enable async execution (returns immediately, executes in background) |
| `executionDelay`         | number    | 0           | Command execution delay (ms)                                         |
| `showAsyncNotifications` | boolean   | false       | Show notifications when async tasks complete                         |
| `allowedCommands`        | string\[] | \[]         | List of allowed commands (empty = allow all)                         |

## 🚀 Usage

### Start the Server

1. **Auto-start**: Server starts automatically if `autoStart` is true
2. **Manual start**:

   * Command Palette: `VSCode Internal Command MCP Server: Start Server`
   * Or click 🚀 VSCode internal command MCP in the status bar

### Server Endpoints

* **MCP Endpoint**: `http://localhost:8080/mcp`
* **Health Check**: `http://localhost:8080/health`

### Status Monitoring

* Status bar display: 🚀 VSCode internal command MCP 🟢 (Running) / 🚀 VSCode internal command MCP 🔴 (Stopped)
* Command Palette: `VSCode Internal Command MCP Server: Show Status` for detailed status

## 🛠️ Available Tools (MCP Tools)

### 1. execute\_vscode\_command

Execute VSCode internal commands.

**Parameters**:

```typescript
{
  command: string;      // VSCode command ID
  arguments?: string[]; // Optional command arguments
}
```

**Async execution response example**:

```json
{
    "success": true,
    "async": true,
    "taskId": "bg_task_1_1756952250790",
    "message": "Command 'composer.cancelComposerStep' submitted for background execution, will execute after 1000ms",
    "command": "composer.cancelComposerStep",
    "arguments": [],
    "executionDelay": 1000,
    "queueLength": 1,
    "taskStats": {
        "total": 1,
        "pending": 1,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0
    }
}
```

### 2. list\_vscode\_commands

List all available VSCode commands.

**Parameters**: None

**Returns**: List of commands (first 20 shown, with truncation notice if exceeded)

### 3. get\_workspace\_info

Retrieve current workspace info.

**Parameters**: None

**Returns**:

```typescript
{
    name: string; // Workspace name
    folders: Array<{
        // Workspace folders
        name: string;
        uri: string;
    }>;
    activeEditor: string; // Current active editor file path
}
```

## 🔌 Client Connection

### Using Official MCP SDK

```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:8080/mcp'), {
    requestInit: {
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
    },
});

const client = new Client({
    name: 'vscode-mcp-client',
    version: '1.0.0',
});

// Connect and use
await client.connect(transport);

// Call tool
const result = await client.callTool({
    name: 'execute_vscode_command',
    arguments: {
        command: 'editor.action.formatDocument',
    },
});

console.log('Command result:', result);
```

### Using Cursor

Configure MCP server in Cursor:

```json
{
    "mcpServers": {
        "vscode-internal-commands": {
            "url": "http://localhost:8080/mcp",
            "transport": "http"
        }
    }
}
```

### Using curl for Testing

```bash
# Health check
curl http://localhost:8080/health

# List tools
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Execute command
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "execute_vscode_command",
      "arguments": {
        "command": "workbench.action.files.save"
      }
    }
  }'
```

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────┐
│   VSCode Extension      │
├─────────────────────────┤
│   FastMcpServer         │ ← Based on FastMCP framework
├─────────────────────────┤
│   ServerManager         │ ← Server management and status
├─────────────────────────┤
│   CommandExecutor       │ ← VSCode command executor
├─────────────────────────┤
│ BackgroundTaskExecutor  │ ← Background task executor
├─────────────────────────┤
│   TaskProvider          │ ← VS Code task provider
└─────────────────────────┘
```

### Tech Stack

* **Framework**: [FastMCP](https://github.com/punkpeye/fastmcp) - TypeScript MCP server framework
* **Protocol**: Model Context Protocol (MCP)
* **Transport**: HTTP Streaming with Server-Sent Events (SSE)
* **Validation**: Zod Schema validation
* **Platform**: VSCode Extension API
* **Async Execution**: Background task queue using setInterval

### Network Protocol

* **Transport Type**: `httpStream`
* **Content Type**: `text/event-stream`
* **Supported Protocols**: HTTP/1.1
* **CORS**: Enabled by default

### Async Execution Mechanism

* **Task Queue**: In-memory queue based on Map structure
* **Executor**: setInterval periodically checks pending tasks
* **Status Management**: Supports pending, running, completed, failed, cancelled states
* **Delayed Execution**: Configurable delay before task execution
* **Notification System**: Optional completion notifications

## 🔧 Development

### Project Structure

```
vscode-internal-command-mcp-server/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── fastMcpServer.ts         # FastMCP server implementation
│   ├── serverManager.ts         # Server manager
│   ├── commandExecutor.ts       # VSCode command executor
│   ├── backgroundTaskExecutor.ts # Background task executor
│   └── taskProvider.ts          # VS Code task provider
├── out/                         # Build output
├── package.json                 # Extension config and dependencies
├── tsconfig.json               # TypeScript config
└── README.md                   # Project documentation
```

### Development Commands

```bash
# Compile in dev mode
npm run compile

# Compile in watch mode
npm run watch

# Start development
code . # Open VSCode and press F5 to debug
```

### Debugging

1. Open project in VSCode
2. Press `F5` to start the extension development host
3. Test extension features in the new window
4. View output in the debug console

## 🧪 Testing

### Using Built-in Test Tools

1. After starting the server, run command: `VSCode Internal Command MCP Server: Test MCP Tools`
2. Select tool to test
3. Enter required parameters
4. View execution result

### Using FastMCP CLI

```bash
# Test using FastMCP dev tools
npx fastmcp dev src/fastMcpServer.ts

# Inspect using MCP Inspector
npx fastmcp inspect src/fastMcpServer.ts
```

## 🛡️ Security Considerations

### Command Whitelist

For safety, configure the `allowedCommands` whitelist:

```json
{
    "vscode-internal-command-mcp-server.allowedCommands": [
        "editor.action.formatDocument",
        "workbench.action.files.save",
        "workbench.action.files.saveAll",
        "editor.action.clipboardCopyAction",
        "editor.action.clipboardPasteAction"
    ]
}
```

### Network Security

* Defaults to listening on `localhost` only to prevent external access
* CORS is supported, but configure origins properly in production
* All commands execute within VSCode's secure context

### Async Execution Security

* Task queue managed in memory, automatically cleared when extension closes
* Supports task cancellation and status monitoring
* Provides detailed error info on execution failures

## 📝 Changelog

### v0.0.2 (Current Version)

* ✅ Refactored async execution with background task queue
* ✅ Fixed config refresh issue, ensuring immediate effect of changes
* ✅ Improved task status management and monitoring
* ✅ Enhanced error handling and logging
* ✅ Simplified code structure, removed redundant components

### v0.0.1

* ✅ Implemented MCP server based on FastMCP
* ✅ Supported HTTP Streaming and SSE
* ✅ Added three core tools: command execution, command listing, workspace info
* ✅ Integrated status bar and real-time monitoring
* ✅ Health check endpoint
* ✅ Zod Schema parameter validation
* ✅ TypeScript 5.9+ support

## 🤝 Contributing

Issues and Pull Requests are welcome!

### Contribution Guide

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE.md)

## 🙏 Acknowledgements

* [FastMCP](https://github.com/punkpeye/fastmcp) - Excellent TypeScript MCP framework
* [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol specification
* VSCode Extension API - Powerful extension platform

## 📞 Support

If you encounter issues or have questions:

1. Check [Issues](https://github.com/bestk/vscode-internal-command-mcp-server/issues)
2. Open a new Issue
3. Check FastMCP docs: [https://github.com/punkpeye/fastmcp](https://github.com/punkpeye/fastmcp)

---

**🚀 Make VSCode your MCP server and unlock unlimited possibilities!**
