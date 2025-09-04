import * as vscode from 'vscode';

export interface CommandTaskDefinition extends vscode.TaskDefinition {
    type: 'vscode-command';
    command: string;
    arguments?: any[];
    delay?: number;
    taskId?: string;
}

export class CommandTaskProvider implements vscode.TaskProvider {
    static readonly taskType = 'vscode-command';
    private tasks: vscode.Task[] = [];
    private taskCounter = 0;

    constructor() {}

    public provideTasks(): Thenable<vscode.Task[]> | undefined {
        // 返回当前可用的任务列表
        return Promise.resolve(this.tasks);
    }

    public resolveTask(task: vscode.Task): vscode.Task | undefined {
        const definition = task.definition as CommandTaskDefinition;
        if (definition.type === CommandTaskProvider.taskType) {
            // 解析并返回完整的任务定义
            return this.createTask(definition);
        }
        return undefined;
    }

    public createCommandTask(command: string, args?: any[], delay?: number): vscode.Task {
        const taskId = `cmd_${++this.taskCounter}_${Date.now()}`;

        const definition: CommandTaskDefinition = {
            type: CommandTaskProvider.taskType,
            command: command,
            arguments: args,
            delay: delay || 0,
            taskId: taskId,
        };

        return this.createTask(definition);
    }

    private createTask(definition: CommandTaskDefinition): vscode.Task {
        const taskName = `Execute: ${definition.command}`;

        // 创建 ShellExecution 来执行我们的命令处理脚本
        const execution = new vscode.ProcessExecution('node', ['-e', this.generateExecutionScript(definition)], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        });

        const task = new vscode.Task(
            definition,
            vscode.TaskScope.Workspace,
            taskName,
            'vscode-command-mcp',
            execution,
            [], // problem matchers
        );

        // 设置为后台任务
        task.isBackground = true;
        task.presentationOptions = {
            echo: true,
            reveal: vscode.TaskRevealKind.Silent, // 不自动显示终端
            focus: false,
            panel: vscode.TaskPanelKind.Dedicated,
            showReuseMessage: false,
            clear: false,
        };

        // 添加到任务列表
        this.tasks.push(task);

        return task;
    }

    private generateExecutionScript(definition: CommandTaskDefinition): string {
        // 生成 Node.js 脚本来执行 VSCode 命令
        return `
const vscode = require('vscode');

async function executeCommand() {
    try {
        console.log('Task ${definition.taskId}: Starting execution of command: ${definition.command}');
        
        ${
            definition.delay && definition.delay > 0
                ? `
        console.log('Task ${definition.taskId}: Waiting ${definition.delay}ms before execution...');
        await new Promise(resolve => setTimeout(resolve, ${definition.delay}));
        `
                : ''
        }
        
        console.log('Task ${definition.taskId}: Executing command: ${definition.command}');
        
        // 注意：在独立进程中无法直接调用 vscode.commands.executeCommand
        // 我们需要通过其他方式来执行命令
        console.log('Task ${definition.taskId}: Command would be executed here');
        console.log('Arguments:', ${JSON.stringify(definition.arguments || [])});
        
        console.log('Task ${definition.taskId}: Command execution completed');
        
    } catch (error) {
        console.error('Task ${definition.taskId}: Command execution failed:', error.message);
        process.exit(1);
    }
}

executeCommand();
        `;
    }

    public async executeCommandAsTask(command: string, args?: any[], delay?: number): Promise<string> {
        const task = this.createCommandTask(command, args, delay);
        const definition = task.definition as CommandTaskDefinition;

        try {
            // 执行任务
            const execution = await vscode.tasks.executeTask(task);

            console.log(`Task ${definition.taskId} started for command: ${command}`);

            // 监听任务完成
            const disposable = vscode.tasks.onDidEndTask(e => {
                if (e.execution === execution) {
                    console.log(`Task ${definition.taskId} completed`);
                    disposable.dispose();

                    // 从任务列表中移除已完成的任务
                    const index = this.tasks.findIndex(
                        t => (t.definition as CommandTaskDefinition).taskId === definition.taskId,
                    );
                    if (index !== -1) {
                        this.tasks.splice(index, 1);
                    }
                }
            });

            return definition.taskId!;
        } catch (error) {
            console.error(`Failed to execute task for command ${command}:`, error);
            throw error;
        }
    }

    public getActiveTasks(): vscode.Task[] {
        return [...this.tasks];
    }

    public async cancelTask(taskId: string): Promise<boolean> {
        const task = this.tasks.find(t => (t.definition as CommandTaskDefinition).taskId === taskId);

        if (task) {
            // VS Code 没有直接取消任务的 API，但我们可以从列表中移除
            const index = this.tasks.indexOf(task);
            if (index !== -1) {
                this.tasks.splice(index, 1);
                return true;
            }
        }

        return false;
    }

    public clearAllTasks(): number {
        const count = this.tasks.length;
        this.tasks = [];
        return count;
    }
}
