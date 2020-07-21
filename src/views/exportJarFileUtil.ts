// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { EOL, platform } from "os";
import { basename, extname, join } from "path";
import { CancellationToken, commands, Extension, extensions, ProgressLocation,
         QuickInputButtons, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { isStandardServerReady } from "../extension";
import { Jdtls } from "../java/jdtls";
import { INodeData } from "../java/nodeData";
import { buildWorkspace } from "./build";
import { IJarQuickPickItem } from "./IJarQuickPickItem";
import { WorkspaceNode } from "./workspaceNode";

enum ExportSteps{
    ResolveProject = "RESOLVEPROJECT",
    ResolveMainMethod = "RESOLVEMAINMETHOD",
    GenerateJar = "GENERATEJAR",
    Finish = "FINISH"
}

let mainMethods: MainMethodInfo[];

export async function createJarFile(node?: INodeData) {
    if (!isStandardServerReady()) {
        return;
    }
    window.withProgress({
        location: ProgressLocation.Window,
        title: "Exporting Jar... ",
        cancellable: true,
    }, (progress, token): Promise<string> => {
        return new Promise<string>(async (resolve, reject) => {
            token.onCancellationRequested(() => {
                return reject("User Cancelled.");
            });
            progress.report({ increment: 10, message: "Building workspace..." });
            if (await buildWorkspace() === false) {
                return reject();
            }
            mainMethods = await Jdtls.getMainMethod();
            const pickSteps: string[] = [];
            let step: string = ExportSteps.ResolveProject;
            let rootNodes: INodeData[] = [];
            let projectFolder: string;
            let projectUri: Uri;
            let pickResult: string;
            let outputFileName: string;
            while (step !== ExportSteps.Finish) {
                try {
                    switch (step) {
                        case ExportSteps.ResolveProject: {
                            projectFolder = await resolveProject(progress, token, pickSteps, node);
                            projectUri = Uri.parse(projectFolder);
                            rootNodes = await Jdtls.getProjects(projectUri.toString());
                            step = ExportSteps.ResolveMainMethod;
                            break;
                        }
                        case ExportSteps.ResolveMainMethod: {
                            pickResult = await resolveMainMethod(progress, token, pickSteps, projectUri.fsPath);
                            step = ExportSteps.GenerateJar;
                            break;
                        }
                        case ExportSteps.GenerateJar: {
                            outputFileName = await generateJar(progress, token, pickSteps, rootNodes, pickResult, projectUri.fsPath);
                            resolve(outputFileName);
                            step = ExportSteps.Finish;
                            break;
                        }
                    }
                } catch (err) {
                    if (err === InputFlowAction.back) {
                        step = pickSteps.pop();
                        continue;
                    } else {
                        return reject(err);
                    }
                }
            }
        });
    }).then((message) => { successMessage(message); }, (err) => { failMessage(err); });
}

function resolveProject(progress, token: CancellationToken, pickSteps: string[], node?: INodeData): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject("User Cancelled.");
        }
        if (node instanceof WorkspaceNode) {
            return resolve(node.uri);
        }
        const folders = workspace.workspaceFolders;
        if (folders && folders.length) {
            if (folders.length === 1) {
                return resolve(folders[0].uri.toString());
            }
            progress.report({ increment: 10, message: "Selecting project..." });
            const pickNodes: IJarQuickPickItem[] = [];
            for (const folder of folders) {
                const JarQuickPickItem: IJarQuickPickItem = {
                    label: folder.name,
                    description: folder.uri.fsPath,
                    uri: folder.uri.toString()
                }
                pickNodes.push(JarQuickPickItem);
            }
            const pickBox = window.createQuickPick<IJarQuickPickItem>();
            pickBox.items = pickNodes;
            pickBox.title = "Export Jar - Determine project";
            pickBox.placeholder = "Select the project...";
            pickBox.ignoreFocusOut = true;
            pickBox.onDidAccept(() => {
                pickSteps.push(ExportSteps.ResolveProject);
                resolve(pickBox.selectedItems[0].uri);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        } else {
            return reject("No workspace folder found.");
        }
    });
}

function generateJar(progress, token: CancellationToken, pickSteps: string[], rootNodes: INodeData[],
                     description: string, outputPath: string): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject("User Cancelled.");
        } else if (rootNodes === undefined) {
            return reject("No project found.");
        }
        progress.report({ increment: 10, message: "Resolving classpaths..." });
        let outClassPaths: string[];
        try {
            outClassPaths = await generateOutClassPath(pickSteps, rootNodes, outputPath);
        } catch (e) {
            return reject(e);
        }
        const outputFileName = join(outputPath, basename(outputPath) + ".jar");
        progress.report({ increment: 30, message: "Generating jar..." });
        const exportResult = await Jdtls.exportJar(basename(description), outClassPaths, outputFileName);
        if (exportResult === true) {
            resolve(outputFileName);
        } else {
            reject("Export jar failed.");
        }
    });
}

