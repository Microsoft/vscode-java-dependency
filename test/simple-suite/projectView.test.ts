// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import {
    ContainerNode, contextManager, DependencyExplorer,
    PackageRootNode, PrimaryTypeNode, ProjectNode,
} from "../../extension.bundle";
import { fsPath, setupTestEnv, Uris } from "../shared";

// tslint:disable: only-arrow-functions
suite("Simple Project View Tests", () => {

    suiteSetup(setupTestEnv);

    test("Can node render correctly", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);
        // validate root nodes
        const roots = await explorer.dataProvider.getChildren();
        assert.equal(roots?.length, 1, "Number of root node should be 1");
        const projectNode = roots![0] as ProjectNode;
        assert.equal(projectNode.name, "1.helloworld", "Project name should be \"1.helloworld\"");

        // validate package root/dependency nodes
        const packageRoots = await projectNode.getChildren();
        assert.equal(packageRoots.length, 2, "Number of root packages should be 2");
        const mainPackage = packageRoots[0] as PackageRootNode;
        assert.equal(mainPackage.name, "src/main/java", "Package name should be \"src/main/java\"");
        const systemLibrary = packageRoots[1] as ContainerNode;
        // only match prefix of system library since JDK version may differ
        assert.ok(systemLibrary.name.startsWith("JRE System Library"), "Container name should start with JRE System Library");

        // validate innermost layer nodes
        const mainClasses = await mainPackage.getChildren();
        assert.equal(mainClasses.length, 1, "Number of main classes should be 1");
        const mainClass = mainClasses[0] as PrimaryTypeNode;
        assert.equal(mainClass.name, "HelloWorld", "Name of main class should be \"HelloWorld\"");
    });

    test("Can node have correct uri", async function() {
        const explorer = DependencyExplorer.getInstance(contextManager.context);

        const projectNode = (await explorer.dataProvider.getChildren())![0] as ProjectNode;
        const mainPackage = (await projectNode.getChildren())[0] as PackageRootNode;
        const mainClass = (await mainPackage.getChildren())[0] as PrimaryTypeNode;

        assert.equal(fsPath(projectNode), Uris.SIMPLE_PROJECT_NODE, "Project uri incorrect");
        assert.equal(fsPath(mainPackage), Uris.SIMPLE_MAIN_PACKAGE, "Main root package uri incorrect");
        assert.equal(fsPath(mainClass), Uris.SIMPLE_MAIN_CLASS, "Main class uri incorrect");
    });
});
