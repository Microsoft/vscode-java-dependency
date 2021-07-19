// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fse from "fs-extra";
import { platform } from "os";
import * as path from "path";
import * as seleniumWebdriver from "selenium-webdriver";
import { EditorView, InputBox, ModalDialog, SideBarView, StatusBar, TextEditor, TreeItem, Workbench } from "vscode-extension-tester";
import { DialogHandler, OpenDialog } from "vscode-extension-tester-native";

// tslint:disable: only-arrow-functions
const newProjectName = "helloworld";
const mavenProjectPath = path.join(__dirname, "..", "..", "..", "test", "maven");
const mavenWorkspacePath = path.join(__dirname, "..", "..", "..", "test", "maven.code-workspace");
const invisibleProjectPath = path.join(__dirname, "..", "..", "..", "test", "invisible");
const invisibleWorkspacePath = path.join(__dirname, "..", "..", "..", "test", "invisible.code-workspace");
const targetPath = path.join(__dirname, "..", "..", "..", "test", "newProject");

describe("Command Tests", function() {

    this.timeout(60000);

    before(async function() {
        sleep(5000);
    });

    beforeEach(async function() {
        await sleep(5000);
    });

    it("Test open maven project", async function() {
        await new Workbench().executeCommand("Workspaces: Open Workspace...");
        const dialog: OpenDialog = await DialogHandler.getOpenDialog();
        await dialog.selectPath(mavenWorkspacePath);
        await dialog.confirm();
        const editorView = new EditorView();
        const editorGroups = await editorView.getEditorGroups();
        for (const editorGroup of editorGroups) {
            await editorGroup.closeAllEditors();
        }
        const settingsEditor = await new Workbench().openSettings();
        const setting = await settingsEditor.findSetting("Dialog Style", "Window");
        await setting.setValue("custom");
        const refreshSetting = await settingsEditor.findSetting("Auto Refresh", "Java", "Dependency");
        await refreshSetting.setValue(true);
        const viewSetting = await settingsEditor.findSetting("Package Presentation", "Java", "Dependency");
        await viewSetting.setValue("flat");
        await sleep(1000);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].collapse();
        await waitForImporting(1000);
    });

    it("Test javaProjectExplorer.focus", async function() {
        await new Workbench().executeCommand("javaProjectExplorer.focus");
        const section = await new SideBarView().getContent().getSection("Java Projects");
        assert.ok(section.isExpanded());
    });

    it("Test java.view.package.linkWithFolderExplorer", async function() {
        // currently vscode-extension-test framework doesn't support overflow button, so we edit the setting directly.
        const settingsEditor = await new Workbench().openSettings();
        const setting = await settingsEditor.findSetting("Sync With Folder Explorer", "Java", "Dependency");
        await setting.setValue(true);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].expand();
        const srcNode = await fileSections[0].findItem("src") as TreeItem;
        await srcNode.expand();
        const folderNode = await fileSections[0].findItem("main") as TreeItem;
        await folderNode.expand();
        const subFolderNode = await fileSections[0].findItem("app") as TreeItem;
        await subFolderNode.expand();
        const fileNode = await fileSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await sleep(1000);
        await fileSections[0].collapse();
        const section = await new SideBarView().getContent().getSection("Java Projects");
        await section.expand();
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        if (!packageNode) {
            let visibleItems = "";
            for (const item of await section.getVisibleItems()) {
                visibleItems = `${visibleItems} ${await item.getText()}`;
            }
            assert.fail(`get package node failed. Visible items are: ${visibleItems}`);
        }
        assert.ok(await packageNode.isExpanded());
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed());
        await packageNode.collapse();
    });

    it("Test java.view.package.unLinkWithFolderExplorer", async function() {
        // currently vscode-extension-test framework doesn't support overflow button, so we edit the setting directly.
        const settingsEditor = await new Workbench().openSettings();
        const setting = await settingsEditor.findSetting("Sync With Folder Explorer", "Java", "Dependency");
        await setting.setValue(false);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].expand();
        const fileNode = await fileSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await sleep(1000);
        await fileSections[0].collapse();
        const section = await new SideBarView().getContent().getSection("Java Projects");
        await section.expand();
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        assert.ok(!await packageNode.isExpanded());
    });

    it("Test java.view.package.newJavaClass", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const item = await section.findItem("my-app") as TreeItem;
        if (!item) {
            assert.fail("can't find project node `my-app`");
        }
        await item.click();
        const button = await item.getActionButton("New Java Class");
        if (!button) {
            assert.fail("can't find button `New Java Class`");
        }
        await button?.click();
        let inputBox = await InputBox.create();
        assert.ok(await inputBox.getPlaceHolder() === "Choose a source folder");
        const quickPick = await inputBox.findQuickPick("src/main/java");
        await quickPick?.click();
        inputBox = await InputBox.create();
        assert.ok(await inputBox.getPlaceHolder() === "Input the class name");
        await inputBox.setText("App2");
        await inputBox.confirm();
        await sleep(1000);
        const editor = new TextEditor();
        await editor.save();
        assert.ok(await editor.getTitle() === "App2.java");
        assert.ok(await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "App2.java")));
        await fse.remove(path.join(mavenProjectPath, "src", "main", "java", "App2.java"));
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.newPackage", async function() {
        // The current UI test framework doesn't support mac title bar and context menus.
        // See: https://github.com/redhat-developer/vscode-extension-tester#requirements
        // So we dismiss some UI tests on mac.
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const item = await section.findItem("my-app") as TreeItem;
        await item.click();
        const contextMenu = await item.openContextMenu();
        const newPackageItem = await contextMenu.getItem("New Package");
        await newPackageItem?.click();
        let inputBox = await InputBox.create();
        assert.equal(await inputBox.getPlaceHolder(), "Choose a source folder");
        const quickPick = await inputBox.findQuickPick("src/main/java");
        await quickPick?.click();
        inputBox = await InputBox.create();
        assert.equal(await inputBox.getPlaceHolder(), "Input the package name");
        await inputBox.setText("com.mycompany.app2");
        await inputBox.confirm();
        await sleep(1000);
        assert.ok(await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "com", "mycompany", "app2")));
        await fse.remove(path.join(mavenProjectPath, "src", "main", "java", "com", "mycompany", "app2"));
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.revealInProjectExplorer", async function() {
        const fileExplorerSections = await new SideBarView().getContent().getSections();
        await fileExplorerSections[0].expand();
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        await packageNode.click();
        await packageNode.collapse();
        const srcNode = await fileExplorerSections[0].findItem("src") as TreeItem;
        await srcNode.expand();
        const folderNode = await fileExplorerSections[0].findItem("main") as TreeItem;
        await folderNode.expand();
        const fileNode = await fileExplorerSections[0].findItem("App.java") as TreeItem;
        const menu = await fileNode.openContextMenu();
        const copyItem = await menu.getItem("Reveal in Java Project Explorer");
        await copyItem?.click();
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed());
        await fileExplorerSections[0].collapse();
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.renameFile", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        await section.click();
        const classNode = await section.findItem("AppToRename") as TreeItem;
        await classNode.click();
        const menu = await classNode.openContextMenu();
        const copyItem = await menu.getItem("Rename");
        await copyItem?.click();
        const inputBox = await InputBox.create();
        await inputBox.setText("AppRenamed");
        await inputBox.confirm();
        await sleep(1000);
        const dialog = new ModalDialog();
        const buttons = await dialog.getButtons();
        for (const button of buttons) {
            if (await button.getText() === "OK") {
                await button.click();
                break;
            }
        }
        await sleep(5000);
        const editor = new TextEditor();
        await editor.save();
        assert.ok(await editor.getTitle() === "AppRenamed.java");
        assert.ok(await section.findItem("AppRenamed"));
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.moveFileToTrash", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const classNode = await section.findItem("AppToDelete") as TreeItem;
        await classNode.click();
        const menu = await classNode.openContextMenu();
        const copyItem = await menu.getItem("Delete");
        await copyItem?.click();
        const dialog = new ModalDialog();
        const buttons = await dialog.getButtons();
        for (const button of buttons) {
            if (await button.getText() === "Move to Recycle Bin") {
                await button.click();
                break;
            }
        }
        await sleep(1000);
        assert.ok(!await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "AppToDelete.java")));
    });

    it("Test change to invisible project", async function() {
        await new Workbench().executeCommand("Workspaces: Open Workspace...");
        const dialog: OpenDialog = await DialogHandler.getOpenDialog();
        await dialog.selectPath(invisibleWorkspacePath);
        await dialog.confirm();
        await sleep(1000);
        const fileExplorerSections = await new SideBarView().getContent().getSections();
        const folderNode = await fileExplorerSections[0].findItem("src") as TreeItem;
        await folderNode.expand();
        const fileNode = await fileExplorerSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await waitForImporting(1000);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].collapse();
        await new Workbench().executeCommand("javaProjectExplorer.focus");
    });

    it("Test java.project.addLibraries", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const projectItem = await section.findItem("invisible") as TreeItem;
        await projectItem.expand();
        await sleep(1000);
        const referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.click();
        const buttons = await referencedItem.getActionButtons();
        await buttons[0].click();
        const dialog: OpenDialog = await DialogHandler.getOpenDialog();
        await dialog.selectPath(path.join(invisibleProjectPath, "libSource", "jcommander-1.72.jar"));
        await dialog.confirm();
        assert.ok(await section.findItem("jcommander-1.72.jar"));
    });

    it("Test java.project.addLibraryFolders", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const projectItem = await section.findItem("invisible") as TreeItem;
        await projectItem.expand();
        await sleep(1000);
        let referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.click();
        const buttons = await referencedItem.getActionButtons();
        await buttons[0].getDriver().actions()
            .mouseMove(buttons[0])
            .keyDown(seleniumWebdriver.Key.ALT)
            .click(buttons[0])
            .keyUp(seleniumWebdriver.Key.ALT)
            .perform();
        const dialog: OpenDialog = await DialogHandler.getOpenDialog();
        await dialog.selectPath(path.join(invisibleProjectPath, "libSourceFolder"));
        await dialog.confirm();
        await sleep(3000);
        referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.expand();
        assert.ok(await section.findItem("junit-jupiter-api-5.4.1.jar"));
        assert.ok(await section.findItem("testng-6.8.7.jar"));
    });

    it("Test java.project.create", async function() {
        await fse.remove(targetPath);
        await fse.ensureDir(targetPath);
        await new Workbench().executeCommand("java.project.create");
        let inputBox = await InputBox.create();
        assert.ok(await inputBox.getPlaceHolder() === "Select the project type");
        const picks = await inputBox.getQuickPicks();
        for (const quickPick of picks) {
            if (await quickPick.getLabel() === "No build tools") {
                await quickPick.click();
            }
        }
        const dialog: OpenDialog = await DialogHandler.getOpenDialog();
        await dialog.selectPath(targetPath);
        await dialog.confirm();
        inputBox = await InputBox.create();
        await inputBox.setText(newProjectName);
        await inputBox.confirm();
        await sleep(5000);
        assert.ok(await fse.pathExists(path.join(targetPath, newProjectName, "src", "App.java")));
        assert.ok(await fse.pathExists(path.join(targetPath, newProjectName, "README.md")));
    });
});

async function sleep(time: number) {
    await new Promise((resolve) => setTimeout(resolve, time));
}

async function waitForImporting(time: number) {
    await new Promise<void>(async (resolve) => {
        const interval = setInterval(async () => {
            const item = await new StatusBar().getItem("ServiceReady");
            if (item) {
                clearInterval(interval);
                resolve();
            }
        }, time);
    });
}