function resolveMainMethod(progress, token: CancellationToken, pickSteps: string[], projectPath: string): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject("User Cancelled.");
        }
        progress.report({ increment: 10, message: "Resolving main classes..." });
        if (mainMethods === undefined || mainMethods.length === 0) {
            return resolve("");
        }
        progress.report({ increment: 30, message: "Determining main class..." });
        const pickNodes: IJarQuickPickItem[] = [];
        for (const mainMethod of mainMethods) {
            if (Uri.file(mainMethod.path).fsPath.includes(projectPath)) {
                const JarQuickPickItem: IJarQuickPickItem = {
                    label: getName(mainMethod),
                    description: mainMethod.name
                }
                pickNodes.push(JarQuickPickItem);
            }
        }
        if (pickNodes.length === 0) {
            return resolve("");
        } else {
            const pickBox = window.createQuickPick<IJarQuickPickItem>();
            const noMainClassItem: IJarQuickPickItem = {
                label: "No main class",
                description: ""
            }
            pickNodes.push(noMainClassItem);
            pickBox.items = pickNodes;
            pickBox.title = "Export Jar - Determine main class";
            pickBox.placeholder = "Select the main class...";
            pickBox.ignoreFocusOut = true;
            pickBox.buttons = pickSteps.length > 0 ? [(QuickInputButtons.Back)] : [];
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    reject(InputFlowAction.back);
                    pickBox.dispose();
                }
            });
            pickBox.onDidAccept(() => {
                pickSteps.push(ExportSteps.ResolveMainMethod);
                resolve(pickBox.selectedItems[0].description);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        }
    });
}

function failMessage(message: string) {
    window.showInformationMessage(message, "Done");
}

function successMessage(outputFileName: string) {
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

async function generateOutClassPath(pickSteps: string[], rootNodes: INodeData[], projectPath: string): Promise<string[] | undefined> {
    return new Promise<string[] | undefined>(async (resolve, reject) => {
        const extension: Extension<any> | undefined = extensions.getExtension("redhat.java");
        const extensionApi: any = await extension?.activate();
        const outClassPaths: string[] = [];
        const setUris: Set<string> = new Set<string>();
        const pickDependencies: IJarQuickPickItem[] = [];
        const pickedDependencies: IJarQuickPickItem[] = [];
        for (const rootNode of rootNodes) {
            const modulePaths: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "runtime" });
            generateDependencies(modulePaths.classpaths, setUris, pickDependencies, projectPath, true);
            generateDependencies(modulePaths.modulepaths, setUris, pickDependencies, projectPath, true);
            const modulePathsTest: ClasspathResult = await extensionApi.getClasspaths(rootNode.uri, { scope: "test" });
            generateDependencies(modulePathsTest.classpaths, setUris, pickDependencies, projectPath, false);
            generateDependencies(modulePathsTest.modulepaths, setUris, pickDependencies, projectPath, false);
        }
        if (pickDependencies.length === 0) {
            return reject("No class path found.");
        } else if (pickDependencies.length === 1) {
            outClassPaths.push(pickDependencies[0].uri);
            return resolve(outClassPaths);
        }
        const pickBox = window.createQuickPick<IJarQuickPickItem>();
        pickDependencies.sort((node1, node2) => {
            if (node1.description !== node2.description) {
                return node1.description.localeCompare(node2.description);
            }
            if (node1.type !== node2.type) {
                return node2.type.localeCompare(node1.type);
            }
            return node1.label.localeCompare(node2.label);
        });
        pickBox.items = pickDependencies;
        pickDependencies.forEach((pickDependency) => {
            if (pickDependency.picked) {
                pickedDependencies.push(pickDependency);
            }
        });
        pickBox.selectedItems = pickedDependencies;
        pickBox.title = "Export Jar - Determine elements";
        pickBox.placeholder = "Select the elements...";
        pickBox.canSelectMany = true;
        pickBox.ignoreFocusOut = true;
        pickBox.buttons = pickSteps.length > 0 ? [(QuickInputButtons.Back)] : [];
        pickBox.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                reject(InputFlowAction.back);
                pickBox.dispose();
            }
        });
        pickBox.onDidAccept(() => {
            pickBox.selectedItems.forEach((item) => {
                outClassPaths.push(item.uri);
            });
            resolve(outClassPaths);
            pickBox.dispose();
        });
        pickBox.onDidHide(() => {
            reject();
            pickBox.dispose();
        });
        pickBox.show();
    });
}

function generateDependencies(paths: string[], setUris: Set<string>, pickDependencies: IJarQuickPickItem[],
                              projectPath: string, isRuntime: boolean) {
    paths.forEach((classpath: string) => {
        const extName = extname(classpath);
        const baseName = (extName === ".jar") ? basename(classpath) : classpath.substring(projectPath.length + 1);
        const description = (isRuntime) ? "Runtime" : "Test";
        const type = (extName === ".jar") ? "external" : "internal";
        if (!setUris.has(classpath)) {
            setUris.add(classpath);
            const JarQuickPickItem: IJarQuickPickItem = {
                label: baseName,
                description: description,
                uri: classpath,
                type: type,
                picked: isRuntime
            }
            pickDependencies.push(JarQuickPickItem);
        }
    });
}
function getName(data: MainMethodInfo) {
    const point = data.name.lastIndexOf(".");
    if (point === -1) {
        return data.name;
    } else {
        return data.name.substring(point + 1);
    }
}

class ClasspathResult {
    public projectRoot: string;
    public classpaths: string[];
    public modulepaths: string[];
}

export class MainMethodInfo {
    public name: string;
    public path: string;
}

class InputFlowAction {
    public static back = new InputFlowAction();
}
