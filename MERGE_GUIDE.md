# How to Merge to Main Branch

This guide explains how to merge the medieval castle builder game to the main branch.

## Current Repository State

- **Current branch**: `copilot/create-pr-and-merge-to-main`
- **Status**: All code is complete, tested, and verified
- **Main branch**: Does not exist yet

## Prerequisites

The repository currently has no `main` branch. Before merging, you need to create one.

## Option 1: Create Main Branch Locally (Recommended)

If you have push access to the repository:

```bash
# From the current branch
git checkout -b main

# Push to remote and set as upstream
git push -u origin main

# Set as default branch on GitHub (via Settings → Branches)
```

## Option 2: Use GitHub Web Interface

1. Go to GitHub repository: https://github.com/5ebi/first_web_game_medieval
2. Navigate to **Settings** → **Branches**
3. Click **Add branch** or set `copilot/create-pr-and-merge-to-main` as the default branch
4. Rename it to `main` if desired

## Option 3: Merge via Pull Request

Once a `main` branch exists:

1. **Create a Pull Request** on GitHub:
   - Base branch: `main`
   - Compare branch: `copilot/create-pr-and-merge-to-main`

2. **Review the PR**:
   - Check all files are included
   - Review the diff
   - Verify CI checks pass (if any)

3. **Merge the PR**:
   - Click "Merge pull request"
   - Choose merge strategy (usually "Create a merge commit")
   - Confirm the merge

## Post-Merge Actions

After merging to `main`:

1. **GitHub Pages Deployment**: 
   - The GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically trigger
   - The game will be deployed to GitHub Pages
   - Check the Actions tab to monitor deployment progress

2. **Enable GitHub Pages** (if not already enabled):
   - Go to **Settings** → **Pages**
   - Source should be set to "GitHub Actions"
   - Wait for deployment to complete
   - Access your game at: `https://5ebi.github.io/first_web_game_medieval/`

3. **Verify Deployment**:
   - Visit the GitHub Pages URL
   - Test the game functionality
   - Check all resources load correctly

## What Gets Deployed

When merged to main, the following files are deployed:

```
/index.html          - Main game page
/css/style.css       - Game styling
/js/*.js            - 8 JavaScript game modules
/README.md          - Documentation
```

## Troubleshooting

### If GitHub Actions fails:
- Check the Actions tab for error logs
- Verify GitHub Pages is enabled in Settings
- Ensure the workflow file is correct

### If the game doesn't load:
- Check browser console for errors
- Verify all file paths are correct
- Ensure GitHub Pages source is set correctly

### If you can't create branches:
- Contact the repository owner for permissions
- Ask them to create the `main` branch
- Or ask them to set the current branch as default

## Summary

**Fastest Path to Deployment:**
```bash
# 1. Create main branch
git checkout -b main
git push -u origin main

# 2. The game is now on main and will auto-deploy via GitHub Actions

# 3. Enable GitHub Pages in Settings if needed
```

That's it! The medieval castle builder game will be live on GitHub Pages.
