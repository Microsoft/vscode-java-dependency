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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.eclipse.core.resources.FileInfoMatcherDescription;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IResourceFilterDescription;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;

import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public final class ProjectCommand {

    public static List<PackageNode> execute(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);
        IPath workspacePath = ResourceUtils.canonicalFilePathFromURI(workspaceUri);
        String invisibleProjectName = getWorkspaceInvisibleProjectName(workspacePath);

        IProject[] projects = getWorkspaceRoot().getProjects();
        ArrayList<PackageNode> children = new ArrayList<>();
        List<IPath> paths = Arrays.asList(workspacePath);
        for (IProject project : projects) {
            if (project.exists() && (ResourceUtils.isContainedIn(project.getLocation(), paths) || Objects.equals(project.getName(), invisibleProjectName))) {
                PackageNode projectNode = new PackageNode(project.getName(), project.getFullPath().toPortableString(), NodeKind.PROJECT);
                projectNode.setUri(project.getLocationURI().toString());
                children.add(projectNode);
            }
        }

        return children;
    }

    @SuppressWarnings("unchecked")
    public static boolean updateFilters(List<Object> arguments, IProgressMonitor monitor) throws Exception {
        final Set<String> patterns = new HashSet<>((List<String>) arguments.get(0));
        final IProject[] projects = getWorkspaceRoot().getProjects();
        final Set<IProject> filterUpdated = new HashSet<>();
        for (final IProject project : projects) {
            if (!project.exists()) {
                continue;
            }
            final Map<String, IResourceFilterDescription> filters = Arrays.stream(project.getFilters()).collect(Collectors.toMap(
                filter -> (String) filter.getFileInfoMatcherDescription().getArguments(), filter -> filter
            ));
            for (final String pattern: patterns) { // Handle newly added filters
                if (filters.containsKey(pattern)) {
                    continue;
                }
                project.createFilter(
                    IResourceFilterDescription.EXCLUDE_ALL |
                    IResourceFilterDescription.FILES |
                    IResourceFilterDescription.FOLDERS |
                    IResourceFilterDescription.INHERITABLE,
                    new FileInfoMatcherDescription("org.eclipse.core.resources.regexFilterMatcher", pattern), 0, monitor);
                filterUpdated.add(project);
            }
            for (final String pattern: filters.keySet()) { // Handle deleted filters
                if (patterns.contains(pattern)) {
                    continue;
                }
                filters.get(pattern).delete(0, monitor);
                filterUpdated.add(project);
            }
            if (filterUpdated.contains(project)) { // Refresh the hierachy if filter is updated
                project.refreshLocal(IResource.DEPTH_INFINITE, monitor);
            }
        }
        return filterUpdated.size() > 0;
    }

    private static IWorkspaceRoot getWorkspaceRoot() {
        return ResourcesPlugin.getWorkspace().getRoot();
    }

    // TODO Use ProjectUtils.getWorkspaceInvisibleProjectName directly when the language server is released.
    private static String getWorkspaceInvisibleProjectName(IPath workspacePath) {
        String fileName = workspacePath.toFile().getName();
        return fileName + "_" + Integer.toHexString(workspacePath.toPortableString().hashCode());
    }
}
