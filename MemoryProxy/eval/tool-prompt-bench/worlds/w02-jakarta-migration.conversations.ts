/**
 * W02 conversation history. Same length distribution as W01: the sessions an eval case
 * has to search through run 18-30 turns with build output, stack traces and mid-session
 * reversals; ordinary discussions run 8-16; confirmations run 2-4.
 */
import { conversation, transcript } from "./world-schema.js";
import type { WorldConversation } from "./world-schema.js";

export const CONVERSATIONS: WorldConversation[] = [
  transcript(
    "sess-w02-phasing",
    "order-service",
    "Migration phasing decision",
    "2026-07-16T10:00:00.000Z",
    `
    U: Should we do the namespace rewrite and the Boot 3 upgrade in one release?
    A: Boot 3 requires jakarta, so the namespace work has to land first either way.
       The real question is whether they ship together or separately.
    U: Together is one soak instead of two.
    A: It is, but consider the failure mode. Right now the service has 8 modules:

         module          javax imports   descriptors
         order-core                 34            1
         order-api                  21            2
         order-persistence          47            1
         order-events               12            0
         order-reporting            18            0
         order-admin                29            2
         order-batch-client          9            0
         order-shared               15            0

       That is 185 import sites and 6 descriptors. If we bundle the version bump
       and something breaks at boot, we cannot tell whether it was a namespace miss
       or a Boot 3 behaviour change.
    U: Fair. But two releases means two staging soaks and two rollback drills.
    A: Yes, that is the cost. The tradeoff is attribution: the namespace phase is
       purely mechanical, so it should be boring. The Boot upgrade has real behaviour
       changes, property renames and a new default for lazy initialization.
       Mixing a boring change into a risky one makes the risky one harder to debug.
    U: What property renames are we talking about?
    A: The ones that affect us:

         server.max-http-header-size  ->  server.max-http-request-header-size
         spring.redis.*               ->  spring.data.redis.*

       Both are silent: the old key is ignored rather than rejected.
    U: Silent is exactly why I do not want them in the same release as 185 import edits.
    A: Agreed. So: namespace rewrite first, fully green, then the version bump.
    U: Do descriptors go with their module or in a separate commit at the end?
    A: With their module, same commit. A module whose imports are rewritten but whose
       descriptor still declares the old namespace fails at boot, so splitting them
       leaves the tree in a state that does not start.
    U: That is what bit us in June, right?
    A: Yes. The dry run failed with:

         org.springframework.beans.factory.BeanCreationException:
           Error creating bean with name 'entityManagerFactory'
         Caused by: javax.persistence.PersistenceException:
           No persistence provider for EntityManager named orderPU

       persistence.xml still had the javax namespace while the entities were already
       on jakarta annotations, so the provider never matched.
    U: How long did that take to find?
    A: Most of a day, because the imports all looked correct. The descriptor is easy
       to miss since it is XML and does not show up in an import grep.
    U: Then same commit it is. What about compiling?
    A: Per module, before moving on. A full-project compile at the end tells you
       something is broken but not which module introduced it.
    U: Even if per-module is slower overall?
    A: It is slower in wall clock and much faster in debugging. With 8 modules a
       full sweep takes about 4 minutes; per-module is roughly 6 minutes total.
    U: That is a small difference. Per module then.
    A: One more thing that will bite us: order-reporting pulls a library that shades
       javax.annotation. A source grep will not find it.
    U: How do we find those?
    A: A dependency report, not a grep. Shaded classes are inside the jar, invisible
       in source. I can list the offenders before we start on that module.
    U: Do that. So to summarize the plan?
    A: Four decisions from this session:

         1. Two phases: namespace rewrite first, then the Spring Boot 3 upgrade
         2. Descriptor rewrites go in the same commit as their module's imports
         3. Compile after each module, not once at the end
         4. Use a dependency report to find shaded javax before touching order-reporting
    `,
  ),
  transcript(
    "sess-w02-descriptor",
    "order-service",
    "Persistence descriptor failure",
    "2026-06-23T17:00:00.000Z",
    `
    U: The dry run still fails and every import in order-persistence is rewritten.
       Here is what I get on boot:

         Caused by: javax.persistence.PersistenceException:
           No persistence provider for EntityManager named orderPU

    A: The imports are fine. Look at the descriptor:

         src/main/resources/META-INF/persistence.xml:2
           xmlns="http://java.sun.com/xml/ns/persistence"
           version="2.2"

       The namespace is still the old java.sun.com one.
    U: Let me change the namespace.
    A: Change both the namespace and the version attribute together. This is the part
       people miss: a descriptor with a new namespace and an old version attribute
       still fails at boot, because the schema pair has to be internally consistent.
    U: So what is the correct pair?
    A: For persistence 3.1:

         xmlns="https://jakarta.ee/xml/ns/persistence"
         xsi:schemaLocation="https://jakarta.ee/xml/ns/persistence
                             https://jakarta.ee/xml/ns/persistence/persistence_3_1.xsd"
         version="3.1"

       All three references have to move: the namespace, the schema location and
       the version.
    U: I only changed xmlns the first time.
    A: That is why it kept failing. The schemaLocation still pointed at the old xsd,
       so validation resolved against a schema that does not know the new namespace.
    U: Any other descriptors in this module?
    A: One more: src/main/webapp/WEB-INF/web.xml. Same shape:

         javaee    -> https://jakarta.ee/xml/ns/jakartaee
         version   -> 6.0

    U: Changed both. It boots now.
    A: Good. Worth writing down as a rule: rewrite the schema location and the version
       attribute together with the namespace, never just the namespace.
    `,
  ),
  transcript(
    "sess-w02-compile-cadence",
    "order-service",
    "Compile cadence",
    "2026-06-25T08:30:00.000Z",
    `
    U: Do we compile per module or once at the end? The full sweep is faster.
    A: Per module. I ran both to check the actual cost:

         full sweep at end     3m 52s
         per module (8x)       6m 11s total

       So per module costs about 2.5 minutes more.
    U: For 2.5 minutes I would rather have the faster one.
    A: The 2.5 minutes is not the tradeoff. Last week the full sweep produced:

         > Task :order-admin:compileJava FAILED
         error: package javax.annotation does not exist
           import javax.annotation.PostConstruct;

       That looks clear, but order-admin depends on order-shared and order-core.
       The surviving import could have come from any of the three during the sweep.
    U: You could just look at the file it names.
    A: In that case yes. The harder case is when a module compiles but its dependent
       fails on a signature change. Then the error points at the dependent, not at
       the module that actually changed.
    U: All right, per module. Does that change the commit structure?
    A: It fits it: one module per commit, imports plus descriptors plus a green compile.
    `,
  ),
  transcript(
    "sess-w02-shaded-dependency",
    "order-service",
    "Shaded javax dependencies",
    "2026-07-01T11:00:00.000Z",
    `
    U: order-reporting compiles clean but fails at runtime with a javax.annotation error.
       There is no javax import left in that module.
    A: Then it is shaded inside a dependency. Ran the dependency report:

         com.acme:report-toolkit:4.2.1
           +--- bundles javax.annotation.* (shaded, relocated to
                com.acme.report.shaded.javax.annotation)
           +--- bundles javax.inject.*

       The classes are inside the jar, so no source grep will find them.
    U: How is that our problem if they are relocated?
    A: Two of them are not relocated. javax.annotation.PostConstruct and
       javax.annotation.PreDestroy are bundled unrelocated, so they collide with
       the container's jakarta lifecycle processing and get silently ignored.
    U: Meaning our @PostConstruct methods never run?
    A: In that module, correct. Which explains the runtime failure rather than a
       compile failure.
    U: What is the fix?
    A: report-toolkit 5.x drops the bundled annotations. Upgrading is the clean path.
       If we cannot upgrade, we exclude the transitive and provide jakarta.annotation
       ourselves.
    U: Is 5.x API compatible?
    A: Mostly. Two method signatures changed on the report builder. Small diff, I can
       list them.
    U: Go with the upgrade. Worth noting the general rule for the runbook.
    A: The rule: to find shaded javax, use a dependency report, not a source grep.
       Shaded classes are invisible in source.
    `,
  ),
  transcript(
    "sess-w02-rollout-checklist",
    "order-service",
    "Pre-release checklist",
    "2026-07-19T09:30:00.000Z",
    `
    U: What has to be true before we ship the namespace phase?
    A: Five things, and two of them are not in the pipeline yet:

         1. staging soak for 48 hours          (not automated)
         2. rollback drill executed once       (not automated)
         3. descriptor diff reviewed by a second engineer
         4. shaded dependency report attached to the release ticket
         5. no surviving javax imports in any migrated module
    U: Why 48 hours for the soak?
    A: The nightly batch client runs once a day. A shorter soak can miss the
       interaction with the frozen batch job entirely.
    U: The batch job is frozen on javax, does that even work across the boundary?
    A: It works because they talk over HTTP, not shared classes. But that is exactly
       the path a 24 hour soak would not exercise.
    U: What does the rollback drill cover?
    A: Deploy the migrated build to staging, then roll back to the previous release and
       confirm the descriptors in the older artifact still resolve. We are changing
       resource files, so rollback is not purely a code revert.
    U: Item 5, how do we verify it?
    A: A grep per migrated module for surviving javax imports, plus the dependency
       report for shaded ones. Source grep alone is not sufficient.
    U: Put that list somewhere durable.
    A: Written to plans/order-service/rollout-checklist.md.
    `,
  ),
  transcript(
    "sess-w02-idempotency",
    "payments-api",
    "Idempotency key storage",
    "2026-06-05T13:30:00.000Z",
    `
    U: Where do we keep the idempotency keys for the charge endpoint?
    A: Options are Redis, Postgres, or the existing request log. Redis with a TTL is
       the usual choice.
    U: What TTL?
    A: 24 hours. Long enough to cover client retry windows, short enough that the
       key space stays cheap.
    U: What are actual client retry windows?
    A: From the logs, 99.4% of retries arrive within 90 seconds. The long tail is a
       batch integration that retries the next morning, roughly 14 hours later.
    U: So 24 hours covers even that one.
    A: Yes, with margin. Going beyond 24 hours only grows storage without covering
       any observed retry.
    U: Why not Postgres, since charges are already there?
    A: It would work, but the check is on the hot path of every charge. Redis keeps it
       off the transactional database.
    U: What happens if Redis is down?
    A: That is the important question. Fail closed: reject the charge rather than
       process a possibly duplicate one.
    U: Agreed, reject. That is safer than a double charge.
    A: Recorded. Redis, 24 hour TTL, fail closed on cache unavailability.
    `,
  ),
  transcript(
    "sess-w02-duplicate-charge",
    "payments-api",
    "Duplicate charge postmortem",
    "2026-05-12T16:00:00.000Z",
    `
    U: We double charged 23 customers yesterday. What happened?
    A: All 23 came from the same integration. The pattern in the logs:

         14:02:11  POST /charges  idempotency-key: ik-8f2a  200
         14:02:41  POST /charges  (no idempotency-key)      200

       The retry omitted the key.
    U: Why would a retry drop the key?
    A: Their retry path rebuilds the request from scratch instead of resending the
       original. The key is generated per request build, so the retry generated none.
    U: That is their bug, but we accepted it.
    A: Right. The endpoint treats the key as optional. Without it there is nothing to
       deduplicate against.
    U: Make it required.
    A: That breaks other integrations currently not sending it. Two-step: warn now,
       enforce after we contact them.
    U: How many integrations are not sending it?
    A: Four out of nine.
    U: Then warn first. But log every keyless charge so we can see the exposure.
    A: Added. Also refunded the 23 duplicates this morning.
    `,
  ),
  transcript(
    "sess-w02-chart-pinning",
    "infra-cli",
    "Helm chart pinning",
    "2026-04-30T09:30:00.000Z",
    `
    U: Should staging track the latest chart so we catch chart problems early?
    A: It sounds good but it makes rollbacks non-reproducible. Rolling back the app
       version would still pick up whatever chart is newest at that moment.
    U: We could pin only at release time.
    A: That is what we do for the parent chart already. The gap is subcharts.
    U: Subcharts are pinned by the parent, aren't they?
    A: Only if the parent pins them exactly. Ours uses a range:

         dependencies:
           - name: redis
             version: "^17.0.0"

       So a rollback of the parent can still resolve a newer redis subchart.
    U: That is what broke last week's rollback.
    A: Yes. Parent went back to 2.4.1, redis subchart resolved 17.9.2 instead of the
       17.4.0 that was live before, and the rollback produced a third state.
    U: Pin subcharts exactly then, per environment.
    A: Agreed. Exact versions, no ranges, pinned per environment.
    `,
  ),
  conversation(
    "sess-w02-rollback-failure",
    "infra-cli",
    "Rollback failure",
    "2026-04-29T21:30:00.000Z",
    "The rollback finished but the cluster is not in the previous state.",
    "The parent chart rolled back but a subchart floated forward, so you got a third state rather than the previous one.",
    "How do we confirm that?",
    "Compare the resolved subchart versions in the release manifest before and after. They differ on redis.",
  ),
  transcript(
    "sess-w02-batch-freeze",
    "legacy-batch",
    "Batch freeze policy",
    "2026-03-20T08:30:00.000Z",
    `
    U: Do we migrate the nightly job to jakarta too?
    A: I would not this quarter. What does it actually run on?
    U: JDK 11, Spring 4, javax throughout.
    A: Then migrating it means a Spring upgrade as well, not just a namespace change.
       That is a much larger change than the order service.
    U: It shares no code with order-service?
    A: None. They communicate over HTTP, so the namespace boundary does not matter.
    U: What is the risk of leaving it?
    A: Security patches become harder over time, and nobody on the team has touched
       Spring 4 in two years. But it is a contained risk: one job, one schedule,
       no shared classes.
    U: Freeze it then. What is allowed to change?
    A: Security patches only. No namespace change, no JDK change, no Spring version
       change. Anything beyond a patch needs a decision to unfreeze.
    U: Write that down as a policy.
    A: Done. The JDK pin matters too: it broke on the 17 upgrade in March and was
       pinned back to 11.
    `,
  ),
  conversation(
    "sess-w02-batch-jdk",
    "legacy-batch",
    "JDK pin",
    "2026-03-18T15:00:00.000Z",
    "The nightly job fails after the JDK 17 rollout.",
    "Spring 4 does not support 17. Pin the job back to JDK 11 until the freeze is lifted.",
  ),
  conversation(
    "sess-w02-gradle-preference",
    "order-service",
    "Build tool for new modules",
    "2026-02-11T09:30:00.000Z",
    "New module, Maven or Gradle?",
    "Gradle, with the version catalogue. No inline versions.",
  ),
  conversation(
    "sess-w02-junit-conventions",
    "order-service",
    "Integration test layout",
    "2026-05-06T10:15:00.000Z",
    "How do we structure the integration tests for the migrated modules?",
    "JUnit 5 with Testcontainers, one container per test class reused across methods.",
    "Per method would be cleaner isolation.",
    "It would, but container startup is 3-4 seconds. Per class with explicit cleanup is the better trade at our suite size.",
  ),
  conversation(
    "sess-w02-flyway",
    "order-service",
    "Flyway migration review",
    "2026-06-17T14:40:00.000Z",
    "Can I fix the typo in the column name in V12?",
    "Not if V12 is applied anywhere. Add V13 instead, editing an applied migration breaks the checksum.",
  ),
  conversation(
    "sess-w02-scala-habit",
    "legacy-batch",
    "Pattern matching habit",
    "2026-02-10T09:00:00.000Z",
    "I keep reaching for pattern matching on these record types.",
    "Java switch patterns cover most of it now. Seal the interface and the compiler will check exhaustiveness.",
  ),
  transcript(
    "sess-w02-entity-fetch",
    "order-service",
    "Entity fetch strategy",
    "2026-06-09T14:00:00.000Z",
    `
    U: Loading a single order issues a second query for lines every time.
    A: The association is eager. For the order view that means:

         select ... from orders where id = ?
         select ... from order_lines where order_id = ?

       340 lines came back on the order I traced, and the view only shows the total.
    U: So make it lazy?
    A: Lazy plus an explicit join where lines are actually needed. Three call sites
       need them: OrderService.reprice, InvoiceBuilder.build and OrderReport.dailyTotals.
    U: Would a projection be simpler than a join?
    A: For dailyTotals yes, it only needs sums. The other two need the full entity.
    U: Do the projection for the report and joins for the other two.
    A: That drops the report from 340 row loads to one aggregate query.
    `,
  ),
  transcript(
    "sess-w02-testcontainers",
    "order-service",
    "Testcontainers lifecycle",
    "2026-05-06T10:00:00.000Z",
    `
    U: Should each test method get its own container?
    A: Cleanest isolation, but startup is 3-4 seconds per container. The suite has
       47 integration methods across 9 classes.
    U: So per method is roughly three minutes of container startup.
    A: About that. Per class is 9 startups, around 30 seconds.
    U: What breaks with per class?
    A: Shared state between methods in the same class. Needs explicit cleanup in a
       teardown, and one test currently relies on an empty table.
    U: Fix that test and go per class.
    A: Agreed. One container per class, reused across methods, explicit cleanup between.
    `,
  ),
  transcript(
    "sess-w02-property-renames",
    "order-service",
    "Boot 3 property renames",
    "2026-07-20T11:15:00.000Z",
    `
    U: Which config properties change in Boot 3 for us?
    A: Two that we actually set:

         server.max-http-header-size  ->  server.max-http-request-header-size
         spring.redis.*               ->  spring.data.redis.*

    U: Do the old keys error out?
    A: No, they are ignored. That is the dangerous part: the app starts and silently
       uses the default.
    U: What is the default for the header size?
    A: 8KB. We set 16KB because the admin console sends a large auth header.
    U: So it would start and then fail on admin requests only.
    A: Correct, and only for users with large tokens. Easy to miss in a smoke test.
    U: How did you find these?
    A: Diffed our application.yml against the Boot 3 migration guide's rename list.
    U: Add a startup check that fails if a known-stale key is present.
    A: Good idea, that turns a silent default into a loud failure.
    `,
  ),
  transcript(
    "sess-w02-admin-module",
    "order-service",
    "Admin module imports",
    "2026-07-11T09:40:00.000Z",
    `
    U: What is in order-admin's 29 javax imports?
    A: Mostly validation:

         javax.validation.constraints.*   18
         javax.annotation.*                6
         javax.servlet.*                   5

    U: The servlet ones are the risky group?
    A: Yes. javax.servlet.http.HttpServletRequest appears in two filters, and the
       jakarta equivalent has the same shape but a different package, so it is a
       mechanical change with a behavioural edge: filter ordering config also moved.
    U: Moved how?
    A: The registration bean API is the same, but the default order for our security
       filter changed relative to the encoding filter.
    U: That sounds like it belongs to the Boot phase, not the namespace phase.
    A: It does. For the namespace phase I will only rewrite the imports and keep the
       explicit order values we already set, so the default never applies.
    `,
  ),
  conversation(
    "sess-w02-batch-boundary",
    "legacy-batch",
    "Batch client boundary",
    "2026-07-12T10:00:00.000Z",
    "Does the frozen batch job share classes with the order service?",
    "No. They talk over HTTP only, so the namespace boundary does not cross between them.",
    "Then the batch client module in order-service is just an HTTP client?",
    "Right, order-batch-client is a REST client with 9 javax imports of its own. Migrating it does not touch the batch job.",
  ),
  transcript(
    "sess-w02-descriptor-review",
    "order-service",
    "Descriptor diff review",
    "2026-07-18T15:00:00.000Z",
    `
    U: Why does the checklist require a second engineer on the descriptor diff?
    A: Because the failure is silent until boot and the diff is small enough to skim.
       We shipped a persistence.xml twice with a correct namespace and a stale version.
    U: What should the reviewer look for specifically?
    A: Three references have to move together: xmlns, xsi:schemaLocation and version.
       A diff that touches only one or two of them is the bug.
    U: Can that be a lint rule instead?
    A: It can. A check that asserts the three agree would catch it without a human.
    U: Then write the check and keep the human review until it is in place.
    A: Agreed.
    `,
  ),
  conversation(
    "sess-w02-import-counting",
    "order-service",
    "Counting javax imports",
    "2026-06-30T09:20:00.000Z",
    "How did you get the per-module javax import counts?",
    "ripgrep for ^import javax\\. per module directory, counted per file then summed. It misses shaded classes, which is why the dependency report is separate.",
  ),
  transcript(
    "sess-w02-rollback-drill",
    "order-service",
    "Rollback drill scope",
    "2026-07-21T14:30:00.000Z",
    `
    U: What exactly does the rollback drill have to cover?
    A: Deploy the migrated build to staging, then roll back to the previous release
       and confirm the older artifact still boots.
    U: Why would it not? It booted before.
    A: Because we are changing resource files, not just code. The rollback restores the
       old jar, but anything we changed outside the jar stays changed.
    U: What did we change outside the jar?
    A: Nothing yet, and that is what the drill confirms. If a descriptor had been
       externalized into a config map, the rollback would pair an old jar with a new
       descriptor.
    U: Understood. So the drill is really checking that the migration is jar-local.
    A: Exactly.
    `,
  ),
  conversation(
    "sess-w02-events-module",
    "order-service",
    "Events module descriptors",
    "2026-06-28T11:00:00.000Z",
    "Does order-events have descriptors?",
    "None. 12 imports, no XML. It was the fastest module to migrate.",
  ),
  conversation(
    "sess-w02-leaf-first",
    "order-service",
    "Migration order",
    "2026-06-26T10:30:00.000Z",
    "Which module goes first?",
    "order-shared. It is a leaf with 15 imports and no descriptors, so nothing compiles against a half-migrated dependency.",
    "And then?",
    "order-core, then order-persistence. Dependents last, so a failure always points at the module just changed.",
  ),
  conversation(
    "sess-w02-version-catalogue",
    "order-service",
    "Gradle version catalogue",
    "2026-05-22T13:10:00.000Z",
    "Can I pin this dependency inline for now?",
    "Put it in the version catalogue. Inline versions drift between modules and the migration touches all 8.",
  ),
  conversation(
    "sess-w02-jpa-cascade",
    "order-service",
    "Cascade review",
    "2026-06-13T15:40:00.000Z",
    "Should the order to lines association cascade delete?",
    "Yes for lines, they have no meaning without the order. Check fetch type before cascade though, the two get conflated.",
  ),
  conversation(
    "sess-w02-idempotency-format",
    "payments-api",
    "Idempotency key format",
    "2026-06-06T10:20:00.000Z",
    "Do we generate the idempotency key or does the client?",
    "The client. It has to survive their retry, so it must be created before the first attempt.",
    "What format do we require?",
    "Any opaque string up to 128 characters. We do not parse it, only compare it.",
  ),
  conversation(
    "sess-w02-retry-window",
    "payments-api",
    "Observed retry windows",
    "2026-06-04T16:00:00.000Z",
    "How long do clients actually retry for?",
    "99.4% arrive within 90 seconds. One batch integration retries the next morning, about 14 hours later.",
  ),
  conversation(
    "sess-w02-env-values",
    "infra-cli",
    "Per-environment values",
    "2026-05-02T09:15:00.000Z",
    "Do staging and production share a values file?",
    "No, one per environment under env/. Sharing invites a production-only override sneaking into staging.",
  ),
  conversation(
    "sess-w02-probe-tuning",
    "infra-cli",
    "Probe tuning",
    "2026-05-08T14:00:00.000Z",
    "The service restarts during slow startups.",
    "Liveness is firing before startup finishes. Use a startup probe, or raise the liveness initial delay above the worst observed boot time.",
  ),
];
