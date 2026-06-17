import { 
  getStoredProjects, 
  removeStoredProject, 
  saveProjectHandle,
  verifyPermission, 
  readFileContent, 
  writeFileContent,
  scanDirectoryForTodo
} from './file-system.js';
import { parseMarkdown, compileMarkdown } from './parser.js';
import { renderSidebar } from './components/sidebar.js';
import { renderBoard, moveCheckedItemsToDone } from './components/kanban.js';
import { initModal, initConfirmDeleteModal } from './components/modal.js';

// Central State (Version 2 with unique IDs and folder support)
export const state = {
  projects: [],           // Array of { id, label, name, type, handle, fileName, data, permissionGranted }
  selectedProjectIds: [], // List of project IDs currently active on the board
  searchQuery: '',        // Search string for tasks & tags
  hideCompleted: false,   // Hiding/showing completed items
  activeTask: null,       // Task currently being edited in the modal
  activeProjectId: null,  // Project ID of the task being edited
  projectColors: {}       // Map of project IDs/labels to HSL values
};

/**
 * Returns a consistent, vibrant color mapping for a project ID.
 */
export function getProjectColor(projectId) {
  if (state.projectColors[projectId]) {
    return state.projectColors[projectId];
  }
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const color = `hsl(${hue}, 70%, 65%)`;
  state.projectColors[projectId] = color;
  return color;
}

/**
 * Main application render function. Updates all view layers.
 */
export function renderApp() {
  renderSidebar();
  renderBoard();
  updateStats();
  updateMoveCheckedButton();
}

function updateMoveCheckedButton() {
  const moveCheckedBtn = document.getElementById('move-checked-btn');
  if (!moveCheckedBtn) return;

  const activeProjects = state.projects.filter(p => state.selectedProjectIds.includes(p.id) && p.permissionGranted);
  const hasActiveProjects = activeProjects.length > 0;

  moveCheckedBtn.disabled = !hasActiveProjects;
  moveCheckedBtn.title = hasActiveProjects
    ? 'Move all checked tasks into the Done column'
    : 'Select an active project to enable moving checked tasks.';
}

/**
 * Updates task progress stats in header based on selected projects.
 */
function updateStats() {
  const statsBadge = document.getElementById('task-stats');
  if (!statsBadge) return;
  
  let totalTasks = 0;
  let completedTasks = 0;
  
  state.projects.forEach(project => {
    if (!state.selectedProjectIds.includes(project.id)) return;
    if (!project.permissionGranted) return;
    
    project.data.columns.forEach(col => {
      col.tasks.forEach(task => {
        totalTasks++;
        if (task.completed) {
          completedTasks++;
        }
      });
    });
  });
  
  statsBadge.innerHTML = `<span class="stats-badge">${completedTasks} / ${totalTasks} Completed</span>`;
}

function normalizeHeaderKey(name) {
  return name ? name.trim().toLowerCase() : '';
}

function getTaskDedupKey(task) {
  const title = (task.title || '').trim().toLowerCase();
  const description = (task.description || []).map(line => line.trim().toLowerCase()).join('\n');
  const tags = (task.tags || []).map(tag => tag.trim().toLowerCase()).sort().join(',');
  return `${title}||${description}||${tags}`;
}

async function mergeDuplicateHeaders() {
  const activeProjects = state.projects.filter(p => state.selectedProjectIds.includes(p.id) && p.permissionGranted);
  let mergedCount = 0;

  for (const project of activeProjects) {
    const headerMap = new Map();
    const mergedColumns = [];
    let changed = false;

    for (const column of project.data.columns) {
      const key = normalizeHeaderKey(column.name);
      if (!headerMap.has(key)) {
        headerMap.set(key, {
          id: column.id,
          name: column.name,
          level: column.level,
          tasks: [...column.tasks]
        });
        mergedColumns.push(headerMap.get(key));
      } else {
        const existing = headerMap.get(key);
        existing.tasks.push(...column.tasks);
        changed = true;
      }
    }

    if (changed) {
      project.data.columns = mergedColumns;
      await saveProjectToDisk(project);
      mergedCount += 1;
    }
  }

  return { totalProjects: activeProjects.length, mergedCount };
}

