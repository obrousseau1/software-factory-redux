# Architecture Patterns Reference

Detailed guidance for multi-class design, layer boundaries, dependency management, and architecture quality. Distilled from Clean Architecture principles (Robert Martin, Urs Enzler/bbv).

## Clean Architecture Layers

The system is organized in concentric layers. Source code dependencies point **inward only**.

### Layer 1: Entities (innermost)
Enterprise-wide business rules. Objects with methods, or data structures with functions that encapsulate the most general and high-level rules. They have no knowledge of anything outside themselves.

### Layer 2: Use Cases
Application-specific business rules. Orchestrate the flow of data to and from entities. They direct entities to use their business rules to achieve the goals of a specific use case. They know about entities but nothing about the outer layers.

### Layer 3: Interface Adapters
Convert data between the format used by use cases/entities and the format used by external agencies (database, web, UI). Controllers, presenters, gateways live here. They know about use cases but not about frameworks.

### Layer 4: Frameworks and Drivers (outermost)
Glue code that connects to UI frameworks, databases, web frameworks, devices. This layer is where all the details go. The web is a detail. The database is a detail. We keep these things on the outside where they can do little harm.

### Dependency Rule
Nothing in an inner circle can know anything about something in an outer circle. Use dependency inversion: classes in outer circles implement interfaces defined by inner circles, or listen to events emitted by inner circles.

### Program Flow vs Dependency Direction
Program flow can cross all layers (user clicks button, use case loads entities from DB, entities decide, result presented on UI). But the **source code dependency** always points inward. Outer layers depend on inner layers through abstractions.

## Simple Architecture

### Consistent Design Decisions
One problem, one solution. Similar problems solved similarly. When a developer finds a pattern used in one part of the system, they should be able to predict how a similar problem is solved elsewhere.

### Few Concepts and Technologies
Simpler solutions use fewer different concepts and technologies. Each new technology or pattern adds cognitive load. Justify each one.

### Few Interactions
The fewer interactions between components, the simpler the design. A reasonable setup has most components with only efferent coupling (they depend on others but nothing depends on them) and most of the rest with preferably only afferent coupling (others depend on them but they depend on nothing).

### Small Size, Modularity
Build large systems out of small parts. Small systems/components are easier to grasp than big ones. Connect independent modules with clearly defined interfaces (adapters).

## Flexible Architecture

### Separation of Concerns
Divide the system into distinct features with as little overlap in functionality as possible. Each feature should be independently understandable and modifiable.

### Interface Slimness
Fat interfaces between components lead to strong coupling. Design interfaces to be as slim as possible, exposing only what the client actually needs. But avoid making interfaces so abstract they become ambiguous.

### Composition Over Inheritance
Inheritance increases coupling between parent and child, limits reuse, and creates fragile hierarchies. Prefer composing objects from collaborators over extending base classes. Use inheritance only for genuine "is-a" relationships where substitutability (LSP) holds naturally.

### Cycle-Free Dependencies
The dependency graph between modules must have no cycles. Cycles mean that changing any module in the cycle potentially affects all others. Break cycles by:
- Extracting the shared dependency into a new module
- Applying dependency inversion (one side depends on an interface the other implements)
- Moving the coupled code into one of the modules

### Software Reflects User's Mental Model
When the structure and interactions inside the software match how users think about the domain, changes in the real world map naturally to changes in the code.

## Evolvable Architecture

### Match Current Needs, Not the Future
The architecture should serve today's requirements, both functional and non-functional. Building for speculative future needs adds complexity and is usually wrong about what the future actually brings. This results in simpler, easier-to-understand solutions.

### No Dead-Ends
While not building for the future, the current architecture should not paint you into a corner. When choosing between alternatives that serve current needs equally well, prefer the one that leaves more options open.

### Architecture-Agnostic Components
When components don't care about which architecture they run in, the architecture can evolve without rewriting components. Components that depend on abstractions (not frameworks) are portable across architectural styles.

### Rolling Refactoring
When introducing a new version of a concept, refactor out the old one step by step. There should be at most two versions of a concept in the system at any time, and that state should be temporary.

### Sacrificial Architecture
When software has outlived its architecture, accept it. Plan for the possibility that the first version's architecture is disposable. This mindset allows you to build a first version with a very simple architecture, then start over when needs outgrow it.

## Architecture Priorities

These priorities resolve conflicts when principles compete:

1. **Simplicity before generality**: Concrete implementations are easier to understand than generalized concepts. Only generalize when you have concrete evidence of reuse.
2. **Hard-coded before configurable**: Configuration adds if/else branches or polymorphism. Start with the simple hard-coded version.
3. **Use before reuse**: Don't design for reuse before the code has been used at least once. Premature reuse design leads to wrong abstractions.
4. **Working before optimized**: First make it work, then optimize. Premature optimization leads to complex solutions or local optimizations that miss the global picture.
5. **Quality attributes before functional requirements**: Quality scenarios (maintainability, testability, performance) often have more architectural impact than functional features.
6. **Combined small systems over one big system**: But beware of complexity hidden in inter-system communication.

## Architecture Smells

### Overlayered Architecture
Layers on layers on layers without providing genuine abstraction. Each layer just passes data through with minor transformations. Symptoms: lots of boilerplate mapping code, interfaces that mirror the class they abstract 1:1 with no other implementors.

### Overabstraction
Too abstract to be understandable. Concrete designs are easier to comprehend. When you need to trace through five levels of indirection to understand what happens when a button is clicked, you have over-abstracted.

### Overconfigurability
Everything is configurable because no one decided how the software should behave. Configuration is a form of indecision pushed onto the deployer. Make decisions; only configure what genuinely varies between environments or customers.

### Overkill Architecture
A simple problem with a complex (however technically interesting) solution. The architecture is more sophisticated than the problem warrants.

### Futuristic Architecture
The architecture anticipates many possible future changes. This adds complexity and usually results in waste because the anticipated changes either never arrive or arrive in a different form than expected.

### Technology-Enthusiastic Architecture
New technology introduced for the sake of it, not because it solves a real problem better than existing alternatives.

### Paper Tiger Architecture
The architecture exists only on paper (UML diagrams, wiki pages) with no connection to the actual code. The real architecture is whatever the code does.

## Architecture Killers

### Split Brain
Different parts of the system claim ownership of the same data or its interpretation. Results in inconsistencies and difficult synchronization. One source of truth per concept.

### Coupling in Space and Time
- **Space coupling**: Shared code to remove duplication hinders independent advancement of the sharing modules. Sometimes duplication is cheaper than coupling.
- **Time coupling**: A service that needs other services to be up and running, or an `initialize()` method that must be called before any other method (use constructor injection or a factory instead).

### Dead-End
A design decision that prevents further adaptability without a major refactoring or rewrite. Before committing to a technology or pattern, ask: "If this turns out to be wrong, how painful is it to change?"

## Architectural Workflow

Use a top-down approach:
1. **Context**: What belongs to your system and what does not? Which external services will you use?
2. **Break into parts**: Split by separation of concerns and single responsibility
3. **Communication**: What data flows between parts? What are the channel properties (sync/async, reliable/unreliable)?
4. **Repeat**: Apply steps 1-3 to each part as if it were your whole system

### Defer Decisions
Decide only what you have enough knowledge about. Use abstractions, simplifications, and delegation to defer decisions you are not ready to make. A good architecture makes most decisions deferrable.
