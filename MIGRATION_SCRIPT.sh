#!/bin/bash

# 🚀 Sanctum Platform Repository Migration Script
# Migrates from a-messages to sturdy-guacamole
# 
# Prerequisites:
# - CI must be passing ✅
# - All changes committed
# - GitHub repo created: https://github.com/Nyx-Loma/sturdy-guacamole
# - You have push access to the new repo

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OLD_REPO_PATH="$(pwd)"
NEW_REPO_URL="https://github.com/Nyx-Loma/sturdy-guacamole.git"
MIGRATION_DIR="$HOME/Desktop/migration-workspace"
BACKUP_DIR="$HOME/Desktop/sanctum-backups"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Sanctum Platform Repository Migration                 ║${NC}"
echo -e "${BLUE}║     a-messages → sturdy-guacamole                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Pre-flight checks
echo -e "${YELLOW}[1/10] Running pre-flight checks...${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Run this script from the repository root.${NC}"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    git status --short
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${GREEN}✅ Current branch: $CURRENT_BRANCH${NC}"

# Verify CI status (manual check)
echo -e "${YELLOW}⚠️  IMPORTANT: Is CI passing in GitHub Actions?${NC}"
read -p "   Have you verified CI is green? (yes/no): " ci_check
if [ "$ci_check" != "yes" ]; then
    echo -e "${RED}❌ Please fix CI first (see CI_FIX_GUIDE.md)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Pre-flight checks passed${NC}"
echo ""

# Step 2: Create backup
echo -e "${YELLOW}[2/10] Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/sanctum-backup-$TIMESTAMP.bundle"

git bundle create "$BACKUP_FILE" --all
echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"

# Export coverage and artifacts
if [ -d "coverage" ]; then
    cp -r coverage "$BACKUP_DIR/coverage-$TIMESTAMP"
    echo -e "${GREEN}✅ Coverage reports backed up${NC}"
fi

# Document current state
git log --oneline -50 > "$BACKUP_DIR/commits-$TIMESTAMP.txt"
git branch -a > "$BACKUP_DIR/branches-$TIMESTAMP.txt"
git status > "$BACKUP_DIR/status-$TIMESTAMP.txt"
echo -e "${GREEN}✅ Repository state documented${NC}"
echo ""

# Step 3: Tag current state
echo -e "${YELLOW}[3/10] Tagging pre-migration state...${NC}"
TAG_NAME="v0.1.0-pre-migration"

if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Tag $TAG_NAME already exists. Skipping...${NC}"
else
    git tag -a "$TAG_NAME" -m "State before migration to sturdy-guacamole
    
Current status:
- Auth service: 8.0/10 production-ready
- Directory service: 8.5/10 production-ready
- Crypto package: 9.0/10 mature
- Transport package: 8.5/10 mature
- Test coverage: 91.29%
- CI: Fixed and passing

Branch: $CURRENT_BRANCH
Date: $(date)"
    
    echo -e "${GREEN}✅ Tagged as $TAG_NAME${NC}"
    
    read -p "   Push tag to origin? (yes/no): " push_tag
    if [ "$push_tag" = "yes" ]; then
        git push origin "$TAG_NAME"
        echo -e "${GREEN}✅ Tag pushed to origin${NC}"
    fi
fi
echo ""

# Step 4: Create migration workspace
echo -e "${YELLOW}[4/10] Setting up migration workspace...${NC}"
mkdir -p "$MIGRATION_DIR"
cd "$MIGRATION_DIR"
echo -e "${GREEN}✅ Workspace created: $MIGRATION_DIR${NC}"
echo ""

# Step 5: Clone new repository
echo -e "${YELLOW}[5/10] Cloning new repository...${NC}"
if [ -d "sturdy-guacamole" ]; then
    echo -e "${YELLOW}⚠️  sturdy-guacamole directory exists. Removing...${NC}"
    rm -rf sturdy-guacamole
fi

git clone "$NEW_REPO_URL"
cd sturdy-guacamole
echo -e "${GREEN}✅ New repository cloned${NC}"
echo ""

# Step 6: Add source repository as remote
echo -e "${YELLOW}[6/10] Adding source repository...${NC}"
git remote add source "$OLD_REPO_PATH"
git fetch source
echo -e "${GREEN}✅ Source repository added and fetched${NC}"
echo ""

