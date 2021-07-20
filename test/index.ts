// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as path from "path";
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from "vscode-test";

async function main(): Promise<void> {
    try {
        const vscodeExecutablePath = await downloadAndUnzipVSCode("1.57.0");
        const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

        // Resolve redhat.java dependency
        cp.spawnSync(cliPath, ["--install-extension", "redhat.java"], {
            encoding: "utf-8",
            stdio: "inherit",
        });

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // Download VS Code, unzip it and run the integration test

        // Run general test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "java9"),
            ],
        });

        // Run test for simple project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./simple-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "simple"),
            ],
        });

        // Run test for maven project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./maven-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "maven"),
            ],
        });

        // Run test for gradle project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./gradle-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "gradle"),
            ],
        });

        // Run test for invisible project
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "./invisible-suite"),
            launchArgs: [
                path.join(__dirname, "..", "..", "test", "invisible"),
            ],
        });

        process.exit(0);

    } catch (err) {
        process.exit(1);
    }
}

main();
