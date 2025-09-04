import * as vscode from 'vscode';
import { BackgroundTaskExecutor } from './backgroundTaskExecutor';

export class CommandExecutor {
    private allowedCommands: string[] = [];
    private asyncExecution: boolean = true;
    private executionDelay: number = 0;
    private backgroundExecutor: BackgroundTaskExecutor;

    constructor() {
        console.log('CommandExecutor constructor called');
        this.updateAllowedCommands();
        this.updateAsyncConfig();
        console.log('Creating BackgroundTaskExecutor...');
        this.backgroundExecutor = new BackgroundTaskExecutor();
        console.log('CommandExecutor initialized with async config:', {
            asyncExecution: this.asyncExecution,
            executionDelay: this.executionDelay,
        });
    }

    public async executeCommand(command: string, args?: any[]): Promise<any> {
        if (!this.isCommandAllowed(command)) {
            throw new Error(`Command '${command}' is not allowed`);
        }

        if (this.asyncExecution) {
            // 异步模式：立即返回成功，提交到后台执行器
            const taskId = this.backgroundExecutor.submitTask(command, args, this.executionDelay);
            const stats = this.backgroundExecutor.getTaskStats();

            return {
                success: true,
                async: true,
                taskId: taskId,
                message: `命令 '${command}' 已提交到后台执行${this.executionDelay > 0 ? `，将在 ${this.executionDelay}ms 后执行` : ''}`,
                command: command,
                arguments: args,
                executionDelay: this.executionDelay,
                queueLength: stats.pending + stats.running,
                taskStats: stats,
            };
        } else {
            // 同步模式：等待执行完成
            try {
                const result = await vscode.commands.executeCommand(command, ...(args || []));
                return {
                    success: true,
                    async: false,
                    result: result,
                    command: command,
                    arguments: args,
                };
            } catch (error) {
                return {
                    success: false,
                    async: false,
                    error: error instanceof Error ? error.message : String(error),
                    command: command,
                    arguments: args,
                };
            }
        }
    }

    public getBackgroundTaskStats() {
        return this.backgroundExecutor.getTaskStats();
    }

    public getBackgroundTask(taskId: string) {
        return this.backgroundExecutor.getTask(taskId);
    }

    public getAllBackgroundTasks() {
        return this.backgroundExecutor.getAllTasks();
    }

    public cancelBackgroundTask(taskId: string): boolean {
        return this.backgroundExecutor.cancelTask(taskId);
    }

    public clearCompletedTasks(): number {
        return this.backgroundExecutor.clearCompletedTasks();
    }

    public clearAllTasks(): number {
        return this.backgroundExecutor.clearAllTasks();
    }

    public async getAvailableCommands(): Promise<string[]> {
        try {
            const commands = await vscode.commands.getCommands();
            const filtered =
                this.allowedCommands.length > 0 ? commands.filter(cmd => this.isCommandAllowed(cmd)) : commands;

            return filtered.sort();
        } catch (error) {
            console.error('Failed to get available commands:', error);
            return [];
        }
    }

    public async executeTextCommand(command: string, text?: string): Promise<any> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        const selection = editor.selection;
        const document = editor.document;

