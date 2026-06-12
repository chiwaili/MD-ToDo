/**
 * Markdown Parser and Compiler for Kanban Board
 */

/**
 * Parses a markdown string into a structured ProjectData object.
 * @param {string} text - The markdown content.
 * @param {string} fileName - The source filename (used as default project title).
 * @returns {object} The parsed project data.
 */
export function parseMarkdown(text, fileName = 'Untitled') {
  const lines = text.split(/\r?\n/);
  const columns = [];
  const preamble = [];
  const postamble = [];
  
  let currentColumn = null;
  let currentTask = null;
  
  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const taskRegex = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;
  
  // Check if there are any headings in the file
  const hasHeadings = lines.some(line => headingRegex.test(line));
  
  // Check if we have level 2 (or lower) headings in the file
  const hasLevel2Headings = lines.some(line => {
    const m = line.match(headingRegex);
    return m && m[1].length >= 2;
  });
  
  function createTaskObject(rawTitle, completed, indentLevel) {
    let title = rawTitle.trim();
    let inlineDescription = '';
    let hadBoldTitle = false;
    
    // Check for bold title format: **Title** description
    const boldMatch = title.match(/^\*\*(.*?)\*\*(.*)$/);
    if (boldMatch) {
      title = boldMatch[1].trim();
      inlineDescription = boldMatch[2].trim();
      hadBoldTitle = true;
    }
    
    // Extract tags: #tag-name
    const tags = [];
    const tagRegex = /#([\w-]+)/g;
    let match;
    
    // We extract tags from the full text (rawTitle) to check both title and inline description
    while ((match = tagRegex.exec(rawTitle)) !== null) {
      tags.push('#' + match[1]);
    }
    
    const description = [];
    if (inlineDescription) {
      description.push(inlineDescription);
    }
    
    return {
      id: Math.random().toString(36).substring(2, 9),
      title,
      completed,
      description,
      subtasks: [],
      tags,
      indentLevel,
      hadBoldTitle
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip completely empty lines inside columns or postamble to prevent clogging,
    // but handle them gracefully.
    if (line.trim() === '') {
      if (currentTask) {
        // We can treat empty lines under a task as description paragraph breaks
        currentTask.description.push('');
      } else if (currentColumn) {
        // Empty lines under a column (but not a task) are ignored or put in postamble
      } else {
        preamble.push(line);
      }
      continue;
    }

    const headingMatch = line.match(headingRegex);
    let taskMatch = line.match(taskRegex);
    const isIndented = /^\s+/.test(line);
    
    // If it's a non-indented line (and not a heading/task), it ends the task context
    if (currentTask && !isIndented && !headingMatch && !taskMatch) {
      while (currentTask.description.length > 0 && currentTask.description[currentTask.description.length - 1] === '') {
        currentTask.description.pop();
        postamble.push('');
      }
      currentTask = null;
    }

    if (headingMatch) {
      if (currentTask) {
        while (currentTask.description.length > 0 && currentTask.description[currentTask.description.length - 1] === '') {
          currentTask.description.pop();
          postamble.push('');
        }
        currentTask = null;
      }
      
      const level = headingMatch[1].length;
      const name = headingMatch[2].trim();
      
      // If we have level 2+ headings, treat any level 1 heading at the top as preamble
      if (level === 1 && hasLevel2Headings && columns.length === 0) {
        preamble.push(line);
        continue;
      }
      
      currentColumn = {
        name,
        level,
        tasks: []
      };
      columns.push(currentColumn);
      currentTask = null;
      continue;
    }
    
    taskMatch = line.match(taskRegex);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const completed = taskMatch[2].toLowerCase() === 'x';
      const title = taskMatch[3];
      
      // Check if it's a subtask (it is indented and we have an active task)
      if (currentTask && indent > currentTask.indentLevel) {
        currentTask.subtasks.push({
          title: title.trim(),
          completed
        });
      } else {
        // It's a main task
        currentTask = createTaskObject(title, completed, indent);
        
        if (currentColumn) {
          currentColumn.tasks.push(currentTask);
        } else {
          // If no heading is found yet:
          if (!hasHeadings) {
            // Group under Todo / Done columns implicitly
            const defaultColName = completed ? 'Done' : 'Todo';
            let col = columns.find(c => c.name === defaultColName);
            if (!col) {
              col = { name: defaultColName, level: 2, tasks: [] };
              columns.push(col);
            }
            col.tasks.push(currentTask);
          } else {
            // Put in a default "Backlog" column
            let backlogCol = columns.find(c => c.name === 'Backlog');
            if (!backlogCol) {
              backlogCol = { name: 'Backlog', level: 2, tasks: [] };
              columns.unshift(backlogCol); // Add to the beginning
            }
            backlogCol.tasks.push(currentTask);
          }
        }
      }
      continue;
    }
    
    // Check if it's an indented description line
    if (currentTask && (line.match(/^\s+/) || currentTask.description.length > 0)) {
      // Remove leading spaces matching the task's indentation hierarchy
      const spacesToTrim = currentTask.indentLevel + 2;
      const trimmed = line.startsWith(' '.repeat(spacesToTrim)) 
        ? line.substring(spacesToTrim) 
        : line.trim();
        
      currentTask.description.push(trimmed);
      continue;
    }
    
    // Plain text falls into preamble or postamble
    if (columns.length === 0) {
      preamble.push(line);
    } else {
      postamble.push(line);
    }
  }
  
  // Cleanup descriptions: remove trailing empty lines
  columns.forEach(col => {
    col.tasks.forEach(task => {
      while (task.description.length > 0 && task.description[task.description.length - 1] === '') {
        task.description.pop();
      }
    });
  });
  
  // Extract project name from file name
  const title = fileName.replace(/\.[^/.]+$/, "")
                        .replace(/[_-]/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());

  return {
    title,
    preamble: preamble.filter(l => l.trim() !== '' || preamble.indexOf(l) < preamble.length - 1),
    columns,
    postamble: postamble.filter(l => l.trim() !== ''),
    hasHeadings
  };
}

