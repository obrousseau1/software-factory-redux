# Class and Method Design Reference

Detailed guidance for class structure, method design, naming, and exception handling. Distilled from Clean Code principles (Robert Martin, Urs Enzler/bbv).

## SOLID Principles: When to Apply, When to Skip

### Single Responsibility Principle (SRP)
**Apply when**: A class has multiple reasons to change. You find yourself saying "this class handles X *and* Y." Tests require complex setup because the class does too many things.
**Skip when**: Splitting would create trivial one-method classes that add indirection without clarity. Two closely-related responsibilities that always change together are fine in one class.
**Heuristic**: Can you describe the class's job in one sentence without using "and" or "or"?

### Open/Closed Principle (OCP)
**Apply when**: You keep modifying the same class to add new variations (new payment types, new export formats, new notification channels). Each modification risks breaking existing behavior.
**Skip when**: There are only 1-2 variations and no sign of more coming. Premature abstraction for hypothetical extensions adds complexity without value.
**Heuristic**: Have you modified this class more than twice to add a new variant of the same concept?

### Liskov Substitution Principle (LSP)
**Apply when**: Subtypes throw unexpected exceptions, ignore base class methods, or require callers to check the concrete type before using them.
**Skip when**: You have no inheritance hierarchy. Composition is usually preferable anyway.
**Heuristic**: Can every subtype be used through the base type's interface without the caller needing to know which subtype it is?

### Interface Segregation Principle (ISP)
**Apply when**: Clients are forced to depend on methods they never call. You see interfaces with 10+ methods where most implementors leave half as `throw NotImplementedException`.
**Skip when**: The interface is cohesive and all clients use all methods. Don't split a 3-method interface into three 1-method interfaces.
**Heuristic**: Do any implementors have methods they cannot meaningfully implement?

### Dependency Inversion Principle (DIP)
**Apply when**: High-level business logic directly instantiates or references low-level infrastructure (database clients, HTTP clients, file system). This makes the business logic untestable and rigid.
**Skip when**: The dependency is stable and unlikely to change (standard library types, value objects, pure utility functions). Not everything needs an interface.
**Heuristic**: Could you test this business logic without a real database/network/filesystem? If not, you likely need an abstraction.

## Class Design Rules

### Do Stuff or Orchestrate, Not Both
A class should either:
- **Do work**: algorithms, calculations, data transformation, I/O operations
- **Orchestrate others**: coordinate collaborators, delegate decisions, manage workflow

Mixing both creates classes that are hard to test (need both unit tests and integration tests) and hard to change (business logic tangled with coordination logic).

**Test**: If your class has both `private` helper methods doing computation AND injected dependencies it delegates to, it's probably doing both.

### High Cohesion Test
All fields should be used by most methods. If you can split the fields into two groups where each group's fields are only used by a subset of methods, you likely have two classes hiding inside one.

### Mind-Sized Components
A class should be comprehensible without scrolling extensively. The threshold is not a strict line count but a cognitive one: can you hold the class's full behavior in your head while making a change? If you need to keep jumping between methods to understand the flow, the class is too complex.

**Practical guideline**: Fewer than ~100 lines of logic (excluding boilerplate, comments, and whitespace) is a good target.

### Tell, Don't Ask
Instead of querying an object's state and making decisions based on it, tell the object what to do and let it make its own decisions. This keeps behavior close to the data it operates on and reduces coupling.

## Readability and Narrative Flow

Code should read like a well-structured document: the headline tells you the story, each paragraph elaborates one point, and you only dive into details when you choose to. These rules operationalize that goal.

### The Stepdown Rule
Organize methods so the reader encounters the high-level story first, then the supporting details below. A public method reads like an outline. Each private method it calls fills in one section of that outline, one abstraction level deeper.

```
// The reader sees the story first:
public async Task ProcessOrder(Order order)
{
    ValidatePreconditions(order);
    var pricing = CalculatePricing(order);
    ApplyDiscounts(pricing, order.Customer);
    await PersistAndNotify(order, pricing);
}

// Then each step is defined below, in the order they appear above.
```

The reader never has to jump around to follow the flow. Each method is a natural "and then..." continuation.

### Extract Till Trivial
If a block of code requires the reader to pause and mentally simulate what it does, it should be a named method. The threshold is not line count but cognitive effort: can you understand the block's purpose at a glance?

Candidates for extraction:
- Loop bodies that do more than one thing
- `if` conditions with multiple clauses (extract the condition into a named boolean method)
- `try/catch` blocks (the try body and the catch handler are often separate concerns)
- Any block where you'd be tempted to write a comment explaining what it does (the method name replaces the comment)

### Flatten Nested Conditionals
Nested `if` blocks force the reader to track multiple branch states simultaneously. This is the #1 source of "I need to decode this to understand it."

**Techniques to flatten:**
1. **Guard clauses**: Check preconditions at the top, return early. The main logic lives at the base indentation level.
2. **Extract the condition**: `if (customer.Orders > 5 && customer.Status != "Suspended" && !customer.IsInternal)` becomes `if (IsEligibleForDiscount(customer))`. The name communicates intent; the implementation is in the extracted method.
3. **Extract the branch body**: When an `if/else` has substantial bodies, extract each into a named method. The conditional becomes a one-line dispatcher.
4. **Invert and return early**: Instead of `if (condition) { ...20 lines... }`, write `if (!condition) return;` and keep the 20 lines at the top level.

**Before:**
```
if (order.IsValid)
{
    if (order.HasItems)
    {
        if (!order.IsExpired)
        {
            if (customer.HasCredit)
            {
                // actual work buried 4 levels deep
            }
        }
    }
}
```

