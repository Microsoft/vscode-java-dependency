// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import { NodeKind } from "../java/nodeData";
import { DataNode } from "../views/dataNode";
import { ExplorerNode } from "../views/explorerNode";
import { checkJavaQualifiedName } from "./new";
import { isMutable } from "./utils";

export async function renameFile(node: DataNode, selectedNode: ExplorerNode): Promise<void> {
    // if command not invoked by context menu, use selected node in explorer
    if (!node) {
        node = selectedNode as DataNode;
        if (!isMutable(node)) {
            return;
        }
    }

    const oldFsPath = Uri.parse(node.uri).fsPath;

    const newName: string | undefined = await window.showInputBox({
        placeHolder: "Input new file name",
        value: getPrefillValue(node),
        ignoreFocusOut: true,
        valueSelection: getValueSelection(node.uri),
        validateInput: async (value: string): Promise<string> => {
            const checkMessage = CheckQualifiedInputName(value, node.nodeData.kind);
            if (checkMessage) {
                return checkMessage;
            }

            if (await fse.pathExists(getRenamedFsPath(oldFsPath, value))) {
                return "Class/Package already exists.";
            }

            return "";
        },
    });

    if (!newName) {
        return;
    }

    const newFsPath = getRenamedFsPath(oldFsPath, newName);
    const workspaceEdit: WorkspaceEdit = new WorkspaceEdit();
    workspaceEdit.renameFile(Uri.file(oldFsPath), Uri.file(newFsPath));
    workspace.applyEdit(workspaceEdit);
}

function getRenamedFsPath(oldUri: string, newName: string): string {
    // preserve default file extension if not provided
    if (!path.extname(newName)) {
        newName += path.extname(oldUri);
    }
    const dirname = path.dirname(oldUri);
    return path.join(dirname, newName);
}

function getPrefillValue(node: DataNode): string {
    const nodeKind = node.nodeData.kind;
    if (nodeKind === NodeKind.PrimaryType) {
        return node.name;
    }
    return path.basename(node.uri);
}

function getValueSelection(uri: string): [number, number] | undefined {
    const pos = path.basename(uri).lastIndexOf(".");
    if (pos !== -1) {
        return [0, pos];
    }
    return undefined;
}

function CheckQualifiedInputName(value: string, nodeKind: NodeKind): string {
    const capitalStartExp = /[A-Z](.*?)/;
    const lowerOnlyExp = /(?=.*[A-Z])/;
    const javaValidateMessage = checkJavaQualifiedName(value);

    if (javaValidateMessage) {
        return javaValidateMessage;
    }

    if (nodeKind === NodeKind.PrimaryType) {
        if (!capitalStartExp.test(value)) {
            return "Class name should start with upper case.";
        }
    }

    if (nodeKind === NodeKind.Package || nodeKind === NodeKind.PackageRoot) {
        if (lowerOnlyExp.test(value)) {
            return "Package name should be lower case only.";
        }
        if (value.indexOf(".") !== -1) {
            return "Cross-level rename is not supportted.";
        }
    }

    return "";
}