async function mergeDuplicateItemsWithinColumns() {
  const activeProjects = state.projects.filter(p => state.selectedProjectIds.includes(p.id) && p.permissionGranted);
  let mergedColumns = 0;
  let mergedTasks = 0;

  for (const project of activeProjects) {
    let projectChanged = false;

    project.data.columns.forEach(column => {
      const seen = new Set();
      const uniqueTasks = [];

      column.tasks.forEach(task => {
        const key = getTaskDedupKey(task);
        if (!seen.has(key)) {
          seen.add(key);
          uniqueTasks.push(task);
        } else {
          projectChanged = true;
          mergedTasks += 1;
        }
      });

      column.tasks = uniqueTasks;
    });

    if (projectChanged) {
      await saveProjectToDisk(project);
      mergedColumns += 1;
    }
  }

  return { totalProjects: activeProjects.length, mergedColumns, mergedTasks };
}

/**
 * Saves a project back to its local disk file (resolving directory files if necessary).
 * @param {object} project 
 */
export async function saveProjectToDisk(project) {
  let fileHandle = null;
  
  try {
    if (project.type === 'directory') {
      // 1. Verify directory permission
      if (!project.permissionGranted) {
        const granted = await verifyPermission(project.handle, true);
        if (!granted) {
          alert(`Permission denied to access folder ${project.label}`);
          return;
        }
        project.permissionGranted = true;
      }
      // 2. Resolve the specific file handle inside directory
      fileHandle = await project.handle.getFileHandle(project.fileName, { create: false });
    } else {
      // Type is file
      if (!project.permissionGranted) {
        const granted = await verifyPermission(project.handle, true);
        if (!granted) {
          alert(`Permission denied to save changes to ${project.label}`);
          return;
        }
        project.permissionGranted = true;
      }
      fileHandle = project.handle;
    }
    
    const markdown = compileMarkdown(project.data);
    await writeFileContent(fileHandle, markdown);
    console.log(`Saved changes to disk: ${project.label} (${project.fileName || project.name})`);
  } catch (err) {
    console.error(`Error saving project ${project.label}:`, err);
    alert(`Could not save changes to ${project.label}: ${err.message}`);
  }
}

/**
 * Connects a new file or directory handle to the projects state.
 * @param {FileSystemHandle} handle 
 * @param {'file'|'directory'} type 
 */
export async function addProjectHandle(handle, type = 'file') {
  // Generate a unique ID
  const id = Math.random().toString(36).substring(2, 9);
  
  // Determine display label (avoid duplicate display names by appending counters)
  let label = handle.name;
  let counter = 1;
  while (state.projects.some(p => p.label === label)) {
    counter++;
    label = `${handle.name} (${counter})`;
  }
  
  const permissionGranted = await verifyPermission(handle, true);
  let projectData = { title: label, preamble: [], columns: [], postamble: [], hasHeadings: false };
  let fileName = null;
  let activeFileHandle = null;
  
  if (permissionGranted) {
    try {
      if (type === 'directory') {
        const todoDetails = await scanDirectoryForTodo(handle);
        if (!todoDetails) {
          alert(`Could not find any checklist or markdown files (like todo.md) in the folder "${handle.name}".`);
          return;
        }
        fileName = todoDetails.fileName;
        activeFileHandle = todoDetails.fileHandle;
      } else {
        fileName = handle.name;
        activeFileHandle = handle;
      }
      
      const content = await readFileContent(activeFileHandle);
      projectData = parseMarkdown(content, fileName);
    } catch (err) {
      console.error('Error reading project contents on add:', err);
      alert(`Error loading project: ${err.message}`);
      return;
    }
  } else {
    // Permission denied
    return;
  }
  
  const project = {
    id,
    label,
    name: handle.name,
    type,
    handle,
    fileName,
    data: projectData,
    permissionGranted
  };
  
  state.projects.push(project);
  state.selectedProjectIds.push(id);
  
  // Save details to IndexedDB
  await saveProjectHandle(project);
  renderApp();
}

/**
 * Removes a project by ID.
 * @param {string} id 
 */
export async function removeProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  state.selectedProjectIds = state.selectedProjectIds.filter(selectedId => selectedId !== id);
  await removeStoredProject(id);
  renderApp();
}

/**
 * Renames a project's display label.
 * @param {string} id 
 * @param {string} newLabel 
 */
export async function renameProject(id, newLabel) {
  const project = state.projects.find(p => p.id === id);
  if (project) {
    project.label = newLabel.trim();
    await saveProjectHandle(project);
    renderApp();
  }
}

/**
 * Toggles a project's selection status.
 * @param {string} id 
 */
export function toggleProjectSelection(id) {
  const index = state.selectedProjectIds.indexOf(id);
  if (index === -1) {
    state.selectedProjectIds.push(id);
  } else {
    state.selectedProjectIds.splice(index, 1);
  }
  renderApp();
}

/**
 * Requests browser permission for a restored project file/folder.
 * @param {object} project 
 */
