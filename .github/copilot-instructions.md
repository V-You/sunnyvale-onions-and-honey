# Sunnyvale - PayRam showcase

## Potential tools to use

- context7 - MCP server to get up-to-date docs
- chromedevtools - MCP server to inspect websites

## Documentation

- After changes, document project technical details and rationales in the MD files under `documentation/`

## PRD files

- Initial PRD file: the Proxmox-related MDs
- Further PRD files followed, see `md/`

# Backups

- Before changing any file, create a backup copy, extension .bak.YYYYMMDD, in bak/
- If code seems missing anywhere, check bak/ for recent version to cherry pick

# Skills

- Skills are located in `.agents/skills/`
- There are 2 Skills in `.github/skills/`, but they are not relevant for this project anymore, as it pivoted from Evervault showcase to PayRam showcase 

# Code and writing style

- Do NOT use "Title Capitalization Style", use "Sentence case style" instead (first = cap)
- Do NOT use m-dashes in comments, use n-dashes instead (wrapped in spaces)
- Do NOT use emojis in comments or code
- Use the DRY principle in code and comments - "don't repeat yourself", but re-use