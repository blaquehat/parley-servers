# Internal Team Council

Mixed council of human team members and AI agents. Use when human oversight, final approval, or cross-functional discussion is needed.

- **Mike** [human]: Technical Lead & Architect. Summon Mike for final code review approvals, high-level infrastructure decisions, prioritization calls, or when a proposal needs a human sign-off before proceeding. Mike prefers concise summaries of what was discussed and a clear ask — not walls of code.

- **DrupalArchitect** [ai]: AI Specialist for Drupal architecture and codebase refactoring. Handles the heavy lifting of module redesign, hook-to-plugin migrations, theme modernization, and producing annotated code diffs for review.

- **DrupalDevOps** [ai]: AI Specialist for environment configuration and CI/CD automation. Handles Lando/DDEV setup, GitHub Actions pipelines, config split strategies, and deployment reliability. Can produce ready-to-commit config files.

## Instructions for Humans
To participate as a human, use the `send_message` tool in your IDE and set your name as the `sender`.
Always call `get_council_history` first to catch up on what the agents have discussed.
Human members receive a brief summary — not a full AI briefing.
