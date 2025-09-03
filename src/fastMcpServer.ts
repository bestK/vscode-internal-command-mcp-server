// @ts-ignore - 忽略 FastMCP 类型定义问题
import { FastMCP } from 'fastmcp';
import * as vscode from 'vscode';
import { z } from 'zod';
import { CommandExecutor } from './commandExecutor';

export class FastMcpServer {
    private server!: FastMCP;
    private statusBarItem: vscode.StatusBarItem;
    private isRunning: boolean = false;
    private context: vscode.ExtensionContext;
    private commandExecutor: CommandExecutor;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.commandExecutor = new CommandExecutor();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

        // 初始化 FastMCP 服务器
        this.initializeFastMCP();
        this.updateStatusBar();
    }

    private initializeFastMCP() {
        this.server = new FastMCP({
            name: 'vscode-mcp-server',
            version: '1.0.0',
            instructions:
                'VSCode MCP Server - 执行 VSCode 内部命令和获取工作区信息的 MCP 服务器。支持命令执行、工作区查询等功能。',
            health: {
                enabled: true,
                path: '/health',
                message: 'VSCode internal command MCP is running',
                status: 200,
            },
        });

        // 定义工具 - 使用简单的方式避免类型错误
        this.defineTools();

        // 设置事件监听
        this.setupEventListeners();
    }

    private defineTools() {
        // 由于 TypeScript 版本兼容性问题，我们使用 any 类型绕过类型检查
        const server = this.server as any;

        // 执行 VSCode 命令工具
        server.addTool({
            name: 'execute_vscode_command',
            description: '执行VSCode命令',
            parameters: z.object({
                command: z.string().describe('要执行的VSCode命令'),
                arguments: z.array(z.string()).optional().describe('命令参数'),
            }),
            execute: async (args: any) => {
                try {
                    const { command, arguments: cmdArgs } = args;
                    const result = await this.commandExecutor.executeCommand(command, cmdArgs || []);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: `命令执行结果: ${JSON.stringify(result, null, 2)}`,
                            },
                        ],
                    };
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        });

        // 列出可用命令工具
        server.addTool({
            name: 'list_vscode_commands',
            description: '列出可用的VSCode命令',
            parameters: z.object({}),
            execute: async () => {
                try {
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
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `获取命令列表失败: ${error instanceof Error ? error.message : String(error)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        });

        // 获取工作区信息工具
        server.addTool({
            name: 'get_workspace_info',
            description: '获取工作区信息',
            parameters: z.object({}),
            execute: async () => {
                try {
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
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `获取工作区信息失败: ${error instanceof Error ? error.message : String(error)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        });
    }

    private setupEventListeners() {
        const server = this.server as any;

        server.on('connect', (event: any) => {
            console.log('FastMCP 客户端已连接:', event.session);
            vscode.window.showInformationMessage('🔗 MCP 客户端已连接');
        });

        server.on('disconnect', (event: any) => {
            console.log('FastMCP 客户端已断开:', event.session);
            vscode.window.showInformationMessage('🔌 MCP 客户端已断开');
        });
    }

    public async start(): Promise<boolean> {
        if (this.isRunning) {
            return true;
        }

        try {
            // 获取配置
            const config = vscode.workspace.getConfiguration('vscodeICommandMcpServer');
            const host = config.get<string>('host', 'localhost');
            const port = config.get<number>('port', 8080);

            // 启动 FastMCP 服务器（支持 HTTP Streaming 和 SSE）
            const server = this.server as any;
            await server.start({
                transportType: 'httpStream',
                httpStream: {
                    port: port,
                    host: host,
                    endpoint: '/mcp',
                },
            });

            this.isRunning = true;
            this.updateStatusBar();

            // 显示启动成功消息
            const mcpInfo = `🚀 VSCode internal command MCP 已启动
• 地址: http://${host}:${port}/mcp
• 协议: Model Context Protocol (MCP) with SSE
• 传输: HTTP Streaming (text/event-stream)
• 健康检查: http://${host}:${port}/health
• 可用工具: 3 个
• 状态: 运行中 🟢`;

            vscode.window
                .showInformationMessage(mcpInfo, '查看详情', '测试工具', '复制地址', '插件源码')
                .then(selection => {
                    if (selection === '查看详情') {
                        vscode.commands.executeCommand('vscodeICommandMcpServer.showStatus');
                    } else if (selection === '测试工具') {
                        vscode.commands.executeCommand('vscodeICommandMcpServer.testMcpTools');
                    } else if (selection === '复制地址') {
                        vscode.env.clipboard.writeText(`http://${host}:${port}/mcp`);
                        vscode.window.showInformationMessage('FastMCP 服务器地址已复制到剪贴板');
                    } else if (selection === '插件源码') {
                        vscode.env.openExternal(
                            vscode.Uri.parse('https://github.com/bestk/vscode-internal-command-mcp-server'),
                        );
                    }
                });

            console.log(`VSCode internal command MCP started on http://${host}:${port}/mcp`);
            return true;
        } catch (error) {
            this.isRunning = false;
            this.updateStatusBar();
            vscode.window.showErrorMessage(`VSCode internal command MCP 启动失败: ${error}`);
            console.error('VSCode internal command MCP start error:', error);
            return false;
        }
    }

    public async stop(): Promise<boolean> {
        if (!this.isRunning) {
            return true;
        }

        try {
            // 停止 FastMCP 服务器
            const server = this.server as any;
            await server.stop();

            this.isRunning = false;
            this.updateStatusBar();

            vscode.window.showInformationMessage('🚀 VSCode internal command MCP 已停止');
            console.log('VSCode internal command MCP stopped');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`VSCode internal command MCP 停止失败: ${error}`);
            return false;
        }
    }

    private updateStatusBar() {
        if (this.isRunning) {
            this.statusBarItem.text = '🚀 VSCode internal command MCP 🟢';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.statusBarItem.text = '🚀 VSCode internal command MCP 🔴';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        this.statusBarItem.show();
    }

    public get running(): boolean {
        return this.isRunning;
    }

    public get sessions() {
        // 返回 sessions，如果不存在则返回空数组
        const server = this.server as any;
        return server.sessions || [];
    }

    public async getTools() {
        return [
            {
                name: 'execute_vscode_command',
                description: '执行VSCode命令',
            },
            {
                name: 'list_vscode_commands',
                description: '列出可用的VSCode命令',
            },
            {
                name: 'get_workspace_info',
                description: '获取工作区信息',
            },
        ];
    }

    public async callTool(name: string, args: any) {
        // FastMCP 会自动处理工具调用，这里主要用于测试
        switch (name) {
            case 'execute_vscode_command':
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
        // 配置更新逻辑
        console.log('VSCode internal command MCP configuration updated');
    }

    public dispose() {
        this.stop();
        this.statusBarItem.dispose();
    }
}
