// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, ExtensionContext } from "vscode";
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { Commands } from "./commands";
import { ProjectController } from "./controllers/projectController";
import { Services } from "./services";
import { Settings } from "./settings";
import { DependencyExplorer } from "./views/dependencyExplorer";

export async function activate(context: ExtensionContext): Promise<any> {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    return instrumentOperation("activation", activateExtension)(context);
}

function activateExtension(operationId: string, context: ExtensionContext) {
    commands.executeCommand("setContext", "extensionActivated", true);

    Services.initialize(context);
    Settings.initialize(context);

    context.subscriptions.push(new ProjectController(context));
    context.subscriptions.push(new DependencyExplorer(context));
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}
