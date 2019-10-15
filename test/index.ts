// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as path from "path";
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from "vscode-test";

async function main(): Promise<void> {
    try {
        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

        // Resolve redhat.java dependency
        cp.spawnSync(cliPath, ["--install-extension", "redhat.java"], {
            encoding: "utf-8",
            stdio: "inherit",
        });

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath: string = path.resolve(__dirname, "./suite/index");

        // Download VS Code, unzip it and run the integration test
        await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        process.exit(1);
    }
}

main();