# Step 7: Merge source branch as main
echo -e "${YELLOW}[7/10] Merging source code into main...${NC}"

# Check if main branch exists
if git rev-parse --verify main >/dev/null 2>&1; then
    git checkout main
else
    git checkout -b main
fi

# Merge with unrelated histories allowed
echo -e "${BLUE}   Merging $CURRENT_BRANCH from source...${NC}"
git merge "source/$CURRENT_BRANCH" --allow-unrelated-histories -m "feat: migrate from a-messages repository

This commit brings over the entire Sanctum platform codebase:

Services:
- Auth (8.0/10): Production-ready authentication service
- Directory (8.5/10): Production-ready directory service  
- Admin, Messaging, Media, Backup: Scaffolds for future implementation

Packages:
- Crypto (9.0/10): Mature E2EE implementation with Double Ratchet
- Transport (8.5/10): Mature WebSocket hub and connection management
- Config (7.0/10): Shared configuration utilities

Infrastructure:
- CI/CD: Fixed GitHub Actions workflows
- Docker: Compose setup for local development
- Testing: 1000+ tests with 91.29% coverage

Documentation:
- RUNBOOK.md: Deployment discipline and procedures
- GA_READINESS.md: Service readiness audit
- PRODUCTION_ROADMAP.md: Path from B+ to S-tier

Previous repository: a-messages
Migration date: $(date)
Source branch: $CURRENT_BRANCH
Tag: v0.1.0-pre-migration"

echo -e "${GREEN}✅ Code merged successfully${NC}"
echo ""

# Step 8: Clean up and prepare
echo -e "${YELLOW}[8/10] Cleaning up...${NC}"

# Remove source remote
git remote remove source

# Update README with new repo URL
if [ -f "README.md" ]; then
    sed -i.bak 's|OWNER/REPO|Nyx-Loma/sturdy-guacamole|g' README.md
    rm README.md.bak
    echo -e "${GREEN}✅ README.md updated${NC}"
fi

# Update package.json repository field
if [ -f "package.json" ]; then
    if command -v jq >/dev/null 2>&1; then
        jq '.repository.url = "git+https://github.com/Nyx-Loma/sturdy-guacamole.git"' package.json > package.json.tmp
        mv package.json.tmp package.json
        echo -e "${GREEN}✅ package.json updated${NC}"
    else
        echo -e "${YELLOW}⚠️  jq not installed. Please manually update package.json repository field${NC}"
    fi
fi

# Stage changes
git add -A
if [ -n "$(git status --porcelain)" ]; then
    git commit -m "chore: update repository URLs and references

- Update README.md with new repo URL
- Update package.json repository field
- Clean up migration artifacts"
    echo -e "${GREEN}✅ Repository references updated${NC}"
fi
echo ""

# Step 9: Push to new repository
echo -e "${YELLOW}[9/10] Pushing to new repository...${NC}"
echo -e "${BLUE}   This will push to: $NEW_REPO_URL${NC}"
read -p "   Continue? (yes/no): " push_confirm

if [ "$push_confirm" = "yes" ]; then
    git push -u origin main
    echo -e "${GREEN}✅ Main branch pushed${NC}"
    
    # Create and push staging branch
    git checkout -b staging
    git push -u origin staging
    echo -e "${GREEN}✅ Staging branch pushed${NC}"
    
    git checkout main
else
    echo -e "${YELLOW}⚠️  Push skipped. You can push manually later with:${NC}"
    echo -e "   ${BLUE}git push -u origin main${NC}"
fi
echo ""

# Step 10: Create release tag
echo -e "${YELLOW}[10/10] Creating release tag...${NC}"
git tag -a v0.1.0 -m "v0.1.0 - Foundation Release

Initial release in sturdy-guacamole repository.

Production-Ready Components:
✅ Auth service: 8.0/10
✅ Directory service: 8.5/10
✅ Crypto package: 9.0/10 (libsodium-based E2EE)
✅ Transport package: 8.5/10 (WebSocket hub)

Test Coverage: 91.29%
Total Tests: 1000+

In Development:
🚧 Messaging service (0.5/10)
🚧 Media service (0.5/10)
🚧 Backup service (0.5/10)
🚧 Admin service (1.0/10)

Documentation:
📖 RUNBOOK.md - Deployment procedures
📖 GA_READINESS.md - Service audit
📖 PRODUCTION_ROADMAP.md - Path to S-tier

