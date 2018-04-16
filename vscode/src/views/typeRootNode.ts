import { INodeData } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { DataNode } from "./dataNode";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { Services } from "../services";
import { ITypeRootNodeData, TypeRootKind } from "../java/typeRootNodeData";

export class TypeRootNode extends DataNode {
    constructor(nodeData: INodeData) {
        super(nodeData);
    }


    public getTreeItem(): TreeItem | Promise<TreeItem> {
        if (this.nodeData) {
            const item = new TreeItem(this.nodeData.name, TreeItemCollapsibleState.None);
            item.iconPath = Services.context.asAbsolutePath(this.iconPath);
            return item;
        }
    }

    protected loadData(): Thenable<INodeData[]> {
        return null;
    }

    protected createChildNodeList(): ExplorerNode[] {
        return null;
    }

    protected get iconPath(): string {
        const data = <ITypeRootNodeData>this.nodeData;
        if (data.entryKind === TypeRootKind.K_BINARY) {
            return "./images/classfile.png";
        } else {
            return "./images/file_type_java.svg";
        }
    }
}