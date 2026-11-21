# Project Instructions

## Project Context
This is a production application. Follow the existing architecture and conventions.

## Technology
- Next.js / React
- React Native / Expo
- Node.js / Express
- MongoDB Native Driver
- JavaScript
- Tailwind CSS

## Context Optimization
1. Never scan the entire repository for a small task.
2. Use Graphify for structural code discovery.
3. Use graphify query before broad source-code searches.
4. Read only files directly relevant to the requested task.
5. Never read graph.json or the complete GRAPH_REPORT.md unless explicitly necessary.
6. Do not repeat file reads when the relevant context is already available.
7. Do not reread unchanged files without a reason.
8. Limit terminal output to relevant errors and summaries.
9. Do not repeat the complete project architecture in responses.
10. Use subagents for independent, large research or review tasks.

## Development Rules
1. Inspect existing implementation before modifying code.
2. Preserve existing functionality.
3. Follow existing naming and folder conventions.
4. Avoid unnecessary dependencies.
5. Do not create duplicate APIs, components or utilities.
6. Validate inputs and handle errors.
7. Never expose credentials or secrets.
8. Test modified functionality.

## Implementation Workflow
1. Understand the requested feature.
2. Identify relevant files through Graphify.
3. Inspect only required files.
4. Prepare a short implementation plan.
5. Implement the requested changes.
6. Run targeted tests and validation.
7. Report modified files, tests and remaining issues.

## Output
Provide concise results:
- Changes completed
- Files modified
- Tests executed
- Remaining issues

Do not provide lengthy explanations unless requested.