// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as micromatch from "micromatch";
import * as path from "path";
import { commands, ConfigurationChangeEvent, Disposable, ExtensionContext, Uri, window, workspace } from "vscode";
import { instrumentOperation } from "vscode-extension-telemetry-wrapper";
import * as xml2js from "xml2js";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { Utility } from "../utility";

export class ProjectController implements Disposable {
    public constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(Commands.JAVA_PROJECT_CREATE,
            instrumentOperation(Commands.JAVA_PROJECT_CREATE, () => this.createJavaProject())));
        context.subscriptions.push(workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
            if (e.affectsConfiguration("files.exclude")) {
                this.refreshExcludeFilters();
            }
        }));
        this.refreshExcludeFilters();
    }

    public dispose() {}

    public async createJavaProject() {
        const javaVersion: number = await this.getJavaVersion();
        if (!javaVersion) {
            return;
        }
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        const location: Uri[] = await window.showOpenDialog({
            defaultUri: workspaceFolder && workspaceFolder.uri,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: "Select the location",
        });
        if (!location || !location.length) {
            return;
        }
        const basePath: string = location[0].fsPath;
        const projectName: string = await window.showInputBox({
            prompt: "Input a java project name",
            validateInput: (name: string): string => {
                if (name && !name.match(/^[^*~/\\]+$/)) {
                    return "Please input a valid project name";
                }
                if (name && fse.pathExistsSync(path.join(basePath, name))) {
                    return "A project with this name already exists.";
                }
                return null;
            },
        });
        if (!projectName) {
            return;
        }
        if (await this.scaffoldJavaProject(basePath, projectName, javaVersion)) {
            const openInNewWindow = workspace && !_.isEmpty(workspace.workspaceFolders);
            return commands.executeCommand("vscode.openFolder", Uri.file(path.join(basePath, projectName)), openInNewWindow);
        }
    }

    private async scaffoldJavaProject(basePath: string, projectName: string, javaVersion: number): Promise<boolean> {
        const projectRoot: string = path.join(basePath, projectName);
        const templateRoot: string = path.join(this.context.extensionPath, "templates");
        const projectFile: string = path.join(projectRoot, ".project");
        try {
            let jdkSpecificTemplateRoot: string = path.join(templateRoot, `Java${javaVersion}`);
            if (!await fse.pathExists(jdkSpecificTemplateRoot)) {
                // fall back to 8
                jdkSpecificTemplateRoot = path.join(templateRoot, `Java8`);
            }
            await fse.ensureDir(projectRoot);
            await Promise.all([
                fse.copy(path.join(templateRoot, "App.java.sample"), path.join(projectRoot, "src", "app", "App.java")),
                fse.copy(jdkSpecificTemplateRoot, projectRoot),
                fse.copy(path.join(templateRoot, ".project"), path.join(projectRoot, ".project")),
                fse.ensureDir(path.join(projectRoot, "bin")),
            ]);

            // replace the project name with user input project name
            const xml: string = await fse.readFile(projectFile, "utf8");
            const jsonObj: any = await Utility.parseXml(xml);
            jsonObj.projectDescription.name = projectName;
            const builder: xml2js.Builder = new xml2js.Builder();
            const newXml: string = builder.buildObject(jsonObj);
            await fse.writeFile(projectFile, newXml);
        } catch (error) {
            window.showErrorMessage(error.message);
            return;
        }
        return true;
    }

    private async getJavaVersion(): Promise<number> {
        let javaVersion: number;
        try {
            const javaHome: string = await Utility.checkJavaRuntime();
            javaVersion = await Utility.checkJavaVersion(javaHome);
        } catch (error) {
            window.showErrorMessage(error.message, error.label).then((selection) => {
                if (error.label && error.label === selection && error.openUrl) {
                    commands.executeCommand("vscode.open", error.openUrl);
                }
            });
            return;
        }
        return javaVersion;
    }

    private async refreshExcludeFilters() {
        const patterns: string[] = [];
        const excludeSetting = workspace.getConfiguration("files", null).get<{ [pattern: string]: boolean }>("exclude");
        for (const pattern of  Object.keys(excludeSetting)) {
            if (excludeSetting[pattern]) {
                patterns.push(micromatch.makeRe(pattern).source);
            }
        }
        const filterUpated = await Jdtls.updateFilters(patterns);
        if (filterUpated) {
            await commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH, /* debounce = */true);
        }
    }
}
