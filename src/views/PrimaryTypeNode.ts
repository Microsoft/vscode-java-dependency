// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command, commands, DocumentSymbol, SymbolInformation, SymbolKind, TextDocument, ThemeIcon, Uri, workspace } from "vscode";
import { createUuid, sendOperationEnd, sendOperationStart } from "vscode-extension-telemetry-wrapper";
import { Commands } from "../commands";
import { INodeData, TypeKind } from "../java/nodeData";
import { Services } from "../services";
import { Settings } from "../settings";
import { DataNode } from "./dataNode";
import { DocumentSymbolNode } from "./documentSymbolNode";
import { ExplorerNode } from "./explorerNode";

export class PrimaryTypeNode extends DataNode {

    public static K_TYPE_KIND = "TypeKind";

    constructor(nodeData: INodeData, parent: DataNode) {
        super(nodeData, parent);
    }

    protected async loadData(): Promise<SymbolInformation[] | DocumentSymbol[]> {
        if (!this.hasChildren()) {
            return null;
        }

        return workspace.openTextDocument(Uri.parse(this.nodeData.uri)).then((doc) => {
            return this.getSymbols(doc);
        });
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: ExplorerNode[] = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            for (const child of this.nodeData.children) {
                const documentSymbol: DocumentSymbol = child as DocumentSymbol;
                // Do not show the package declaration
                if (documentSymbol.kind === SymbolKind.Package) {
                    continue;
                }
                if (documentSymbol.name === this.nodeData.name) {
                    for (const childSymbol of documentSymbol.children) {
                        result.push(new DocumentSymbolNode(childSymbol, this));
                    }
                }
            }
        }
        return result;
    }

    protected get iconPath(): any {
        // TODO: Refactor to `ThemeIcon` after VS Code February released.
        switch (this.nodeData.metaData[PrimaryTypeNode.K_TYPE_KIND]) {
            case TypeKind.Enum:
                return {
                    light: Services.context.asAbsolutePath(`./images/symbols/Enumerator_16x.svg`),
                    dark: Services.context.asAbsolutePath(`./images/symbols/Enumerator_inverse_16x.svg`),
                };
            case TypeKind.Interface:
                return {
                    light: Services.context.asAbsolutePath(`./images/symbols/Interface_16x.svg`),
                    dark: Services.context.asAbsolutePath(`./images/symbols/Interface_inverse_16x.svg`),
                };
            default:
                return {
                    light: Services.context.asAbsolutePath(`./images/symbols/Class_16x.svg`),
                    dark: Services.context.asAbsolutePath(`./images/symbols/Class_inverse_16x.svg`),
                };
        }
    }

    protected hasChildren(): boolean {
        return Settings.showMembers();
    }

    private async getSymbols(document: TextDocument): Promise<SymbolInformation[] | DocumentSymbol[]> {
        let error;
        const operationId = createUuid();
        const startAt: number = Date.now();
        sendOperationStart(operationId, "vscode.executeDocumentSymbolProvider");
        try {
            return await commands.executeCommand<SymbolInformation[]>(
                "vscode.executeDocumentSymbolProvider",
                document.uri,
            );
        } catch (err) {
            error = err;
            throw err;
        } finally {
            const duration = Date.now() - startAt;
            sendOperationEnd(operationId, "vscode.executeDocumentSymbolProvider", duration, error);
        }
    }

    protected get command(): Command {
        return {
            title: "Open source file content",
            command: Commands.VIEW_PACKAGE_OPEN_FILE,
            arguments: [this.uri],
        };
    }
}
