import * as vscode from 'vscode';
import { FastMcpServer } from './fastMcpServer';
import { ServerManager } from './serverManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 VSCode internal command MCP extension is now active');
    vscode.window.showInformationMessage(`🚀 VSCode internal command MCP extension is now active`);

    const mcpServer = new FastMcpServer(context);
    const serverManager = new ServerManager(mcpServer);

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

    context.subscriptions.push(startServer, stopServer, showStatus, executeCommand, testMcpTools, mcpServer);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vscodeICommandMcpServer')) {
            mcpServer.updateConfiguration();
        }
    });

    serverManager.initialize();
}

export function deactivate() {
    console.log('VSCode internal command MCP extension is now deactivated');
}