Next Steps: See PRODUCTION_ROADMAP.md Phase 1

Migration date: $(date)
Migrated from: a-messages
Source tag: v0.1.0-pre-migration"

if [ "$push_confirm" = "yes" ]; then
    git push origin v0.1.0
    echo -e "${GREEN}✅ Release tag v0.1.0 created and pushed${NC}"
else
    echo -e "${GREEN}✅ Release tag v0.1.0 created locally${NC}"
    echo -e "${YELLOW}   Push with: git push origin v0.1.0${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║             🎉 MIGRATION COMPLETE! 🎉                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo -e "   Old repository: $OLD_REPO_PATH"
echo -e "   New repository: $NEW_REPO_URL"
echo -e "   Backup location: $BACKUP_FILE"
echo -e "   Working directory: $MIGRATION_DIR/sturdy-guacamole"
echo ""
echo -e "${BLUE}✅ Completed Steps:${NC}"
echo -e "   ✅ Pre-flight checks"
echo -e "   ✅ Backup created"
echo -e "   ✅ Source tagged (v0.1.0-pre-migration)"
echo -e "   ✅ New repository cloned"
echo -e "   ✅ Code merged"
echo -e "   ✅ References updated"
if [ "$push_confirm" = "yes" ]; then
    echo -e "   ✅ Code pushed to GitHub"
    echo -e "   ✅ Release tag v0.1.0 created"
else
    echo -e "   ⚠️  Push pending (manual step required)"
fi
echo ""
echo -e "${BLUE}🔗 Important URLs:${NC}"
echo -e "   Repository: https://github.com/Nyx-Loma/sturdy-guacamole"
echo -e "   Actions: https://github.com/Nyx-Loma/sturdy-guacamole/actions"
echo -e "   Releases: https://github.com/Nyx-Loma/sturdy-guacamole/releases"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo -e "   1. Set up branch protection rules on GitHub:"
echo -e "      - main: Require PR, passing CI, 1 approval"
echo -e "      - staging: Require passing CI"
echo ""
echo -e "   2. Verify CI is running:"
echo -e "      ${BLUE}https://github.com/Nyx-Loma/sturdy-guacamole/actions${NC}"
echo ""
echo -e "   3. Create GitHub Release for v0.1.0:"
echo -e "      - Go to Releases tab"
echo -e "      - Click 'Draft a new release'"
echo -e "      - Select tag: v0.1.0"
echo -e "      - Title: 'v0.1.0 - Foundation Release'"
echo -e "      - Copy description from tag message"
echo -e "      - Attach backup bundle (optional)"
echo ""
echo -e "   4. Update team:"
echo -e "      - Notify team of new repository"
echo -e "      - Update local clones"
echo -e "      - Update CI/CD pipelines"
echo ""
echo -e "   5. Continue with roadmap:"
echo -e "      ${BLUE}See PRODUCTION_ROADMAP.md Phase 1${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
echo -e "   - Keep backup safe: $BACKUP_FILE"
echo -e "   - Do NOT delete old repository yet (keep for 30 days)"
echo -e "   - Archive old repository after team confirms migration"
echo ""
echo -e "${GREEN}🚀 Repository migration complete! Ready for Phase 1.${NC}"
echo ""

# Open new repository in browser (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    read -p "Open new repository in browser? (yes/no): " open_browser
    if [ "$open_browser" = "yes" ]; then
        open "https://github.com/Nyx-Loma/sturdy-guacamole"
    fi
fi

# Offer to open in IDE
echo ""
read -p "Open new repository in your IDE? (yes/no): " open_ide
if [ "$open_ide" = "yes" ]; then
    if command -v code >/dev/null 2>&1; then
        echo -e "${BLUE}Opening in VS Code...${NC}"
        code "$MIGRATION_DIR/sturdy-guacamole"
    elif command -v cursor >/dev/null 2>&1; then
        echo -e "${BLUE}Opening in Cursor...${NC}"
        cursor "$MIGRATION_DIR/sturdy-guacamole"
    else
        echo -e "${YELLOW}No IDE command found. Please open manually:${NC}"
        echo -e "   ${BLUE}$MIGRATION_DIR/sturdy-guacamole${NC}"
    fi
fi

echo ""
echo -e "${GREEN}Happy coding! 💻${NC}"
