---
name: clean-code
description: "Design-level code quality guidance using Clean Code and Clean Architecture principles — class responsibilities, dependency direction, abstraction boundaries, cohesion and coupling. Coach mode advises before the code is written; audit mode grades the diff after. Use when asked to design, architect or structure a feature, plan a refactoring, or judge design quality, and when the user says 'clean code', 'design review', 'architecture check' or 'code quality audit'. Also the end-of-build pass the builder agent runs under /build. Do NOT use for post-write simplification that edits code (use /simplify), over-engineering hunting (use ponytail:ponytail-review), bug detection (use /code-review), or reviewing a shred against its specs (the threepio-spec agent under /build)."
argument-hint: "[audit] [description-or-files]"
model: opus
---

# Clean Code Design Guidance

Apply Clean Code and Clean Architecture principles to produce code that is easy to understand, change, extend, and maintain. This skill provides **design-level** guidance, not formatting or bug detection.

## Arguments

$ARGUMENTS

## Mode Detection

| Input pattern | Mode |
|---|---|
| No arguments, or a description of planned work | **Coach** mode |
| Starts with `audit` (optionally followed by file paths) | **Audit** mode |

## Relationship to Project Standards

Before applying this skill:
1. Read the project's CLAUDE.md and any CodingStandards docs for project-specific conventions
2. Defer to project rules when they exist (naming, formatting, test patterns, etc.)
3. Apply this skill's principles for **design decisions not covered** by project docs: class decomposition, dependency direction, abstraction boundaries, cohesion, coupling

This skill provides universal design principles. Project-specific rules always take precedence.

**Ponytail outranks generality.** When ponytail mode is active — it is the default here, and
`/build` runs this skill under it — the laziest thing that works wins any tie. Items
28–31 below already agree with that. Items 1–5 (SOLID) can pull the other way: an interface with
one implementation, a factory for one product, a layer added for a caller that does not exist yet
are all things this checklist can be read to encourage and ponytail refuses. Ponytail wins, and
you say so in one line rather than arguing it twice.

## Core Design Checklist

Apply these questions to every class, method, or module under consideration. Not every question applies to every situation. Focus on the ones that matter for the work at hand.

### Class / Module Level

1. **Single Responsibility**: Does this class have exactly one reason to change? Could you describe its job in one sentence without "and"?
2. **Open/Closed**: Can new behavior be added by extending (new classes, new implementations) rather than modifying this class?
3. **Liskov Substitution**: Can every subtype be used wherever the base type is expected without surprises?
4. **Interface Segregation**: Do clients depend only on methods they actually use? Are interfaces slim and focused?
5. **Dependency Inversion**: Do high-level modules depend on abstractions, not on concrete low-level details?
6. **Do Stuff or Orchestrate, Not Both**: Does this class either perform work (algorithm, I/O, computation) or coordinate other classes? Mixing both increases coupling and complicates testing.
7. **Mind-Sized**: Can you hold the entire class in your head? If you need to scroll extensively to understand it, it is too large. Aim for fewer than ~100 lines of logic.
8. **High Cohesion**: Do all fields, methods, and properties belong together? Would removing any element make the class feel incomplete?

### Method / Function Level

9. **Does One Thing**: Does the method perform exactly one task? Loops, exception handling, and conditional branches are candidates for extraction into sub-methods.
10. **One Level of Abstraction**: Are all statements at the same abstraction level? Mixing high-level orchestration with low-level details makes intent unclear.
11. **Few Arguments**: Does the method take 3 or fewer arguments? More arguments suggest the method does too much, or the arguments should be bundled into a request/config object.
12. **No Flag Arguments**: Does the method avoid boolean flags that switch behavior? Split into two clearly-named methods instead.
13. **Named by What, Not How**: Does the method name describe its outcome, not its implementation? (`GetActiveUsers` not `FilterUserListByStatusFlag`)

### Dependency / Coupling Level

14. **Dependencies Point Inward**: Do source-code dependencies flow from outer layers (UI, infrastructure, frameworks) toward inner layers (domain, business rules)? Never the reverse.
15. **No Circular Dependencies**: Is the dependency graph between modules/packages acyclic?
16. **Loose Coupling**: Could this component be replaced or extracted without cascading changes? Does it know as little as possible about its collaborators?
17. **Change is Local**: When requirements change, do the modifications stay within a bounded area? Or does a small change ripple across many files?
18. **Easy to Remove**: Could this component be deleted and replaced with a simpler one without extensive surgery?

