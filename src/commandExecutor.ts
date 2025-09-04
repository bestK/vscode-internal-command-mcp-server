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


}
