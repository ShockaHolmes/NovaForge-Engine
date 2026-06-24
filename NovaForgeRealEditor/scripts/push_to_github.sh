#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/ShockaHolmes/NovaForgeRealEditor.git"

echo "Preparing NovaForgeRealEditor for GitHub..."

git init
git add .
git commit -m "Initial NovaForge real editable editor" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo "Pushing to $REPO_URL"
git push -u origin main
