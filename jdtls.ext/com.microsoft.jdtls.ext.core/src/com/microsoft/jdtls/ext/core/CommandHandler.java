/*******************************************************************************
 * Copyright (c) 2018 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core;

import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

public class CommandHandler implements IDelegateCommandHandler {

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        if (!StringUtils.isBlank(commandId)) {
            switch (commandId) {
                case "java.project.list":
                    return ProjectCommand.execute(arguments, monitor);
                case "java.project.updateFilters":
                    return ProjectCommand.updateFilters(arguments, monitor);
                case "java.getPackageData":
                    return PackageCommand.getChildren(arguments, monitor);
                case "java.resolvePath":
                    return PackageCommand.resolvePath(arguments, monitor);
                default:
                    break;
            }
        }
        throw new UnsupportedOperationException(String.format("Not supported commandId: '%s'.", commandId));
    }
}