### Readability and Narrative Flow

19. **Reads Like Prose**: Can you read each method top-to-bottom and understand *what* it does without reading the implementation of its callees? If not, the method mixes abstraction levels or has unclear names.
20. **Stepdown Structure**: Are methods organized so the high-level story comes first, with supporting detail methods defined below? Does the reader encounter the narrative before the mechanics?
21. **No Nested Condition Puzzles**: Are conditionals flat (guard clauses, extracted conditions, early returns)? Or does the reader need to mentally track 3+ levels of branching to understand the behavior?
22. **Extract Till Trivial**: Could any block of code be understood faster if it were a named method? If a comment would help explain a block, that comment should be a method name instead.

### Naming and Understandability

23. **Descriptive and Unambiguous**: Do names precisely reflect what a variable, field, property, class, or method represents? No abbreviations that require mental decoding.
24. **Appropriate Abstraction Level**: Do names match the level of abstraction? An interface name reflects what the client needs. A class name reflects how it fulfills that contract.
25. **Encapsulated Boundary Conditions**: Are edge-case computations isolated into clearly-named variables or methods? (`nextIndex = index + 1` instead of repeating `index + 1` everywhere)
26. **Encapsulated Conditionals**: Are complex boolean expressions extracted into well-named methods or variables? (`if (this.ShouldBeDeleted(timer))` not `if (timer.HasExpired && !timer.IsRecurrent)`)
27. **Positive Conditionals**: Are conditionals framed positively where possible? Positive conditions are easier to reason about than double negatives.

### Architecture Priorities

28. **Simplicity Before Generality**: Is the current solution concrete and specific rather than prematurely generalized? Generalize only when reuse is proven.
29. **Use Before Reuse**: Has this code been used at least once before designing it for reuse? Designing for reuse without usage leads to wrong abstractions.
30. **Working Before Optimized**: Does the code work correctly first? Optimize only with evidence of a performance problem.
31. **Current Needs, Not Future**: Does the architecture serve today's requirements, not speculative future ones? Over-engineering for hypothetical scenarios adds complexity without value.

---

## Coach Mode (default)

Use this mode before or during coding to get design guidance.

### Step 1: Understand the task
Read the user's description of what they plan to build or modify. If no description was provided and no IDE selection is available, ask what they are working on.

### Step 2: Read the code context
- If files are specified or can be inferred from the description, read them
- Look at neighboring classes and interfaces to understand the existing structure
- Read the project's CLAUDE.md for conventions

### Step 3: Apply the Design Checklist
Walk through the relevant checklist items against the planned work. Load reference files when deeper guidance is needed:
- Class/method structure decisions: read `references/class-and-method-design.md`
- Multi-class architecture, layers, or dependency flow: read `references/architecture-patterns.md`

### Step 4: Produce design guidance

Output a structured guidance document:

```
## Design Guidance: [brief title]

### Context
[What the user is building and the current state of the code]

### Design Recommendations
1. **[Recommendation title]**: [Concrete, specific guidance tied to actual classes/methods/files]
   - *Principle*: [Which clean code principle drives this]
   ...
(3-7 recommendations, prioritized by impact)

### Watch Out For
- [Specific smells or traps relevant to THIS task]

### Suggested Structure (if applicable)
[Sketch of class decomposition, interface boundaries, or layer organization.
Use pseudocode or diagrams, not full implementations.]
```

Do NOT write production code. Provide guidance that shapes the coding that follows.

---

## Audit Mode

Use this mode after coding to evaluate design quality.

### Step 1: Determine scope
- If file paths were provided after `audit`, use those
- Otherwise, run `git diff --name-only` to find recently changed files
- If no changes found, ask the user to specify files
- **Test files are in scope** by default. Repetitive test setup, magic-string ceremony, and tests where intent is buried under stubbing/mocks are design smells too — audit them with the same checklist (Extract Till Trivial, Reads Like Prose, Few Arguments).

### Step 2: Read the code
Read all files in scope. Also read the project's CLAUDE.md and any coding standards docs.

### Step 3: Apply the Design Checklist
Evaluate each changed class/module against the relevant checklist items. Focus on design decisions, not formatting or syntax.

### Step 4: Categorize findings

Group findings by severity:

