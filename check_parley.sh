#!/bin/bash

# Parley Ecosystem Diagnostic Tool
# Verifies the health and configuration of local MCP servers.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================="
echo -e "   PARLEY ECOSYSTEM DIAGNOSTIC"
echo -e "==========================================${NC}"

# 1. Check Paths
ROOT_DIR=$(pwd)
SERVER_DIR="$ROOT_DIR/.parley-servers"

echo -e "\n${BLUE}[1/4] Checking Server Files...${NC}"

servers=("cicerone/index.js" "dragoman/mcp_server.py" "agentsCouncil/server.js")
for s in "${servers[@]}"; do
    if [ -f "$SERVER_DIR/$s" ]; then
        echo -e "  [${GREEN}OK${NC}] Found $s"
    else
        echo -e "  [${RED}FAIL${NC}] Missing $s"
    fi
done

# 2. Check Dependencies
echo -e "\n${BLUE}[2/4] Checking Dependencies...${NC}"

if [ -d "$SERVER_DIR/cicerone/node_modules" ]; then
    echo -e "  [${GREEN}OK${NC}] Cicerone node_modules found"
else
    echo -e "  [${YELLOW}WARN${NC}] Cicerone node_modules missing. Run 'npm install' in .parley-servers/cicerone"
fi

if [ -d "$SERVER_DIR/agentsCouncil/node_modules" ]; then
    echo -e "  [${GREEN}OK${NC}] AgentsCouncil node_modules found"
else
    echo -e "  [${YELLOW}WARN${NC}] AgentsCouncil node_modules missing. Run 'npm install' in .parley-servers/agentsCouncil"
fi

if command -v python3 &>/dev/null; then
    echo -e "  [${GREEN}OK${NC}] python3 found (required for Dragoman)"
else
    echo -e "  [${RED}FAIL${NC}] python3 not found. Dragoman will not run."
fi

# 3. Check Shared Config
echo -e "\n${BLUE}[3/4] Checking Shared Infrastructure...${NC}"
if [ -f "$SERVER_DIR/shared/liaison_config.json" ]; then
    echo -e "  [${GREEN}OK${NC}] liaison_config.json found"
else
    echo -e "  [${RED}FAIL${NC}] liaison_config.json missing. Liaison routing is broken."
fi

# 4. Check IDE Configs
echo -e "\n${BLUE}[4/4] Checking IDE Connections...${NC}"

# VS Code
VSCODE_CONFIG="$ROOT_DIR/.vscode/mcp.json"
if [ -f "$VSCODE_CONFIG" ]; then
    echo -e "  [${GREEN}OK${NC}] Found .vscode/mcp.json"
    for s in "cicerone" "dragoman" "agents-council"; do
        if grep -q "$s" "$VSCODE_CONFIG"; then
             echo -e "    - [${GREEN}OK${NC}] $s is configured"
        else
             echo -e "    - [${YELLOW}MISSING${NC}] $s NOT found in mcp.json"
        fi
    done
else
    echo -e "  [${YELLOW}WARN${NC}] .vscode/mcp.json not found in root. Copilot may not have access."
fi

# Zed
ZED_CONFIG="$HOME/Library/Application Support/Zed/settings.json"
if [ -f "$ZED_CONFIG" ]; then
    echo -e "  [${GREEN}OK${NC}] Found Zed settings.json"
    for s in "cicerone" "dragoman" "agents-council"; do
        if grep -q "$s" "$ZED_CONFIG"; then
             echo -e "    - [${GREEN}OK${NC}] $s is configured"
        else
             echo -e "    - [${YELLOW}MISSING${NC}] $s NOT found in Zed settings"
        fi
    done
fi

echo -e "\n${BLUE}=========================================="
echo -e "   DIAGNOSTIC COMPLETE"
echo -e "==========================================${NC}"
echo -e "Tip: If things are [OK] but not working, try refreshing"
echo -e "the MCP servers in your IDE's command palette."
