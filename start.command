#!/bin/bash
cd "$(dirname "$0")"

# Find an available port starting at 8000
PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT+1))
done

echo "--------------------------------------------------"
echo "🚀 Starting Markdown Kanban Server on http://localhost:$PORT..."
echo "--------------------------------------------------"

# Open default browser on macOS
open "http://localhost:$PORT"

# Start Python's built-in HTTP server
python3 -m http.server $PORT