/**
 * Compiles a ProjectData object back into a standard markdown string.
 * @param {object} data - The project data.
 * @returns {string} The markdown content.
 */
export function compileMarkdown(data) {
  const lines = [];
  
  // 1. Preamble
  if (data.preamble && data.preamble.length > 0) {
    lines.push(...data.preamble);
    // Add spacer if there are columns
    if (data.columns.length > 0) lines.push('');
  }
  
  // Determine if we should compile with headings
  const hasHeadings = data.hasHeadings || data.columns.length > 2 || (data.columns.length > 0 && !['Todo', 'Done'].includes(data.columns[0].name));
  
  if (hasHeadings) {
    data.columns.forEach((col, colIdx) => {
      // Add heading
      const hashes = '#'.repeat(col.level || 2);
      lines.push(`${hashes} ${col.name}`);
      
      // Add tasks
      col.tasks.forEach(task => {
        const check = task.completed ? 'x' : ' ';
        const useBold = task.hadBoldTitle;
        
        if (useBold) {
          const firstDesc = (task.description && task.description.length > 0) ? ' ' + task.description[0] : '';
          lines.push(`- [${check}] **${task.title}**${firstDesc}`);
          
          // Add subsequent description lines
          if (task.description && task.description.length > 1) {
            task.description.slice(1).forEach(descLine => {
              lines.push(`  ${descLine}`);
            });
          }
        } else {
          lines.push(`- [${check}] ${task.title}`);
        }
        
        // Add subtasks
        if (task.subtasks && task.subtasks.length > 0) {
          task.subtasks.forEach(sub => {
            const subCheck = sub.completed ? 'x' : ' ';
            lines.push(`  - [${subCheck}] ${sub.title}`);
          });
        }
      });
      
      // Spacer between columns (but not after the last one if there is no postamble)
      if (colIdx < data.columns.length - 1 || (data.postamble && data.postamble.length > 0)) {
        lines.push('');
      }
    });
  } else {
    // Compile simple checkbox list without headers
    data.columns.forEach(col => {
      col.tasks.forEach(task => {
        const check = task.completed ? 'x' : ' ';
        const useBold = task.hadBoldTitle || (task.description && task.description.length > 0);
        
        if (useBold) {
          const firstDesc = (task.description && task.description.length > 0) ? ' ' + task.description[0] : '';
          lines.push(`- [${check}] **${task.title}**${firstDesc}`);
          
          if (task.description && task.description.length > 1) {
            task.description.slice(1).forEach(descLine => {
              lines.push(`  ${descLine}`);
            });
          }
        } else {
          lines.push(`- [${check}] ${task.title}`);
        }
        
        if (task.subtasks && task.subtasks.length > 0) {
          task.subtasks.forEach(sub => {
            const subCheck = sub.completed ? 'x' : ' ';
            lines.push(`  - [${subCheck}] ${sub.title}`);
          });
        }
      });
    });
  }
  
  // 3. Postamble
  if (data.postamble && data.postamble.length > 0) {
    // Add separator spacer if needed
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(...data.postamble);
  }
  
  // Ensure exactly one trailing newline
  return lines.join('\n').trim() + '\n';
}
