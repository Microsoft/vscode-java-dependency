// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Event, Extension, ExtensionContext, extensions, tasks, Uri } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { contextManager } from "../extension.bundle";
import { Commands } from "./commands";
import { Build, Context } from "./constants";
import { LibraryController } from "./controllers/libraryController";
import { ProjectController } from "./controllers/projectController";
import { init as initExpService } from "./ExperimentationService";
import { ExportJarTaskProvider } from "./exportJarSteps/ExportJarTaskProvider";
import { Settings } from "./settings";
import { syncHandler } from "./syncHandler";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<any> {
    contextManager.initialize(context);
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    return instrumentOperation("activation", activateExtension)(context);
}

async function activateExtension(_operationId: string, context: ExtensionContext): Promise<void> {
    context.subscriptions.push(new ProjectController(context));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand(Commands.JAVA_PROJECT_ACTIVATE, async () => {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        if (extension) {
            await extension.activate();
            const extensionApi: any = extension.exports;
            if (!extensionApi) {
                return;
            }

            serverMode = extensionApi.serverMode;

            if (extensionApi.onDidClasspathUpdate) {
                const onDidClasspathUpdate: Event<Uri> = extensionApi.onDidClasspathUpdate;
                context.subscriptions.push(onDidClasspathUpdate(async () => {
                    await commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                }));
            }

            if (extensionApi.onDidServerModeChange) {
                const onDidServerModeChange: Event<string> = extensionApi.onDidServerModeChange;
                context.subscriptions.push(onDidServerModeChange(async (mode: string) => {
                    serverMode = mode;
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */false);
                }));
            }

            if (extensionApi.onDidProjectsImport) {
                const onDidProjectsImport: Event<Uri[]> = extensionApi.onDidProjectsImport;
                context.subscriptions.push(onDidProjectsImport(async () => {
                    commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
                }));
            }
        }

        Settings.initialize(context);

        context.subscriptions.push(new LibraryController(context));
        context.subscriptions.push(DependencyExplorer.getInstance(context));
        context.subscriptions.push(contextManager);
        context.subscriptions.push(syncHandler);
        context.subscriptions.push(tasks.registerTaskProvider(ExportJarTaskProvider.exportJarType, new ExportJarTaskProvider()));
        contextManager.setContextValue(Context.EXTENSION_ACTIVATED, true);
        contextManager.setContextValue(Context.SUPPORTED_BUILD_FILES, Build.FILE_NAMES);

        initExpService(context);
    }));
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

export function isStandardServerReady(): boolean {
    // undefined serverMode indicates an older version language server
    if (serverMode === undefined) {
        return true;
    }

    if (serverMode !== LanguageServerMode.Standard) {
        return false;
    }

    return true;
}

export function isLightWeightMode(): boolean {
    return serverMode === LanguageServerMode.LightWeight;
}

export function isSwitchingServer(): boolean {
    return serverMode === LanguageServerMode.Hybrid;
}

let serverMode: string | undefined;

export const enum LanguageServerMode {
    LightWeight = "LightWeight",
    Standard = "Standard",
    Hybrid = "Hybrid",
}
