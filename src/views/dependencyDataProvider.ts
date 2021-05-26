// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import {
    commands, Event, EventEmitter, ExtensionContext, ProviderResult,
    RelativePattern, TreeDataProvider, TreeItem, Uri, window, workspace,
} from "vscode";
import { instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { contextManager } from "../../extension.bundle";
import { Commands } from "../commands";
import { Context } from "../constants";
import { executeExportJarTask } from "../exportJarSteps/ExportJarTaskProvider";
import { ExportJarReportType, showExportJarReport } from "../exportJarSteps/utility";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { Settings } from "../settings";
import { explorerLock } from "../utils/Lock";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {

    private _onDidChangeTreeData: EventEmitter<ExplorerNode | null | undefined> = new EventEmitter<ExplorerNode | null | undefined>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<ExplorerNode | null | undefined> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] | undefined = undefined;
    private _refreshDelayTrigger: _.DebouncedFunc<((element?: ExplorerNode) => void)>;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean, element?: ExplorerNode) =>
            this.refreshWithLog(debounce, element)));
        context.subscriptions.push(commands.registerCommand(Commands.EXPORT_JAR_REPORT, (type: ExportJarReportType,
                                                                                         terminalId: string, message?: string) => {
            showExportJarReport(type, terminalId, message);
        }));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_EXPORT_JAR, async (node: INodeData) => {
            executeExportJarTask(node);
        }));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.VIEW_PACKAGE_OUTLINE, (uri, range) =>
            window.showTextDocument(Uri.parse(uri), { selection: range })));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_BUILD_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_BUILD_WORKSPACE)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_CLEAN_WORKSPACE, () =>
            commands.executeCommand(Commands.JAVA_CLEAN_WORKSPACE)));
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_UPDATE, async (node: INodeData) => {
            if (!node.uri) {
                window.showErrorMessage("The URI of the project is not available, you can try to update the project by right clicking the project configuration file (pom.xml or *.gradle) from the File Explorer.");
                return;
            }
            const pattern: RelativePattern = new RelativePattern(Uri.parse(node.uri).fsPath, "{pom.xml,*.gradle}");
            const uris: Uri[] = await workspace.findFiles(pattern, null /*exclude*/, 1 /*maxResults*/);
            if (uris.length >= 1) {
                commands.executeCommand(Commands.JAVA_PROJECT_CONFIGURATION_UPDATE, uris[0]);
            }
        }));

        Settings.registerConfigurationListener((updatedConfig, oldConfig) => {
            if (updatedConfig.refreshDelay !== oldConfig.refreshDelay) {
                this.setRefreshDelay(updatedConfig.refreshDelay);
            }
        });
        this.setRefreshDelay();
    }

    public refreshWithLog(debounce?: boolean, element?: ExplorerNode) {
        if (Settings.autoRefresh()) {
            this.refresh(debounce, element);
        } else {
            instrumentOperation(Commands.VIEW_PACKAGE_REFRESH, () => this.refresh(debounce, element))();
        }
    }

    public refresh(debounce = false, element?: ExplorerNode) {
        this._refreshDelayTrigger(element);
        if (!debounce) { // Immediately refresh
            this._refreshDelayTrigger.flush();
        }
    }

    public setRefreshDelay(wait?: number) {
        if (!wait) {
            wait = Settings.refreshDelay();
        }
        if (this._refreshDelayTrigger) {
            this._refreshDelayTrigger.cancel();
        }
        this._refreshDelayTrigger = _.debounce(this.doRefresh, wait);
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Promise<TreeItem> {
        return element.getTreeItem();
    }

    public async getChildren(element?: ExplorerNode): Promise<ExplorerNode[] | undefined | null> {
        if (await languageServerApiManager.isLightWeightMode()) {
            return [];
        }

        await languageServerApiManager.awaitSwitchingServerFinished();

        const children = (!this._rootItems || !element) ?
            await this.getRootNodes() : await element.getChildren();

        explorerNodeCache.saveNodes(children || []);
        return children;
    }

    public getParent(element: ExplorerNode): ProviderResult<ExplorerNode> {
        return element.getParent();
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const projectNodeData = paths.shift();
        const projects = await this.getRootProjects();
        const project = projects ? <DataNode>projects.find((node: DataNode) =>
            node.path === projectNodeData?.path && node.nodeData.name === projectNodeData?.name) : undefined;
        return project?.revealPaths(paths);
    }

    public async getRootProjects(): Promise<ExplorerNode[]> {
        const rootElements = await this.getRootNodes();
        if (rootElements[0] instanceof ProjectNode) {
            return rootElements;
        } else {
            let result: ExplorerNode[] = [];
            for (const rootWorkspace of rootElements) {
                const projects = await rootWorkspace.getChildren();
                if (projects) {
                    result = result.concat(projects);
                }
            }
            return result;
        }
    }

    private doRefresh(element?: ExplorerNode): void {
        if (!element) {
            this._rootItems = undefined;
        }
        explorerNodeCache.removeNodeChildren(element);
        this._onDidChangeTreeData.fire(element);
    }

    private async getRootNodes(): Promise<ExplorerNode[]> {
        try {
            await explorerLock.acquireAsync();

            if (this._rootItems) {
                return this._rootItems;
            }

            const rootItems: ExplorerNode[] = [];
            const folders = workspace.workspaceFolders;
            if (folders && folders.length) {
                if (folders.length > 1) {
                    folders.forEach((folder) => rootItems.push(new WorkspaceNode({
                        name: folder.name,
                        uri: folder.uri.toString(),
                        kind: NodeKind.Workspace,
                    }, undefined)));
                    this._rootItems = rootItems;
                } else {
                    const result: INodeData[] = await Jdtls.getProjects(folders[0].uri.toString());
                    result.forEach((project) => {
                        rootItems.push(new ProjectNode(project, undefined));
                    });
                    this._rootItems = rootItems;
                }
            }
            contextManager.setContextValue(Context.NO_JAVA_PEOJECT, _.isEmpty(rootItems));
            return rootItems;
        } finally {
            explorerLock.release();
        }
    }
}
