import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import * as vscode from 'vscode';
import { CommandExecutor } from './commandExecutor';

export class MyMcpServer {
    private statusBarItem: vscode.StatusBarItem;
    private isRunning: boolean = false;
    private context: vscode.ExtensionContext;
    private commandExecutor: CommandExecutor;
    private httpServer: http.Server | null = null;

    // MCP SDK 实例
    private mcpSdkServer: McpServer;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.commandExecutor = new CommandExecutor();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

        // 初始化MCP SDK服务器
        this.mcpSdkServer = new McpServer(
            {
                name: 'vscode-mcp-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        this.setupMcpHandlers();
        this.updateStatusBar();
    }

    private setupMcpHandlers() {
        // 设置工具列表处理器
        this.mcpSdkServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'execute_vscode_command',
                        description: '执行VSCode命令',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                command: {
                                    type: 'string',
                                    description: '要执行的VSCode命令',
                                },
                                arguments: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: '命令参数',
                                },
                            },
                            required: ['command'],
                        },
                    },
                    {
                        name: 'list_vscode_commands',
                        description: '列出可用的VSCode命令',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'get_workspace_info',
                        description: '获取工作区信息',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                ],
            };
        });

        // 设置工具调用处理器
        this.mcpSdkServer.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case 'execute_vscode_command':
                    if (!args || !args.command) {
                        throw new Error('Missing required parameter: command');
                    }
                    const result = await this.commandExecutor.executeCommand(args.command, args.arguments || []);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `命令执行结果: ${JSON.stringify(result, null, 2)}`,
                            },
                        ],
                    };

                case 'list_vscode_commands':
                    const commands = await this.commandExecutor.getAvailableCommands();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `可用命令 (${commands.length}个):\n${commands.slice(0, 20).join('\n')}${
                                    commands.length > 20 ? '\n...(还有更多)' : ''
                                }`,
                            },
                        ],
                    };

                case 'get_workspace_info':
                    const workspaceInfo = {
                        name: vscode.workspace.name || '未命名工作区',
                        folders:
                            vscode.workspace.workspaceFolders?.map(f => ({
                                name: f.name,
                                uri: f.uri.toString(),
                            })) || [],
                        activeEditor: vscode.window.activeTextEditor?.document.fileName || '无活动编辑器',
                    };
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `工作区信息:\n${JSON.stringify(workspaceInfo, null, 2)}`,
                            },
                        ],
                    };

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private async startHttpServer(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => {
                this.handleHttpRequest(req, res);
            });

            this.httpServer.on('error', error => {
                reject(error);
            });

            this.httpServer.listen(port, host, () => {
                resolve();
            });
        });
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);

            if (req.method === 'POST' && url.pathname === '/') {
                // MCP JSON-RPC 请求
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', async () => {
                    try {
                        const jsonRequest = JSON.parse(body);
                        const response = await this.handleMcpRequest(jsonRequest);

                        res.setHeader('Content-Type', 'application/json');
                        res.writeHead(200);
                        res.end(JSON.stringify(response));
                    } catch (error) {
                        res.writeHead(400);
                        res.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: null,
                                error: {
                                    code: -32700,
                                    message: 'Parse error',
                                },
                            }),
                        );
                    }
                });
            } else if (req.method === 'GET' && url.pathname === '/health') {
                // 健康检查端点
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                res.end(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        result: {
                            status: 'ok',
                            running: this.isRunning,
                        },
                    }),
                );
            } else if (req.method === 'GET' && url.pathname === '/tools') {
                // 获取工具列表端点
                try {
                    const tools = await this.getTools();
                    res.setHeader('Content-Type', 'application/json');
                    res.writeHead(200);
                    res.end(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            result: {
                                tools: tools,
                            },
                        }),
                    );
                } catch (error) {
                    res.writeHead(500);
                    res.end(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            error: {
                                code: -32603,
                                message: 'Internal error',
                                data: error instanceof Error ? error.message : String(error),
                            },
                        }),
                    );
                }
            } else if (req.method === 'POST' && url.pathname === '/tools/call') {
                // 调用工具端点
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', async () => {
                    try {
                        const { name, arguments: args } = JSON.parse(body);
                        const result = await this.callTool(name, args);

                        res.setHeader('Content-Type', 'application/json');
                        res.writeHead(200);
                        res.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                result: result,
                            }),
                        );
                    } catch (error) {
                        res.writeHead(400);
                        res.end(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                error: {
                                    code: -32603,
                                    message: 'Tool call error',
                                    data: error instanceof Error ? error.message : String(error),
                                },
                            }),
                        );
                    }
                });
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (error) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }

    private async handleMcpRequest(request: any): Promise<any> {
        try {
            if (request.method === 'tools/list') {
                const tools = await this.getTools();
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                        tools: tools,
                    },
                };
            } else if (request.method === 'tools/call') {
                const { name, arguments: args } = request.params;
                const result = await this.callTool(name, args);
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: result,
                };
            } else {
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: -32601,
                        message: 'Method not found',
                    },
                };
            }
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error instanceof Error ? error.message : String(error),
                },
            };
        }
    }

    public async start(): Promise<boolean> {
        if (this.isRunning) {
            return true;
        }

        try {
            // 获取网络配置信息
            const config = vscode.workspace.getConfiguration('vscodeICommandMcpServer');
            const host = config.get<string>('host', 'localhost');
            const port = config.get<number>('port', 8080);
            const enableWebSocket = config.get<boolean>('enableWebSocket', true);

            // 启动 HTTP 服务器
            await this.startHttpServer(host, port);

            this.isRunning = true;
            this.updateStatusBar();

            const tools = await this.getTools();

            // 显示成功启动消息，包含MCP地址信息
            const mcpInfo = `🕹️ MCP Server 已启动
• 地址: http://${host}:${port}
• WebSocket: ${enableWebSocket ? `ws://${host}:${port}` : '已禁用'}
• 协议: Model Context Protocol (MCP)
• 可用工具: ${tools.length} 个
• 状态: 运行中 🟢`;

            vscode.window.showInformationMessage(mcpInfo, '查看详情', '测试工具', '复制地址').then(selection => {
                if (selection === '查看详情') {
                    vscode.commands.executeCommand('vscodeICommandMcpServer.showStatus');
                } else if (selection === '测试工具') {
                    vscode.commands.executeCommand('vscodeICommandMcpServer.testMcpTools');
                } else if (selection === '复制地址') {
                    vscode.env.clipboard.writeText(`http://${host}:${port}`);
                    vscode.window.showInformationMessage('MCP 服务器地址已复制到剪贴板');
                }
            });
            console.log(`VSCode Internal Command MCP Server started on http://${host}:${port}`);

            return true;
        } catch (error) {
            this.isRunning = false;
            this.updateStatusBar();
            vscode.window.showErrorMessage(`Internal Command MCP Server 启动失败: ${error}`);
            return false;
        }
    }

    public async stop(): Promise<boolean> {
        if (!this.isRunning) {
            return true;
        }

        try {
            // 关闭 HTTP 服务器
            if (this.httpServer) {
                await new Promise<void>(resolve => {
                    this.httpServer!.close(() => {
                        resolve();
                    });
                });
                this.httpServer = null;
            }

            this.isRunning = false;
            this.updateStatusBar();
            vscode.window.showInformationMessage('🕹️ Internal Command MCP Server 已停止');
            console.log('VSCode Internal Command MCP Server stopped');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`VSCode Internal Command MCP Server 停止失败: ${error}`);
            return false;
        }
    }

    private updateStatusBar() {
        if (this.isRunning) {
            this.statusBarItem.text = '🕹️ MCP Server 🟢';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.statusBarItem.text = '🕹️ MCP Server 🔴';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        this.statusBarItem.show();
    }

    // 为VSCode扩展内部使用提供的直接访问方法
    public async getTools(): Promise<any[]> {
        return [
            {
                name: 'execute_vscode_command',
                description: '执行VSCode命令',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: '要执行的VSCode命令',
                        },
                        arguments: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '命令参数',
                        },
                    },
                    required: ['command'],
                },
            },
            {
                name: 'list_vscode_commands',
                description: '列出可用的VSCode命令',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'get_workspace_info',
                description: '获取工作区信息',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
        ];
    }

    public async callTool(name: string, args: any): Promise<any> {
        switch (name) {
            case 'execute_vscode_command':
                if (!args || !args.command) {
                    throw new Error('Missing required parameter: command');
                }
                const result = await this.commandExecutor.executeCommand(args.command, args.arguments || []);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `命令执行结果: ${JSON.stringify(result, null, 2)}`,
                        },
                    ],
                };

            case 'list_vscode_commands':
                const commands = await this.commandExecutor.getAvailableCommands();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `可用命令 (${commands.length}个):\n${commands.slice(0, 20).join('\n')}${
                                commands.length > 20 ? '\n...(还有更多)' : ''
                            }`,
                        },
                    ],
                };

            case 'get_workspace_info':
                const workspaceInfo = {
                    name: vscode.workspace.name || '未命名工作区',
                    folders:
                        vscode.workspace.workspaceFolders?.map(f => ({
                            name: f.name,
                            uri: f.uri.toString(),
                        })) || [],
                    activeEditor: vscode.window.activeTextEditor?.document.fileName || '无活动编辑器',
                };
                return {
                    content: [
                        {
                            type: 'text',
                            text: `工作区信息:\n${JSON.stringify(workspaceInfo, null, 2)}`,
                        },
                    ],
                };

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    public updateConfiguration() {
        // 配置更新逻辑（如果需要的话）
    }

    public get running(): boolean {
        return this.isRunning;
    }

    public dispose() {
        this.stop();
        this.statusBarItem.dispose();
    }
}
