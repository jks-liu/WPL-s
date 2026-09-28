import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('ZHIHU');

export function Output(str: string, level?: string) {
    if (level) {
        switch (level) {
            case 'warn': 
                vscode.window.showWarningMessage(str);
                break;
            case 'info': 
                vscode.window.showInformationMessage(str);
                break;
            case 'error': 
                vscode.window.showErrorMessage(str);
                break;
        }        
    }
    channel.appendLine(str);
}

export function showOutput(): void {
    channel.show(true);
}

export function reportOperationError(operation: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const summary = message.startsWith(`${operation}失败`) ? message : `${operation}失败：${message}`;
    Output(`${operation}失败：${error instanceof Error ? error.stack ?? message : message}`);
    void vscode.window.showErrorMessage(summary, "查看日志")
        .then(action => {
            if (action === "查看日志") showOutput();
        });
}
