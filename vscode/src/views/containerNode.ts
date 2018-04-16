import { DataNode } from "./dataNode";
import { INodeData, NodeKind } from "../java/nodeData";
import { ExplorerNode } from "./explorerNode";
import { Jdtls } from "../java/jdtls";
import { PackageRootNode } from "./packageRootNode";
import { ProjectNode } from "./projectNode";

export class ContainerNode extends DataNode {
    constructor(nodeData: INodeData, private readonly _project: ProjectNode) {
        super(nodeData);
    }

    protected loadData(): Thenable<INodeData[]> {
        return Jdtls.getPackageData({ kind: NodeKind.Container, projectUri: this._project.uri, path: this.path });
    }
    protected createChildNodeList(): ExplorerNode[] {
        const result = [];
        if (this.nodeData.children && this.nodeData.children.length) {
            this.nodeData.children.forEach((classpathNode) => {
                result.push(new PackageRootNode(classpathNode, this._project));
            });
        }
        return result;
    }

    protected get iconPath() : string {
        return "./images/library.png";
    }
}
