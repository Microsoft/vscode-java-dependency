// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { posix, win32 } from "path";
import { commands, Extension, extensions, QuickInputButtons, QuickPick, QuickPickItem, Uri, window } from "vscode";
import { sendOperationError } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { GenerateJarExecutor } from "./GenerateJarExecutor";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { ResolveJavaProjectExecutor } from "./ResolveJavaProjectExecutor";
import { ResolveMainClassExecutor } from "./ResolveMainClassExecutor";

export enum ExportJarStep {
    ResolveJavaProject = "Resolve Java Project",
    // ResolveTask is a virtual step for error reporting only.
    ResolveTask = "Resolve task",
    ResolveMainClass = "Resolve main class",
    GenerateJar = "Generate Jar",
    Finish = "Finish",
}

export const stepMap: Map<ExportJarStep, IExportJarStepExecutor> = new Map<ExportJarStep, IExportJarStepExecutor>([
    [ExportJarStep.ResolveJavaProject, new ResolveJavaProjectExecutor()],
    [ExportJarStep.ResolveMainClass, new ResolveMainClassExecutor()],
    [ExportJarStep.GenerateJar, new GenerateJarExecutor()],
]);

export namespace ExportJarTargets {
    export const SETTING_ASKUSER: string = "askUser";
    // tslint:disable-next-line: no-invalid-template-strings
    export const DEFAULT_OUTPUT_PATH: string = "${workspaceFolder}/${workspaceFolderBasename}.jar";
}

export namespace ExportJarConstants {
    export const DEPENDENCIES: string = "dependencies";
    export const TEST_DEPENDENCIES: string = "testDependencies";
    export const COMPILE_OUTPUT: string = "compileOutput";
    export const TEST_COMPILE_OUTPUT: string = "testCompileOutput";
}

export namespace ExportJarMessages {

    export enum StepAction {
        FINDEXECUTOR = "find proper executor",
        GOBACK = "come back to previous step",
        GOAHEAD = "go to next step",
    }

    export enum Field {
        ENTRY = "Entry",
        WORKSPACEFOLDER = "Workspace folder",
        OUTPUTPATH = "Target path",
        MAINCLASS = "Main class",
    }

    export const JAVAWORKSPACES_EMPTY = "No Java workspace found. Please make sure there is at least one valid Java workspace folder in your workspace folders.";
    export const WORKSPACE_EMPTY = "No Java project found in the workspace. Please make sure your workspace contains valid Java project(s).";
    export const PROJECT_EMPTY = "No classpath found in the Java project. Please make sure your Java project is valid.";
    export const CLASSPATHS_EMPTY = "No valid classpath found in the export jar configuration. Please make sure your configuration contains valid classpath(s).";

    export function fieldUndefinedMessage(field: Field, currentStep: ExportJarStep): string {
        return `The value of ${field} is invalid or has not been specified properly, current step: ${currentStep}. The export jar process will exit.`;
    }

    export function stepErrorMessage(action: StepAction, currentStep: ExportJarStep): string {
        return `Cannot ${action} in the wizard, current step: ${currentStep}. The export jar process will exit.`;
    }
}

export function resetStepMetadata(resetTo: ExportJarStep, stepMetadata: IStepMetadata): void {
    if (resetTo === ExportJarStep.ResolveJavaProject) {
        stepMetadata.workspaceFolder = undefined;
        stepMetadata.projectList = [];
        stepMetadata.mainClass = undefined;
    } else if (resetTo === ExportJarStep.ResolveMainClass) {
        stepMetadata.mainClass = undefined;
    }
}

export function createPickBox<T extends QuickPickItem>(title: string, placeholder: string, items: T[],
                                                       backBtnEnabled: boolean, canSelectMany: boolean = false): QuickPick<T> {
    const pickBox = window.createQuickPick<T>();
    pickBox.title = title;
    pickBox.placeholder = placeholder;
    pickBox.canSelectMany = canSelectMany;
    pickBox.items = items;
    pickBox.ignoreFocusOut = true;
    pickBox.buttons = backBtnEnabled ? [(QuickInputButtons.Back)] : [];
    return pickBox;
}

export interface IMessageOption {
    title: string;
    command: string;
    arguments?: any;
}

export function failMessage(message: string, option?: IMessageOption): void {
    sendOperationError("", Commands.VIEW_PACKAGE_EXPORT_JAR, new Error(message));
    if (option === undefined) {
        window.showErrorMessage(message, "Done");
    } else {
        window.showErrorMessage(message, option.title, "Done").then((result) => {
            if (result === option.title) {
                if (option.arguments === undefined) {
                    commands.executeCommand(option.command);
                } else {
                    commands.executeCommand(option.command, ...option.arguments);
                }
            }
        });
    }
}

export function successMessage(outputFileName: string | undefined): void {
    if (!outputFileName) {
        return;
    }
    let openInExplorer: string;
    if (platform() === "win32") {
        openInExplorer = "Reveal in File Explorer";
    } else if (platform() === "darwin") {
        openInExplorer = "Reveal in Finder";
    } else {
        openInExplorer = "Open Containing Folder";
    }
    window.showInformationMessage("Successfully exported jar to" + EOL + outputFileName,
        openInExplorer, "Done").then((messageResult) => {
            if (messageResult === openInExplorer) {
                commands.executeCommand("revealFileInOS", Uri.file(outputFileName));
            }
        });
}

export function toPosixPath(inputPath: string): string {
    return inputPath.split(win32.sep).join(posix.sep);
}

export function toWinPath(inputPath: string): string {
    return inputPath.split(posix.sep).join(win32.sep);
}

export async function getExtensionApi(): Promise<any> {
    const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
    if (extension === undefined) {
        throw new Error("Language Support for Java(TM) by Red Hat isn't running, the export process will be aborted.");
    }
    const extensionApi: any = await extension.activate();
    if (extensionApi.getClasspaths === undefined) {
        throw new Error("Export jar is not supported in the current version of language server, please check and update your Language Support for Java(TM) by Red Hat.");
    }
    return extensionApi;
}

export function disposeLastTerminal(name: string | undefined): void {
    if (!name) {
        return;
    }
    const terminals = window.terminals;
    const presenterTerminals = terminals.filter((terminal) => terminal.name.indexOf(name) >= 0);
    if (presenterTerminals.length > 0) {
        presenterTerminals[presenterTerminals.length - 1].dispose();
    }
}
