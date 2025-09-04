import * as vscode from 'vscode';
import { FastMcpServer } from './fastMcpServer';
import { ServerManager } from './serverManager';
import { CommandTaskProvider } from './taskProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 VSCode internal command MCP extension is now active');
    vscode.window.showInformationMessage(`🚀 VSCode internal command MCP extension is now active`);

    const mcpServer = new FastMcpServer(context);
    const serverManager = new ServerManager(mcpServer);
    const taskProvider = new CommandTaskProvider();

    const startServer = vscode.commands.registerCommand('vscode-internal-command-mcp-server.startServer', async () => {
        await serverManager.startServer();
    });

    const stopServer = vscode.commands.registerCommand('vscode-internal-command-mcp-server.stopServer', async () => {
        await serverManager.stopServer();
    });

    const showStatus = vscode.commands.registerCommand('vscode-internal-command-mcp-server.showStatus', async () => {
        await serverManager.showStatus();
    });

    const executeCommand = vscode.commands.registerCommand(
        'vscode-internal-command-mcp-server.executeCommand',
        async () => {
            await serverManager.executeCommand();
        },
    );

    const testMcpTools = vscode.commands.registerCommand(
        'vscode-internal-command-mcp-server.testMcpTools',
        async () => {
            await serverManager.testMcpTools();
        },
    );

    // 注册任务提供者
    const taskProviderDisposable = vscode.tasks.registerTaskProvider(CommandTaskProvider.taskType, taskProvider);

    context.subscriptions.push(
        startServer,
        stopServer,
        showStatus,
        executeCommand,
        testMcpTools,
        mcpServer,
        taskProviderDisposable,
    );

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vscode-internal-command-mcp-server')) {
            console.log('Configuration changed, updating MCP server...');

            // 先更新配置
            mcpServer.updateConfiguration();

            // 显示配置更新通知
            const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
            const asyncExecution = config.get<boolean>('asyncExecution', true);
            const executionDelay = config.get<number>('executionDelay', 0);

            vscode.window.showInformationMessage(
                `MCP 配置已更新: 异步执行=${asyncExecution ? '开启' : '关闭'}, 延时=${executionDelay}ms`,
            );
        }
    });

    serverManager.initialize();
}

export function deactivate() {
    console.log('VSCode internal command MCP extension is now deactivated');
}
