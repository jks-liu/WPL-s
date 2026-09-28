import * as vscode from "vscode";
import { type IProfile } from "../model/target/target";

export class ActionsTreeviewProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.changeEmitter.event;
    private profile: IProfile | undefined;
    private state: "loading" | "ready" | "error" = "loading";
    private errorMessage: string | undefined;

    setLoading(): void {
        this.state = "loading";
        this.errorMessage = undefined;
        this.changeEmitter.fire();
    }

    setReady(): void {
        this.state = "ready";
        this.errorMessage = undefined;
        this.changeEmitter.fire();
    }

    setError(message: string): void {
        this.state = "error";
        this.errorMessage = message;
        this.changeEmitter.fire();
    }

    setProfile(profile: IProfile | undefined): void {
        this.profile = profile;
        this.changeEmitter.fire();
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }

    getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
        return item;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (element) return [];
        if (this.state === "loading") {
            const item = new vscode.TreeItem("正在初始化知乎扩展…", vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon("loading~spin");
            return [item];
        }
        if (this.state === "error") {
            const error = new vscode.TreeItem("初始化失败", vscode.TreeItemCollapsibleState.None);
            error.tooltip = this.errorMessage;
            error.iconPath = new vscode.ThemeIcon("error");
            return [error, actionItem("重试初始化", "zhihu.retryInitialization", "refresh"), actionItem("查看错误日志", "zhihu.showLog", "output")];
        }
        if (!this.profile) {
            return [actionItem("登录知乎", "zhihu.login", "sign-in"), actionItem("搜索知乎", "zhihu.search", "search")];
        }

        const account = new vscode.TreeItem(`已登录：${this.profile.name}`, vscode.TreeItemCollapsibleState.None);
        account.iconPath = new vscode.ThemeIcon("account");
        return [account, actionItem("搜索知乎", "zhihu.search", "search"), actionItem("退出登录", "zhihu.logout", "sign-out")];
    }
}

function actionItem(label: string, command: string, icon: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.command = { command, title: label };
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
}
