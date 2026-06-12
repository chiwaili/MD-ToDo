import { 
  state, 
  addProjectHandle, 
  removeProject, 
  toggleProjectSelection, 
  requestProjectPermission,
  getProjectColor,
  renameProject
} from '../main.js';
import { selectFile, selectDirectory } from '../file-system.js';

/**
 * Renders the project sidebar list and wires up its events.
 */
export function renderSidebar() {
  const sidebarList = document.getElementById('project-list');
  if (!sidebarList) return;
  
  // Clear list
  sidebarList.innerHTML = '';
  
  if (state.projects.length === 0) {
    sidebarList.innerHTML = `
      <div class="empty-state-sidebar">
        No files connected. Click the document or folder icons above to add projects.
      </div>
    `;
    return;
  }
  
  state.projects.forEach(project => {
    const isSelected = state.selectedProjectIds.includes(project.id);
    const projectColor = getProjectColor(project.id);
    
    // Calculate stats
    let totalTasks = 0;
    let completedTasks = 0;
    
    if (project.permissionGranted && project.data && project.data.columns) {
      project.data.columns.forEach(col => {
        col.tasks.forEach(task => {
          totalTasks++;
          if (task.completed) completedTasks++;
        });
      });
    }
    
    const projectItem = document.createElement('div');
    projectItem.className = `project-item ${isSelected ? 'active' : ''}`;
    projectItem.dataset.id = project.id;
    
    // Left section: checkbox + project details
    const leftSection = document.createElement('div');
    leftSection.className = 'project-item-left';
    
    const checkbox = document.createElement('div');
    checkbox.className = 'project-checkbox';
    
    const nameContainer = document.createElement('div');
    nameContainer.className = 'project-name-container';
    
    const title = document.createElement('div');
    title.className = 'project-title';
    title.textContent = project.label;
    title.title = `Double-click to rename: ${project.name} (${project.type})`;
    
    const meta = document.createElement('div');
    meta.className = 'project-meta';
    
    if (project.permissionGranted) {
      const typeLabel = project.type === 'directory' ? 'folder' : 'file';
      meta.textContent = `${completedTasks}/${totalTasks} tasks (${typeLabel})`;
    } else {
      meta.innerHTML = `<span style="color: var(--color-warning); cursor: pointer;" class="auth-required">🔒 Click to authorize</span>`;
    }
    
    nameContainer.appendChild(title);
    nameContainer.appendChild(meta);
    leftSection.appendChild(checkbox);
    leftSection.appendChild(nameContainer);
    
    // Right section: color dot + remove button
    const rightSection = document.createElement('div');
    rightSection.className = 'project-item-right';
    
    const dot = document.createElement('div');
    dot.className = 'project-color-dot';
    dot.style.backgroundColor = projectColor;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'project-remove-btn';
    removeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
    `;
    removeBtn.title = 'Remove project';
    
    rightSection.appendChild(dot);
    rightSection.appendChild(removeBtn);
    
    projectItem.appendChild(leftSection);
    projectItem.appendChild(rightSection);
    
    // Event listeners
    // Row click toggles selection (prevent toggle if double clicked or clicked on auth label)
    leftSection.addEventListener('click', (e) => {
      // If the user clicked inside the inline input box, do nothing
      if (e.target.tagName === 'INPUT') {
        return;
      }
      
      e.stopPropagation();
      if (!project.permissionGranted && e.target.classList.contains('auth-required')) {
        requestProjectPermission(project);
      } else {
        toggleProjectSelection(project.id);
      }
    });
    
    // Double click to rename label
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      
      const input = document.createElement('input');
      input.type = 'text';
      input.value = project.label;
      input.style.width = '140px';
      input.style.background = 'var(--bg-input)';
      input.style.border = '1px solid var(--color-primary)';
      input.style.color = 'var(--text-primary)';
      input.style.borderRadius = '4px';
      input.style.padding = '2px 6px';
      input.style.fontSize = '0.8rem';
      
      const finishRename = async () => {
        const val = input.value.trim();
        if (val && val !== project.label) {
          await renameProject(project.id, val);
        } else {
          title.textContent = project.label;
        }
      };
      
      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          finishRename();
        } else if (evt.key === 'Escape') {
          title.textContent = project.label;
        }
      });
      
      input.addEventListener('blur', finishRename);
      
      title.innerHTML = '';
      title.appendChild(input);
      input.focus();
      input.select();
    });
    
    // Remove button click
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove connection to ${project.label}? This will not delete the file/folder on your disk.`)) {
        removeProject(project.id);
      }
    });
    
    sidebarList.appendChild(projectItem);
  });
}

// Global UI bindings for connecting files/directories
document.addEventListener('DOMContentLoaded', () => {
  const addFileBtn = document.getElementById('add-file-btn');
  if (addFileBtn) {
    addFileBtn.addEventListener('click', async () => {
      try {
        const handle = await selectFile();
        await addProjectHandle(handle, 'file');
      } catch (err) {
        console.warn('File selection canceled:', err);
      }
    });
  }
  
  const addFolderBtn = document.getElementById('add-folder-btn');
  if (addFolderBtn) {
    addFolderBtn.addEventListener('click', async () => {
      try {
        const handle = await selectDirectory();
        await addProjectHandle(handle, 'directory');
      } catch (err) {
        console.warn('Folder selection canceled:', err);
      }
    });
  }
});