**After:**
```
if (!CanFulfill(order, customer)) return;
Fulfill(order, customer);
```

The "after" version tells a story. The "before" version is a puzzle.

### Methods as Narrative
The sequence of calls in an orchestrating method should read like a paragraph: each line is the next logical step, and the method names form a coherent narrative. If you read just the method names out loud and they form a sensible sentence ("validate the order, calculate pricing, apply discounts, persist and notify"), the code is well-structured.

When the narrative breaks (a method name doesn't fit the story, or you need to read the implementation to understand what a call does), that's a signal to rename or restructure.

## Method Design Rules

### Does One Thing
A method does one thing if you cannot meaningfully extract a named sub-step from it. If a method contains a loop, the loop body is often a candidate for extraction. If it contains exception handling, the try/catch block is often a candidate.

### One Level of Abstraction
Every statement in a method should be at the same level of detail. Don't mix high-level orchestration (`validateOrder()`, `calculateTotal()`, `sendConfirmation()`) with low-level details (`if (items[i].price != null && items[i].quantity > 0)`).

**Reading test**: When reading top-to-bottom, each line should feel like a natural next step, not a sudden zoom into implementation details.

### Argument Count
- **0-1 arguments**: Ideal
- **2 arguments**: Acceptable
- **3 arguments**: Warrants scrutiny. Can some be bundled into a request/config object?
- **4+ arguments**: Almost always a sign the method does too much or the arguments represent a missing concept

### No Flag Arguments
`ProcessOrder(bool isUrgent)` should be two methods: `ProcessOrder()` and `ProcessUrgentOrder()`, or accept a typed priority enum. Boolean flags hide conditional behavior inside the method, making the call site unclear about what actually happens.

### No Out/Ref Arguments
If a method needs to return multiple values, return a composite object. Out/ref parameters obscure the method's contract and make call sites harder to read.

### Static Methods
A method should only be static if it has no reason to be an instance method. If it accesses any state or could benefit from polymorphism, make it an instance method on the appropriate class.

## Naming Rules

### Core Principle
Names are the primary documentation. A well-named element needs no comment. A poorly-named element with a comment still confuses.

### Descriptive and Unambiguous
Names must reflect exactly what a variable, field, property, class, or method represents. Avoid abbreviations that require mental mapping. `remainingRetryCount` beats `retCnt`.

### Scope-Appropriate Length
- **Long-lived, wide scope** (fields, properties, public methods): Long, descriptive names
- **Short-lived, narrow scope** (parameters, locals): Shorter names are fine
- **Loop variables**: Single letters (`i`, `j`) only for simple numeric iteration

### Methods Named by What, Not How
`GetActiveUsers()` not `FilterUserListByStatusFlag()`. The name describes the result, not the implementation. If the implementation changes, the name should still be valid.

### Names Describe Side Effects
If a method does more than its name suggests, either rename it or extract the side effect. `CreateOrReturnExisting()` is better than `Create()` when the method might not actually create anything.

### Interfaces and Implementations
- Interface names reflect what the client needs (the capability): `IOrderRepository`, `INotificationSender`
- Class names reflect how they fulfill that capability: `SqlOrderRepository`, `SmtpNotificationSender`

## Understandability

### Consistency
Same concept, same name, everywhere. If you call it `userId` in one place and `userIdentifier` in another, readers waste time wondering if they are different things.

### Explanatory Variables
Extract complex expressions into named locals that explain the step:
```
// Instead of:
if (date.Before(SUMMER_START) || date.After(SUMMER_END))

// Use:
isOutsideSummer = date.Before(SUMMER_START) || date.After(SUMMER_END)
if (isOutsideSummer)
```

### Encapsulate Boundary Conditions
Boundary computations (+1, -1, min, max) are error-prone. Isolate them:
```
nextIndex = index + 1
lastDay = endDate.AddDays(-1)
```

### Value Objects Over Primitives
When a primitive represents a domain concept with constraints, wrap it. `EmailAddress` instead of `string`, `Money` instead of `decimal`, `CustomerId` instead of `int`. This catches errors at compile time, documents intent, and provides a home for validation logic.

## Conditionals

### Encapsulate Complex Conditions
Extract boolean expressions into well-named methods or variables. The caller should read intent, not implementation.

### Prefer Positive Conditionals
`if (isValid)` is easier to reason about than `if (!isInvalid)`. Double negatives are especially harmful: `if (!isNotReady)` should be `if (isReady)`.

### Prefer Polymorphism to Switch/Case
When the same type-checking switch appears in multiple places, replace it with polymorphism. One switch to create the right subtype is fine; multiple switches to branch on type throughout the codebase is a maintenance burden.

## Exception Handling

### Catch Specific Exceptions
Catch the narrowest exception type you can handle. A blanket `catch (Exception)` hides bugs and makes debugging harder.

### Catch Where You Can React Meaningfully
Only catch an exception if you can do something useful: retry, fallback, translate to a domain error, or log with sufficient context. If you cannot react meaningfully, let the exception propagate to a caller that can.

### Fail Fast
Throw exceptions as early as possible after detecting an invalid state. Checking preconditions at the top of a method is better than discovering the problem deep in the call stack.

### Never Use Exceptions for Control Flow
Exceptions are for exceptional conditions. Using try/catch as a branching mechanism is slow, hard to follow, and masks real errors.

### Never Swallow Exceptions
An empty catch block hides failures. If you genuinely need to ignore an exception (rare), document why with a comment. Otherwise, the system is left in an inconsistent state with no indication of what went wrong.

### Prefer Exceptions Over Return Codes or Null
When a method cannot do its job, throw. Don't return `null` or error codes that callers might forget to check.