export async function requestProjectPermission(project) {
  const granted = await verifyPermission(project.handle, true);
  if (granted) {
    project.permissionGranted = true;
    try {
      let fileHandle = null;
      if (project.type === 'directory') {
        fileHandle = await project.handle.getFileHandle(project.fileName, { create: false });
      } else {
        fileHandle = project.handle;
      }
      const content = await readFileContent(fileHandle);
      project.data = parseMarkdown(content, project.fileName || project.name);
    } catch (err) {
      console.error('Error reloading project contents on authorization:', err);
    }
    renderApp();
  }
}

async function initializeApp() {
  // Wire Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const isLight = savedTheme === 'light' || (!savedTheme && systemPrefersLight);
    
    if (isLight) {
      document.body.classList.add('light-theme');
      themeToggle.checked = true;
    } else {
      document.body.classList.remove('light-theme');
      themeToggle.checked = false;
    }
    
    themeToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
      }
    });
  }

  initModal();
  initConfirmDeleteModal();

  // Restore projects from IndexedDB
  try {
    const storedProjects = await getStoredProjects();
    storedProjects.forEach(proj => {
      state.projects.push({
        id: proj.id,
        label: proj.label || proj.name,
        name: proj.name,
        type: proj.type || 'file',
        handle: proj.handle,
        fileName: proj.fileName || null,
        data: { title: proj.label || proj.name, preamble: [], columns: [], postamble: [], hasHeadings: false },
        permissionGranted: false
      });
      // Selected by default
      state.selectedProjectIds.push(proj.id);
    });
  } catch (err) {
    console.error('Error loading stored project handles:', err);
  }
  
  const mergeHeadersBtn = document.getElementById('merge-headers-btn');
  if (mergeHeadersBtn) {
    mergeHeadersBtn.addEventListener('click', async () => {
      const result = await mergeDuplicateHeaders();
      if (result.totalProjects === 0) {
        alert('Select an active project to merge duplicate headers.');
        return;
      }
      if (result.mergedCount === 0) {
        alert('No duplicate headers found in selected projects.');
      } else {
        alert(`Merged duplicate headers in ${result.mergedCount} project(s).`);
      }
      renderApp();
    });
  }

  const mergeItemsBtn = document.getElementById('merge-items-btn');
  if (mergeItemsBtn) {
    mergeItemsBtn.addEventListener('click', async () => {
      const result = await mergeDuplicateItemsWithinColumns();
      if (result.totalProjects === 0) {
        alert('Select an active project to merge duplicate items.');
        return;
      }
      if (result.mergedTasks === 0) {
        alert('No duplicate items found within the selected project columns.');
      } else {
        alert(`Merged ${result.mergedTasks} duplicate item(s) across ${result.mergedColumns} project(s).`);
      }
      renderApp();
    });
  }

  const moveCheckedBtn = document.getElementById('move-checked-btn');
  if (moveCheckedBtn) {
    moveCheckedBtn.addEventListener('click', async () => {
      const result = await moveCheckedItemsToDone();
      if (!result) {
        alert('No active projects are selected. Please select a project from the sidebar first.');
        return;
      }

      if (result.totalMoved === 0) {
        alert('No checked tasks were found in the selected projects.');
      }

      renderApp();
    });
  }

  const toolsBtn = document.getElementById('tools-btn');
  const closeToolsBtn = document.getElementById('close-tools-btn');
  const toolsPanel = document.getElementById('tools-panel');

  const toggleToolsPanel = (visible) => {
    if (!toolsPanel) return;
    toolsPanel.classList.toggle('visible', visible);
    toolsPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  if (toolsBtn) {
    toolsBtn.addEventListener('click', () => toggleToolsPanel(true));
  }

  if (closeToolsBtn) {
    closeToolsBtn.addEventListener('click', () => toggleToolsPanel(false));
  }

  document.addEventListener('click', (event) => {
    if (!toolsPanel || !toolsPanel.classList.contains('visible')) return;
    const isInside = toolsPanel.contains(event.target) || (toolsBtn && toolsBtn.contains(event.target));
    if (!isInside) {
      toggleToolsPanel(false);
    }
  });
  
  renderApp();
  
  // Wire Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderBoard();
    });
  }
  
  // Wire Hide Completed
  const hideCompletedToggle = document.getElementById('hide-completed-toggle');
  if (hideCompletedToggle) {
    hideCompletedToggle.addEventListener('change', (e) => {
      state.hideCompleted = e.target.checked;
      renderBoard();
    });
  }
}

if (document.readyState !== 'loading') {
  initializeApp();
} else {
  document.addEventListener('DOMContentLoaded', initializeApp);
}
