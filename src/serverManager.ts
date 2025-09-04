import * as vscode from 'vscode';
import { FastMcpServer } from './fastMcpServer';

export class ServerManager {
    private mcpServer: FastMcpServer;

    constructor(mcpServer: FastMcpServer) {
        this.mcpServer = mcpServer;
    }

    public initialize() {
        const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
        const autoStart = config.get<boolean>('autoStart', true);

        if (autoStart) {
            this.startServer();
        }

        // 配置变更监听已在 extension.ts 中处理
    }

    public async startServer(): Promise<boolean> {
        const success = await this.mcpServer.start();
        return success;
    }

    public async stopServer(): Promise<boolean> {
        const success = await this.mcpServer.stop();
        return success;
    }

    public async showStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
        const isRunning = this.mcpServer.running;

        const status = isRunning ? 'Running' : 'Stopped';
        const statusIcon = isRunning ? '🟢' : '🔴';

        // 获取可用工具
        const tools = await this.mcpServer.getTools();
        const toolsList = tools.map(tool => `• ${tool.name}: ${tool.description}`).join('\n');

        // 获取网络配置
        const host = config.get<string>('host', 'localhost');
        const port = config.get<number>('port', 8080);

        const mcpUrl = `http://${host}:${port}/mcp`;
        const sessionsCount = this.mcpServer.sessions.length;

        const message = `
VSCode internal command MCP Status: ${statusIcon} ${status}

Network Configuration:
• MCP 地址: ${mcpUrl}
• 传输协议: HTTP Streaming (SSE)
• Content-Type: text/event-stream
• Host: ${host}
• Port: ${port}
• 活跃会话: ${sessionsCount}

Server Details:
• Framework: FastMCP v3.15.2
• Type: HTTP Streaming MCP Server
• Auto-start: ${config.get<boolean>('autoStart', true) ? 'Enabled' : 'Disabled'}
• SSE Support: Enabled ✅
• CORS: Enabled ✅

Security:
• Allowed Commands: ${config.get<string[]>('allowedCommands', []).length > 0 ? config.get<string[]>('allowedCommands', []).join(', ') : 'All commands allowed'}

Execution Configuration:
• Async Execution: ${config.get<boolean>('asyncExecution', true) ? 'Enabled ✅' : 'Disabled ❌'}
• Execution Delay: ${config.get<number>('executionDelay', 0)}ms
• Execution Mode: ${config.get<boolean>('asyncExecution', true) ? 'Commands return immediately, execute in background' : 'Commands wait for completion'}

Available MCP Tools:
${toolsList}

API Features:
• Server-Sent Events (SSE) 支持
• HTTP Streaming 传输
• 会话管理
• 进度通知
• 错误处理
• 健康检查端点

Connection:
• MCP 客户端：连接到 ${mcpUrl}
• Cursor 配置：使用 StreamableHTTPClientTransport
• 测试工具：使用 "Test MCP Tools" 命令
• 状态监控：查看状态栏指示器

Framework Benefits:
• 🚀 更好的性能和稳定性
• 📡 原生 SSE 支持
• 🔄 自动重连机制
• 📊 会话管理
• 🛡️ 内置错误处理
        `.trim();

        const panel = vscode.window.createWebviewPanel(
            'mcpServerStatus',
            'MCP Server Status',
            vscode.ViewColumn.Beside,
            {},
        );

        panel.webview.html = this.generateStatusHtml(message);
    }

    public async executeCommand(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: 'Enter VSCode command to execute',
            placeHolder: 'editor.action.inlineDiffs.hide',
        });

        if (!command) {
            return;
        }

        const argsInput = await vscode.window.showInputBox({
            prompt: `Enter arguments for command "${command}" (JSON format)`,
            placeHolder: '{"arg1": "value1", "arg2": "value2"}',
        });

        let args = undefined;
        if (argsInput) {
            try {
                args = JSON.parse(argsInput);
            } catch (error) {
                vscode.window.showErrorMessage('Invalid JSON format for arguments');
                return;
            }
        }

        try {
            const result = await vscode.commands.executeCommand(command, args);
            vscode.window.showInformationMessage(`Command executed: ${command}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
        }
    }

    public async testMcpTools(): Promise<void> {
        try {
            // 获取可用工具
            const tools = await this.mcpServer.getTools();

            // 让用户选择工具
            const toolNames = tools.map(tool => tool.name);
            const selectedTool = await vscode.window.showQuickPick(toolNames, {
                placeHolder: '选择要测试的MCP工具',
            });

            if (!selectedTool) {
                return;
            }

            let args: any = {};

            // 根据工具类型准备参数
            if (selectedTool === 'execute_vscode_command') {
                const command = await vscode.window.showInputBox({
                    placeHolder: '输入VSCode命令 (例如: workbench.action.files.save)',
                    prompt: '要执行的VSCode命令',
                });

                if (!command) {
                    return;
                }

                args = { command };
            } else if (selectedTool === 'list_vscode_commands' || selectedTool === 'get_workspace_info') {
                args = {};
            }

            // 调用工具
            const result = await this.mcpServer.callTool(selectedTool, args);

            // 显示结果
            const panel = vscode.window.createWebviewPanel(
                'mcpToolResult',
                `MCP Tool Result: ${selectedTool}`,
                vscode.ViewColumn.Beside,
                {},
            );

            const resultText = result.content?.[0]?.text || JSON.stringify(result, null, 2);

            panel.webview.html = this.generateResultHtml(selectedTool, resultText);
        } catch (error) {
            vscode.window.showErrorMessage(`MCP工具执行失败: ${error}`);
        }
    }

    private generateResultHtml(toolName: string, result: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>MCP Tool Result</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 20px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .content {
                        font-family: var(--vscode-editor-font-family);
                        background-color: var(--vscode-textBlockQuote-background);
                        padding: 20px;
                        border-radius: 3px;
                        white-space: pre-wrap;
                        line-height: 1.6;
                        border-left: 4px solid var(--vscode-textBlockQuote-border);
                    }
                    .copy-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 3px;
                        cursor: pointer;
                        margin-top: 10px;
                    }
                    .copy-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="header">MCP Tool: ${this.escapeHtml(toolName)}</div>
                <div class="content">${this.escapeHtml(result)}</div>
                <button class="copy-button" onclick="copyResult()">复制结果</button>
                <script>
                    function copyResult() {
                        const resultText = document.querySelector('.content').textContent;
                        navigator.clipboard.writeText(resultText).then(() => {
                            alert('结果已复制到剪贴板!');
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateStatusHtml(message: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>MCP Server Status</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .content {
                        font-family: var(--vscode-editor-font-family);
                        background-color: var(--vscode-textBlockQuote-background);
                        padding: 20px;
                        border-radius: 3px;
                        white-space: pre-wrap;
                        line-height: 1.6;
                    }
                    .copy-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 3px;
                        cursor: pointer;
                        margin-top: 10px;
                    }
                    .copy-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="content">${this.escapeHtml(message)}</div>
                <button class="copy-button" onclick="copyStatus()">Copy Status</button>
                <script>
                    function copyStatus() {
                        const statusText = document.querySelector('.content').textContent;
                        navigator.clipboard.writeText(statusText).then(() => {
                            alert('Status copied to clipboard!');
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    public dispose() {}
}
