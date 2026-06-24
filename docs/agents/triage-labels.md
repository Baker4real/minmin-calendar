# Triage Labels

The project uses the default five-role triage vocabulary.

| Role | Label | Meaning |
|------|-------|---------|
| Needs evaluation | `needs-triage` | Maintainer/agent should evaluate the report and decide next state |
| Waiting on reporter | `needs-info` | More information is required before implementation |
| Ready for agent | `ready-for-agent` | Fully specified and suitable for an implementation agent |
| Ready for human | `ready-for-human` | Needs human decision or manual implementation |
| Will not fix | `wontfix` | Explicitly declined or out of scope |

For local markdown issues, put the label in frontmatter when useful:

```markdown
---
label: ready-for-agent
---
```