- **Critical**: Violations that will cause maintenance pain or make the code hard to change (circular dependencies, God classes, mixed abstraction levels in core logic)
- **Important**: Design choices that could be improved for better long-term health (tight coupling, missing abstractions at boundaries, classes doing two things)
- **Suggestion**: Minor improvements that would increase clarity (naming precision, boundary condition encapsulation, conditional simplification)

### Step 5: Suggest remediation
For Critical and Important findings, load `references/refactoring-guide.md` and suggest a specific refactoring approach. Name the pattern, explain the steps, and indicate the expected outcome.

Output format:

```
## Design Audit: [scope description]

### Summary
[1-2 sentences: overall design health assessment]

### Findings

#### Critical
- **[Finding title]** ([file:line])
  [What the issue is, why it matters, which principle it violates]
  *Suggested approach*: [Refactoring pattern and concrete steps]

#### Important
...

#### Suggestions
...

### What's Good
[Acknowledge 1-3 design strengths in the code. This is not filler; recognizing good patterns reinforces them.]
```

Do NOT edit files. The user decides what to change.

---

## What This Skill Does NOT Do

| Don't do this | Use this instead |
|---|---|
| Edit or refactor code | `/simplify` |
| Hunt for over-engineering and things to delete | `ponytail:ponytail-review` |
| Check formatting or style | The project's own linter or formatter |
| Hunt for bugs | `/code-review` |
| Review a shred against its specs and exit conditions | the `threepio-spec` agent, under `/build` |
| Enforce project-specific conventions | The project's CLAUDE.md / AGENTS.md |
| Write the code and its tests | the `luke-builder` agent, under `/build` (it calls this skill at the end) |

This skill advises on **design**. Other tools handle execution.

---

## Examples

### Coach mode
```
User: /clean-code I'm building a notification system that sends emails and Slack messages based on user preferences
```
The skill reads existing notification-related code, identifies the key design decisions (how to abstract the delivery channel, where preferences live, how to keep the orchestrator thin), and produces 4-5 concrete recommendations with a suggested class structure.

### Audit mode
```
User: /clean-code audit src/Services/ReportGenerator.cs src/Services/ReportFormatter.cs src/test/Services/ReportGeneratorTest.cs
```
The skill reads all three files (test files are first-class scope), evaluates class responsibilities (are they truly separate concerns?), checks dependency direction, assesses method cohesion, and reports findings like: "ReportGenerator both fetches data and formats output, violating SRP. Consider extracting the formatting delegation to keep the generator focused on orchestration." Test-side findings might include repetitive setup that buries intent (extract test helpers) or magic constants that should be class-level fields.

### Auto-trigger scenario
```
User: Design a retry mechanism with exponential backoff for our webhook delivery
```
The skill triggers because the user is asking to **design** a new component. It coaches on separation of concerns (retry policy vs. delivery mechanism), abstraction boundaries (should the retry strategy be injectable?), and dependency direction.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Guidance feels too abstract or generic | Load the relevant reference file for concrete patterns. Tie every recommendation to a specific class, method, or file in the codebase. |
| Overlaps with `/simplify` output | This skill advises on design structure; `/simplify` edits code for clarity. If the issue is "rename this variable" or "extract this inline logic", that belongs to `/simplify`, not here. |
| A recommendation ponytail would refuse | Ponytail wins. Say which item raised it and why the lazier shape stands; do not re-argue it in the next section. |
| No recent changes found for audit mode | Ask the user to specify file paths explicitly, or check if they are on the right branch. |
| Too many findings in audit mode | Prioritize ruthlessly. Report at most 3 Critical, 5 Important, and 3 Suggestions. The goal is actionable, not exhaustive. |
| User wants you to fix the code, not just advise | Explain that this skill is advisory. Suggest they use `/simplify` or ask directly for the code changes after reviewing the design guidance. Inside `/build`, the builder applies the findings itself. |
| Principles conflict with project conventions | Project conventions always win. Note the conflict and defer to the project's CLAUDE.md / AGENTS.md. |

---

## Reference Files

| File | Purpose | When read |
|------|---------|-----------|
| [class-and-method-design.md](references/class-and-method-design.md) | SOLID details, method/class rules, naming, exception handling | Coach or audit involving class structure, method design, or naming |
| [architecture-patterns.md](references/architecture-patterns.md) | Clean Architecture layers, dependency rules, architecture smells | Coach or audit involving multi-class design, layer boundaries, or module organization |
| [refactoring-guide.md](references/refactoring-guide.md) | Smell-to-fix mapping, refactoring patterns, legacy code approach | Audit mode when remediation suggestions are needed |
