import * as vscode from 'vscode';

export interface BackgroundTask {
    id: string;
    command: string;
    args?: any[];
    delay: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    result?: any;
    error?: string;
}

export class BackgroundTaskExecutor {
    private tasks = new Map<string, BackgroundTask>();
    private taskCounter = 0;
    private isRunning = true;
    private processingInterval: NodeJS.Timeout | undefined;

    constructor() {
        this.startTaskProcessor();
    }

    public submitTask(command: string, args?: any[], delay: number = 0): string {
        const taskId = `bg_task_${++this.taskCounter}_${Date.now()}`;

        const task: BackgroundTask = {
            id: taskId,
            command,
            args,
            delay,
            status: 'pending',
            createdAt: Date.now(),
        };

        this.tasks.set(taskId, task);

        console.log(
            `Background task submitted: ${taskId} - ${command}, delay: ${delay}ms, isRunning: ${this.isRunning}`,
        );
        console.log(`Total tasks in queue: ${this.tasks.size}`);
        // vscode.window.showInformationMessage(`任务已提交到后台队列: ${command} (ID: ${taskId})`);

        return taskId;
    }

    private startTaskProcessor(): void {
        console.log('Starting background task processor...');

        // 使用 setInterval 来定期检查和处理任务
        this.processingInterval = setInterval(() => {
            try {
                this.processPendingTasks();
            } catch (error) {
                console.error('Error in task processor:', error);
            }
        }, 100); // 每100ms检查一次

        console.log('Background task processor started with interval ID:', this.processingInterval);

        // 立即检查一次
        setTimeout(() => {
            console.log('Initial task check...');
            this.processPendingTasks();
        }, 50);
    }

    private processPendingTasks(): void {
        if (!this.isRunning) {
            return;
        }

        const pendingTasks = Array.from(this.tasks.values())
            .filter(task => task.status === 'pending')
            .sort((a, b) => a.createdAt - b.createdAt); // 按创建时间排序

        if (pendingTasks.length > 0) {
            console.log(`Processing ${pendingTasks.length} pending tasks`);
        }

        for (const task of pendingTasks) {
            if (task.status !== 'pending') {
                continue;
            }

            const now = Date.now();
            const shouldExecute = now - task.createdAt >= task.delay;

            console.log(
                `Task ${task.id}: created=${task.createdAt}, now=${now}, delay=${task.delay}, shouldExecute=${shouldExecute}`,
            );

            if (shouldExecute) {
                console.log(`Executing task ${task.id} now`);
                // 不要等待执行完成，立即处理下一个任务
                this.executeTask(task).catch(error => {
                    console.error(`Error executing task ${task.id}:`, error);
                });
            }
        }
    }

    private async executeTask(task: BackgroundTask): Promise<void> {
        if (task.status !== 'pending') {
            return;
        }

        task.status = 'running';
        task.startedAt = Date.now();

        console.log(`Executing background task: ${task.id} - ${task.command}`);

        try {
            // 在后台执行 VSCode 命令
            const result = await vscode.commands.executeCommand(task.command, ...(task.args || []));

            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = result;

            console.log(`Background task completed: ${task.id}`);

            // 可选：显示完成通知
            const config = vscode.workspace.getConfiguration('vscode-internal-command-mcp-server');
            const showNotifications = config.get<boolean>('showAsyncNotifications', false);

            if (showNotifications) {
                vscode.window.showInformationMessage(`${task.command} Done`);
            }
        } catch (error) {
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = error instanceof Error ? error.message : String(error);

            console.error(`Background task failed: ${task.id}`, error);
            vscode.window.showErrorMessage(`后台任务执行失败: ${task.command} - ${task.error}`);
        }
    }

    public getTask(taskId: string): BackgroundTask | undefined {
        return this.tasks.get(taskId);
    }

    public getAllTasks(): BackgroundTask[] {
        return Array.from(this.tasks.values());
    }

    public getTasksByStatus(status: BackgroundTask['status']): BackgroundTask[] {
        return Array.from(this.tasks.values()).filter(task => task.status === status);
    }

    public cancelTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (task && (task.status === 'pending' || task.status === 'running')) {
            task.status = 'cancelled';
            task.completedAt = Date.now();
            console.log(`Background task cancelled: ${taskId}`);
            return true;
        }
        return false;
    }

    public clearCompletedTasks(): number {
        const completedTasks = Array.from(this.tasks.values()).filter(task =>
            ['completed', 'failed', 'cancelled'].includes(task.status),
        );

        for (const task of completedTasks) {
            this.tasks.delete(task.id);
        }

        console.log(`Cleared ${completedTasks.length} completed background tasks`);
        return completedTasks.length;
    }

    public clearAllTasks(): number {
        const count = this.tasks.size;
        this.tasks.clear();
        console.log(`Cleared all ${count} background tasks`);
        return count;
    }

    public getTaskStats(): {
        total: number;
        pending: number;
        running: number;
        completed: number;
        failed: number;
        cancelled: number;
    } {
        const tasks = Array.from(this.tasks.values());
        return {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            cancelled: tasks.filter(t => t.status === 'cancelled').length,
        };
    }

    public stop(): void {
        this.isRunning = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        console.log('Background task processor stopped');
    }

    public dispose(): void {
        this.stop();
        this.clearAllTasks();
    }
}