        try {
            if (text !== undefined) {
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, text);
                });
            }

            const result = await vscode.commands.executeCommand(command);

            return {
                success: true,
                result: result,
                command: command,
                text: text,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                command: command,
                text: text,
            };
        }
    }

    public async getEditorInfo(): Promise<any> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { hasActiveEditor: false };
        }

        const document = editor.document;
        const selection = editor.selection;

        return {
            hasActiveEditor: true,
            fileName: document.fileName,
            languageId: document.languageId,
            lineCount: document.lineCount,
            selection: {
                start: { line: selection.start.line, character: selection.start.character },
                end: { line: selection.end.line, character: selection.end.character },
            },
            selectedText: document.getText(selection),
            currentLine: document.lineAt(selection.active.line).text,
        };
    }

    public async executeWorkspaceCommand(command: string, args?: any[]): Promise<any> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folders available');
            }

            const result = await vscode.commands.executeCommand(command, ...(args || []));
            return {
                success: true,
                result: result,
                command: command,
                arguments: args,
                workspaceFolders: workspaceFolders.map(folder => folder.uri.fsPath),
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                command: command,
                arguments: args,
            };
        }
    }

    private isCommandAllowed(command: string): boolean {
        if (this.allowedCommands.length === 0) {
            return true;
        }

        return this.allowedCommands.some(allowed => {
            if (allowed.endsWith('*')) {
                const prefix = allowed.slice(0, -1);
                return command.startsWith(prefix);
            }
            return command === allowed;
        });
    }

    public updateAllowedCommands() {
        const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
        this.allowedCommands = config.get<string[]>('allowedCommands', []);
    }

    public updateAsyncConfig() {
        const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
        const oldAsyncExecution = this.asyncExecution;
        const oldExecutionDelay = this.executionDelay;

        // 检查配置值
        const rawAsyncExecution = config.get('asyncExecution');
        const rawExecutionDelay = config.get('executionDelay');

        console.log('Raw config values:', {
            asyncExecution: rawAsyncExecution,
            executionDelay: rawExecutionDelay,
            configSection: 'vscode-internal-command-mcp-server',
        });

        this.asyncExecution = config.get<boolean>('asyncExecution', true);
        this.executionDelay = config.get<number>('executionDelay', 0);

        console.log(
            `Async config updated: asyncExecution=${oldAsyncExecution}->${this.asyncExecution}, executionDelay=${oldExecutionDelay}->${this.executionDelay}`,
        );

        // 如果异步执行被禁用，清理待处理的任务
        if (!this.asyncExecution && this.backgroundExecutor) {
            const stats = this.backgroundExecutor.getTaskStats();
            if (stats.pending > 0) {
                console.log(`Async execution disabled, clearing ${stats.pending} pending tasks`);
                vscode.window.showWarningMessage(`异步执行已禁用，将清除 ${stats.pending} 个待处理任务`);
                this.backgroundExecutor.clearAllTasks();
            }
        }
    }

    public getAllowedCommands(): string[] {
        return [...this.allowedCommands];
    }

    public getAsyncConfig(): { asyncExecution: boolean; executionDelay: number } {
        return {
            asyncExecution: this.asyncExecution,
            executionDelay: this.executionDelay,
        };
    }

    public async getCommandInfo(command: string): Promise<any> {
        try {
            const commands = await vscode.commands.getCommands(true);
            const exists = commands.includes(command);

            return {
                command: command,
                exists: exists,
                allowed: this.isCommandAllowed(command),
            };
        } catch (error) {
            return {
                command: command,
                exists: false,
                allowed: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public async executeWithUserInput(): Promise<void> {
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

            if (result !== undefined) {
                this.showResult(result, command);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
        }
    }

    public async showAvailableCommandsToUser(): Promise<void> {
        try {
            const commands = await vscode.commands.getCommands();
            const selectedCommand = await vscode.window.showQuickPick(commands, {
                placeHolder: 'Select a VSCode command to execute',
            });

            if (selectedCommand) {
                await vscode.commands.executeCommand(selectedCommand);
                vscode.window.showInformationMessage(`Command executed: ${selectedCommand}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get commands: ${error}`);
        }
    }

    private showResult(result: any, command: string): void {
        const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        const panel = vscode.window.createWebviewPanel(
            'commandResult',
            `Command Result: ${command}`,
            vscode.ViewColumn.Beside,
            {},
        );

        panel.webview.html = this.generateResultHtml(command, resultText);
    }

    private generateResultHtml(command: string, result: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Command Result</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .command {
                        font-family: var(--vscode-editor-font-family);
                        background-color: var(--vscode-textBlockQuote-background);
                        padding: 10px;
                        border-radius: 3px;
                        margin-bottom: 20px;
                    }
                    .result {
                        font-family: var(--vscode-editor-font-family);
                        background-color: var(--vscode-textCodeBlock-background);
                        padding: 15px;
                        border-radius: 3px;
                        white-space: pre-wrap;
                        overflow-x: auto;
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
                <div class="header">
                    <h2>Command Execution Result</h2>
                    <div class="command">Command: ${command}</div>
                </div>
                <div class="result">${this.escapeHtml(result)}</div>
                <button class="copy-button" onclick="copyResult()">Copy Result</button>
                <script>
                    function copyResult() {
                        const resultText = document.querySelector('.result').textContent;
                        navigator.clipboard.writeText(resultText).then(() => {
                            alert('Result copied to clipboard!');
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
}
