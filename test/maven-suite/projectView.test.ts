// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as clipboardy from "clipboardy";
import * as path from "path";
import * as vscode from "vscode";
import { Commands, ContainerNode, contextManager, DependencyExplorer,
    IMainClassInfo,
    INodeData,
    NodeKind,
    PackageNode, PackageRootNode, PrimaryTypeNode, ProjectNode } from "../../extension.bundle";
import { fsPath, setupTestEnv, Uris } from "../shared";

// tslint:disable: only-arrow-functions
suite("Maven Project View Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can node render correctly in hierarchical view", async function() {
        await vscode.workspace.getConfiguration("java.dependency").update("packagePresentation", "hierarchical");
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_CHANGETOHIERARCHICALPACKAGEVIEW);
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "my-app", "Project name should be \"my-app\"");

        const packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 4, "Number of root packages should be 4");
        const mainPackage = packageRoots[0] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");

        const primarySubPackages = await mainPackage.getChildren();
        assert.equal(primarySubPackages.length, 1, "Number of primary subpackages should be 1");
        const primarySubPackage = primarySubPackages[0] as PackageNode;
        assert.equal(primarySubPackage.name, "com.mycompany", "Name of primary subpackage should be \"com.mycompany\"");

        const secondarySubPackages = await primarySubPackage.getChildren();
        assert.equal(secondarySubPackages.length, 2, "Number of secondary subpackages should be 1");
        const firstSecondarySubPackage = secondarySubPackages[0] as PackageNode;
        const secondSecondarySubPackage = secondarySubPackages[1] as PackageNode;
        assert.equal(firstSecondarySubPackage.nodeData.displayName, "app", "Name of first secondary subpackage should be \"app\"");
        assert.equal(secondSecondarySubPackage.nodeData.displayName, "app1", "Name of first secondary subpackage should be \"app1\"");

        // validate innermost layer nodes
        const classes = await firstSecondarySubPackage.getChildren();
        assert.equal(classes.length, 3, "Number of main classes of first package should be 3");
        const firstClass = classes[0] as PrimaryTypeNode;
        const secondClass = classes[1] as PrimaryTypeNode;
        const thirdClass = classes[2] as PrimaryTypeNode;
        assert.equal(firstClass.name, "App", "Name of first class should be \"App\"");
        assert.equal(secondClass.name, "AppToDelete", "Name of second class should be \"AppToDelete\"");
        assert.equal(thirdClass.name, "AppToRename", "Name of third class should be \"AppToRename\"");
    });

    test("Can node render correctly in flat view", async function() {
        await vscode.workspace.getConfiguration("java.dependency").update("packagePresentation", "flat");
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_CHANGETOFLATPACKAGEVIEW);
        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_REFRESH);
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        // validate root nodes
        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "my-app", "Project name should be \"my-app\"");

        // validate package root/dependency nodes
        const packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 4, "Number of root packages should be 4");
        const mainPackage = packageRoots[0] as PackageRootNode;
        const testPackage = packageRoots[1] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");
        assert.equal(testPackage.name, "src/test/java", "Package name should be \"src/test/java\"");
        const systemLibrary = packageRoots[2] as ContainerNode;
        const mavenDependency = packageRoots[3] as ContainerNode;
        // only match prefix of system library since JDK version may differ
        assert.ok(systemLibrary.name.startsWith("JRE System Library"), "Container name should start with JRE System Library");
        assert.equal(mavenDependency.name, "Maven Dependencies", "Container name should be \"Maven Dependencies\"");

        // validate package nodes
        const mainSubPackages = await mainPackage.getChildren();
        const testSubPackages = await testPackage.getChildren();
        assert.equal(mainSubPackages.length, 2, "Number of main sub packages should be 2");
        assert.equal(testSubPackages.length, 1, "Number of test sub packages should be 1");
        const firstMainSubPackage = mainSubPackages[0] as PackageNode;
        const secondMainSubPackage = mainSubPackages[1] as PackageNode;
        const testSubPackage = testSubPackages[0] as PackageNode;
        assert.equal(firstMainSubPackage.name, "com.mycompany.app", "Name of first main subpackage should be \"com.mycompany.app\"");
        assert.equal(secondMainSubPackage.name, "com.mycompany.app1", "Name of second main subpackage should be \"com.mycompany.app1\"");
        assert.equal(testSubPackage.name, "com.mycompany.app", "Name of test subpackage should be \"com.mycompany.app\"");

        // validate innermost layer nodes
        const mainClasses = await firstMainSubPackage.getChildren();
        const testClasses = await testSubPackage.getChildren();
        assert.equal(mainClasses.length, 3, "Number of main classes of first package should be 3");
        assert.equal(testClasses.length, 1, "Number of test classes should be 1");
        const firstMainClass = mainClasses[0] as PrimaryTypeNode;
        const secondMainClass = mainClasses[1] as PrimaryTypeNode;
        const thirdMainClass = mainClasses[2] as PrimaryTypeNode;
        const testClass = testClasses[0] as PrimaryTypeNode;
        assert.equal(firstMainClass.name, "App", "Name of first class should be \"App\"");
        assert.equal(secondMainClass.name, "AppToDelete", "Name of second class should be \"AppToDelete\"");
        assert.equal(thirdMainClass.name, "AppToRename", "Name of third class should be \"AppToRename\"");
        assert.equal(testClass.name, "AppTest", "Name of test class should be \"AppTest\"");
    });

    test("Can node have correct uri", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const testPackage = packageRoots[1] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const testSubPackage = (await testPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;
        const testClass = (await testSubPackage.getChildren())[0] as PrimaryTypeNode;

        assert.equal(fsPath(projectNode), Uris.MAVEN_PROJECT_NODE, "Project uri incorrect");
        assert.equal(fsPath(mainPackage), Uris.MAVEN_MAIN_PACKAGE, "Main root package uri incorrect");
        assert.equal(fsPath(testPackage), Uris.MAVEN_TEST_PACKAGE, "Test root package uri incorrect");
        assert.equal(fsPath(mainSubPackage), Uris.MAVEN_MAIN_SUBPACKAGE, "Main subpackage uri incorrect");
        assert.equal(fsPath(testSubPackage), Uris.MAVEN_TEST_SUBPACKAGE, "Test subpackage uri incorrect");
        assert.equal(fsPath(mainClass), Uris.MAVEN_MAIN_CLASS, "Main class uri incorrect");
        assert.equal(fsPath(testClass), Uris.MAVEN_TEST_CLASS, "Test class uri incorrect");
    });

    test("Can execute command java.view.package.copyFilePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;

        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_COPY_FILE_PATH, mainClass);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const content = await clipboardy.read();
        const contentUri = vscode.Uri.file(content);
        const dataUri = mainClass.nodeData.uri;
        assert.ok(dataUri, `Class node should have correct uri`);
        const expectedUri = vscode.Uri.parse(dataUri!);
        assert.equal(contentUri.fsPath, expectedUri.fsPath, `File path should be copied correctly`);
    });

    test("Can execute command java.view.package.copyRelativeFilePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const mainSubPackage = (await mainPackage.getChildren())[0] as PackageNode;
        const mainClass = (await mainSubPackage.getChildren())[0] as PrimaryTypeNode;

        await vscode.commands.executeCommand(Commands.VIEW_PACKAGE_COPY_RELATIVE_FILE_PATH, mainClass);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const content = await clipboardy.read();
        const dataUri = mainClass.nodeData.uri;
        assert.ok(dataUri, `Class node should have correct uri`);
        const expectedUri = vscode.Uri.parse(dataUri!);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const relativePath = path.relative(workspaceFolders![0].uri.fsPath, expectedUri.fsPath);
        assert.equal(content, relativePath, `Relative file path should be copied correctly`);
    });

    test("Can execute command java.project.list correctly", async function() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const projects = await vscode.commands.executeCommand<INodeData[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_PROJECT_LIST, workspaceFolders![0].uri.toString());
        assert.equal(projects?.length, 1, "project's length should be 1");
        assert.equal(projects![0].name, "my-app", "project should be my-app");
    });

    test("Can execute command java.getPackageData correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const packages = await vscode.commands.executeCommand<INodeData[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_GETPACKAGEDATA, {
                kind: NodeKind.PackageRoot,
                projectUri: workspaceFolders![0].uri.toString(),
                path: mainPackage.nodeData.name,
                handlerIdentifier: mainPackage.nodeData.handlerIdentifier,
            });
        assert.equal(packages?.length, 2, "packages' length should be 2");
        assert.equal(packages![0].name, "com.mycompany.app", "package[0]'s name should be com.mycompany.app");
        assert.equal(packages![1].name, "com.mycompany.app1", "package[1]'s name should be com.mycompany.app1");
    });

    test("Can execute command java.resolvePath correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const packageRoots = await projectNode.getChildren();
        const mainPackage = packageRoots[0] as PackageRootNode;
        const paths = await vscode.commands.executeCommand<INodeData[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_RESOLVEPATH, mainPackage.nodeData.uri);
        assert.equal(paths?.length, 3, "paths' length should be 3");
        assert.equal(paths![0].name, "src", "path[0]'s name should be src");
        assert.equal(paths![1].name, "main", "path[1]'s name should be main");
        assert.equal(paths![2].name, "java", "path[2]'s name should be java");
    });

    test("Can execute command java.project.getMainClasses correctly", async function() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders, `There should be valid workspace folders`);
        const mainClasses = await vscode.commands.executeCommand<IMainClassInfo[]>(Commands.EXECUTE_WORKSPACE_COMMAND,
            Commands.JAVA_PROJECT_GETMAINCLASSES, workspaceFolders![0].uri.toString());
        assert.equal(mainClasses?.length, 1, "mainClasses' length should be 1");
        assert.equal(mainClasses![0].name, "com.mycompany.app.App", "mainClasses[0]'s name should be com.mycompany.app.App");
    });

});
