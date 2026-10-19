# Refactoring Guide

Smell-to-fix mapping, refactoring patterns, and legacy code migration strategies. Distilled from Clean Code and Clean Architecture principles (Robert Martin, Urs Enzler/bbv).

## Code Smells and Their Remedies

### Rigidity
**Symptom**: A small change causes a cascade of subsequent changes across multiple files/modules.
**Root cause**: Tight coupling, missing abstraction boundaries, concrete dependencies.
**Remedy**: Introduce interfaces at the coupling points. Apply Dependency Inversion so high-level modules depend on abstractions. Extract the volatile part behind a stable boundary.

### Fragility
**Symptom**: The software breaks in many places due to a single change, often in areas that seem unrelated.
**Root cause**: Hidden dependencies, shared mutable state, missing encapsulation.
**Remedy**: Encapsulate the fragile areas. Make dependencies explicit and physical (not just logical). Strengthen module boundaries so changes don't leak across them.

### Immobility
**Symptom**: You cannot reuse parts of the code in other contexts because they drag too many dependencies along.
**Root cause**: Tangled dependencies, business logic mixed with infrastructure, no clear module boundaries.
**Remedy**: Extract the reusable core behind interfaces. Separate business logic from infrastructure concerns. Apply the Dependency Rule so the reusable part has no outward dependencies.

### Viscosity of Design
**Symptom**: Taking a shortcut and introducing technical debt requires less effort than doing it right.
**Root cause**: The "right way" is too complex, too slow, or too unclear. The architecture makes correct changes harder than incorrect ones.
**Remedy**: Simplify the correct path. If the right approach requires touching 8 files, the design needs restructuring. Make the pit of success easy to fall into.

### Needless Complexity
**Symptom**: The design contains elements that serve no current purpose. Speculative generality, unused abstractions, configurability for scenarios that don't exist.
**Root cause**: Designing for hypothetical future needs instead of current ones.
**Remedy**: Remove unused abstractions. Simplify. Apply YAGNI (You Aren't Gonna Need It). If the speculative code has no tests and no callers, it is dead weight.

### Needless Repetition
**Symptom**: Code contains exact duplications or design duplicates (same thing done in different ways).
**Root cause**: Copy-paste, lack of awareness of existing utilities, no shared vocabulary.
**Remedy**: Extract shared behavior into a single location. For exact duplicates: extract method/class. For design duplicates: unify the approach and pick one canonical way.

### Opacity
**Symptom**: The code is hard to understand. Changes take extra time because you must first reverse-engineer intent.
**Root cause**: Poor naming, mixed abstraction levels, clever code, missing explanatory structure.
**Remedy**: Rename for clarity. Extract methods to create an abstraction ladder. Add explanatory variables. Simplify conditional logic. Prefer straightforward code over clever code.

## Refactoring Patterns

### Reconcile Differences (Unify Similar Code)
When two pieces of code do similar things differently:
1. Change both stepwise until they are identical
2. Extract the now-identical code into a shared method/class
3. Replace both original sites with calls to the shared code

This is safer than trying to extract immediately from code that "looks similar but isn't quite the same."

### Isolate Change
1. Isolate the code to be refactored from the rest (extract it, wrap it)
2. Refactor the isolated piece freely
3. Reintegrate by replacing the original with the refactored version

Isolation limits blast radius. If the refactoring goes wrong, only the isolated piece is affected.

### Migrate Data
Move from one data representation to another through temporary duplication:
1. Introduce the new representation alongside the old one
2. Write to both, read from the new one
3. Migrate all readers to the new representation
4. Remove the old representation

This pattern keeps the system running at every step.

### Temporary Parallel Implementation
1. Introduce a new implementation alongside the old one
2. Switch callers one at a time to the new implementation
3. Remove the old implementation when no callers remain

The key benefit: you can refactor with only one red test at a time. Each caller switch is a small, safe step.

### Demilitarized Zone for Components
When a component's interface doesn't match its ideal internal design:
1. Introduce an internal boundary with the clean design
2. Push everything unwanted outside the internal boundary into the zone between the component interface and the internal boundary
3. Refactor the component interface to match the internal boundary
4. Eliminate the demilitarized zone

### Refactor Before Adding Functionality
When you need to add a new feature but the existing code makes it hard:
1. First refactor the existing code so the new feature fits naturally
2. Then add the feature to the clean structure

This is almost always faster than forcing the feature into a hostile codebase.

## Safe Refactoring Workflow

1. **Small steps**: Only refactor in small increments with working code in between. If you cannot hold all the loose ends in your head, you are taking too big a step.
2. **Tests as safety net**: Run tests after every step. If tests break, you know exactly which small change caused it.
3. **One concern at a time**: Don't refactor structure AND rename AND change behavior simultaneously. Each step should change one thing.
4. **Commit frequently**: Each successful small step is a commit point. If the next step goes wrong, you have a safe rollback.

## Legacy Code Migration Strategy

When dealing with a large legacy codebase, follow this sequence:

### 1. Always Have a Running System
Change the system in small steps, from a running state to a running state. Never enter a state where the system is broken for an extended period.

### 2. Identify Features
Identify existing features and prioritize them by relevance for future development (likelihood and risk of change). Focus effort where it matters most.

### 3. Introduce Boundary Interfaces for Testability
Refactor the boundaries of the system to interfaces so you can simulate the environment with test doubles (fakes, mocks, stubs). This is the prerequisite for safe refactoring.

### 4. Write Feature Acceptance Tests
Cover features with acceptance tests to establish a safety net before refactoring internal structure.

### 5. Identify Components Within Features
Break features into components. Prioritize components by relevance for future development.

### 6. Refactor Interfaces Between Components
Introduce interfaces between components so each can be tested in isolation.

### 7. Write Component Acceptance Tests
Cover each component's features with acceptance tests.

### 8. Decide Per Component: Refactor, Reengineer, or Keep
- **Refactor**: Redesign classes within the component step by step. Add unit tests for each newly designed class.
- **Reengineer**: Use TDD to re-implement the component from scratch, guided by acceptance tests.
- **Keep**: If few future changes are expected and the component has few defects, leave it as-is.

The decision depends on the component's expected rate of change, defect history, and the cost of each approach.

## When NOT to Refactor

- The code works, rarely changes, and has few defects. Leave it alone.
- You are under time pressure with no safety net (no tests). Add tests first, then refactor.
- The refactoring scope is larger than you can complete in one focused effort. Break it down or defer.
- The code is about to be replaced entirely. Don't polish what will be deleted.
