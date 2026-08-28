# W01–W03 Source-pack selection

## Scope and decision

This is a source-pack selection record, not a Case, Gold, Query, or asset-authoring plan.
It selects twelve joined official source tasks for each of the six required Teams:
`moto`, `mypy`, `pandas`, `dask`, `dvc`, and `MONAI`. `pydantic` and `conan`
remain reserve-only and are not selected here.

Inputs are the locked SWE-Gym task parquet (`bb94ed9e39bbeb96a7fcbfb533b80f25a7fd59cb`,
SHA-256 `60569c…9ad97`) and OpenHands-SFT success split
(`4aaa5a4a4b5861f4799d2336908760c190ac3b17`, SHA-256 `ea4bf…ae4f1`),
joined under the locked `official_id_then_unique_exact_problem_statement` policy in
[`source-lock.yaml`](./source-lock.yaml). The candidate inventory has already kept
one longest successful trajectory per official `instance_id`; the message count below
therefore refers to that selected trajectory.

Each Team has six non-overlapping **history** tasks and six non-overlapping
**current_anchor** tasks. History rows prioritize longer trajectories and span modules
and source-task dates; they are candidates for evidence-grounded L0/L1/L2/Skill work.
Current anchors reserve task/problem/patch evidence for later workspace and Case work.
Their reference patch and test patch are never copied into history assets. The role is a
provenance-use boundary, not a claim that every current anchor is newer than every
history task; `world_as_of` must be set after every selected source task.

The following checks were performed over each 12-row selection using the full inventory
fields (not the abbreviated display hashes): `instance_id` distinct, `base_commit`
recorded, `problem_statement_sha256` distinct, and the union of
`patch_touched_files` has no duplicate file path. No Gold, tool route, counterfactual,
or Query is decided by this document.

## W01 Team A — getmoto/moto

Inventory capacity: 69 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 15 touched-file occurrences / 15 unique paths; 12 service
submodules. This is strong module diversity.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `getmoto__moto-5134` / `0e3ac260682f3354912fe552c61d9b3e590903b8` | EventBridge rule doesn't match null value with "exists" filter | 100 | `moto/events/models.py` | Long replay; 2022 EventBridge evidence. |
| history | `getmoto__moto-6567` / `b52fd80cb1cfd8ecc02c3ec75f481001d33c194e` | Missing vpc security group name from rds.create_db_cluster response | 100 | `moto/rds/models.py`, `moto/rds/responses.py` | Long replay; RDS response path. |
| history | `getmoto__moto-7365` / `7f6c9cb1deafb280fe7fcc7551c38e397f11a706` | DynamoDB's `update_item` performs floating-point arithmetic with mock table created via `boto3` | 82 | `moto/dynamodb/models/dynamo_type.py` | Long DynamoDB type path. |
| history | `getmoto__moto-5587` / `80ab997010f9f8a2c26272671e6216ad12fac5c3` | Versioned S3 buckets leak keys | 100 | `moto/s3/models.py` | Long S3 model replay. |
| history | `getmoto__moto-6585` / `6843eb4c86ee0abad140d02930af95050120a0ef` | lambda get_function() returns config working directory in error | 100 | `moto/awslambda/models.py` | Long Lambda error boundary. |
| history | `getmoto__moto-6913` / `f59e178f272003ba39694d68390611e118d8eaa9` | SESV2 send_email saves wrong body in ses_backend | 100 | `moto/sesv2/responses.py` | Long email-response replay. |
| current_anchor | `getmoto__moto-7635` / `e51192b71db45d79b68c56d5e6c36af9d8a497b9` | SNS: `create_platform_endpoint` is not idempotent with default attributes | 52 | `moto/sns/models.py` | Disjoint SNS anchor; reserve patch/test. |
| current_anchor | `getmoto__moto-7490` / `db862bcf3b5ea051d412620caccbc08d72c8f441` | Adding `StreamSummaries` to kinesis.list_streams response | 56 | `moto/kinesis/responses.py` | Disjoint Kinesis anchor. |
| current_anchor | `getmoto__moto-7317` / `652eabda5170e772742d4a68234a26fa8765e6a9` | glue.create_database does not create tags | 66 | `moto/glue/models.py`, `moto/glue/responses.py` | Disjoint Glue anchor. |
| current_anchor | `getmoto__moto-7212` / `455fbd5eaa0270e03eac85a532e47ec75c7acd21` | Cognito ID/Access Token do not contain user pool custom attributes | 44 | `moto/cognitoidp/models.py` | Disjoint Cognito anchor. |
| current_anchor | `getmoto__moto-7105` / `85156f59396a85e83e83200c9df41b66d6f82b68` | moto batch - "RuntimeError: cannot join thread before it is started" | 30 | `moto/batch/models.py` | Disjoint Batch anchor. |
| current_anchor | `getmoto__moto-7081` / `55c589072fc88363fdde9ae8656909f8f24dd13f` | IoT - thingId not present after create_thing() | 66 | `moto/iot/models.py`, `moto/iot/responses.py` | Disjoint IoT anchor. |

## W01 Team B — python/mypy

Inventory capacity: 27 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 15/15 unique touched paths; compiler, semantic analysis,
diagnostics, stubs, server, plugins, and type-operation modules are covered.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `python__mypy-10424` / `4518b55663bc689646280a0ab2247c4a724bf3c0` | Narrowing types using a metaclass can cause false positives | 100 | `mypy/meet.py` | Long type-meet replay. |
| history | `python__mypy-5617` / `5db3e1a024a98af4184d6864c71d6abbf00dc3b3` | Can't assign to () | 86 | `mypy/semanal.py` | Long 2018 semantic-analysis evidence. |
| history | `python__mypy-15184` / `13f35ad0915e70c2c299e2eb308968c86117132d` | assert_type: Use fully qualified types when names are ambiguous | 70 | `mypy/messages.py` | Diagnostic/message history. |
| history | `python__mypy-12943` / `9611e2d0b1d9130ca1591febdd60a3523cf739eb` | Crash when analysing qiskit | 44 | `mypy/checker.py` | Checker crash evidence. |
| history | `python__mypy-16869` / `8c2ef9dde8aa803e04038427ad84f09664d9d93f` | Stubgen crashes on TypeVarTuple usage | 44 | `mypy/stubgen.py` | Recent stub-generation boundary. |
| history | `python__mypy-11567` / `7f0ad943e4b189224f2fedf43aa7b38f53ec561e` | AST diff crash related to ParamSpec | 88 | `mypy/server/astdiff.py` | Long incremental-server replay. |
| current_anchor | `python__mypy-15976` / `d7b24514d7301f86031b7d1e2215cf8c2476bec0` | attrs & dataclasses false positive error with slots=True when subclassing from non-slots base class | 46 | `mypy/plugins/attrs.py`, `mypy/plugins/dataclasses.py` | Disjoint plugin anchor. |
| current_anchor | `python__mypy-15155` / `6b1fc865902bf2b845d3c58b6b9973b5a412241f` | Crash type-checking overloaded function | 60 | `mypy/applytype.py`, `mypy/expandtype.py`, `mypy/subtypes.py` | Disjoint type-operation anchor. |
| current_anchor | `python__mypy-12548` / `222029b07e0fdcb3c174f15b61915b3b2e1665ca` | "Parameters cannot be constrained" with generic ParamSpec | 38 | `mypy/constraints.py` | Disjoint constraints anchor. |
| current_anchor | `python__mypy-10683` / `2ebdbca3b5afbfa1113f01b583522f4afcc4b3e3` | Fix typeguards crash when assigning guarded value in if statement | 24 | `mypy/binder.py` | Disjoint binder anchor. |
| current_anchor | `python__mypy-10430` / `204c7dada412b0ca4ce22315d2acae640adb128f` | Crash from module level __getattr__ in incremental mode | 40 | `mypy/nodes.py` | Disjoint AST-node anchor. |
| current_anchor | `python__mypy-10401` / `44925f4b121392135440f53d7c8a3fb30593d6cc` | Unresolved references + tuples crashes mypy | 56 | `mypy/join.py` | Disjoint join anchor. |

## W02 Team A — pandas-dev/pandas

Inventory capacity: 60 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 24/24 unique touched paths. History is deliberately split
across reductions, periods, Arrow strings, merge, indexing, and Excel IO. Current
anchors are separately split across datetime fields, interchange/exchange, datetime-like
arrays, MultiIndex, and parsing. This is substantially better aligned with distinct
project work than a longest-trajectory-only selection; the remaining risk is that most
items still live below the broad `pandas/core` or `_libs` umbrellas.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `pandas-dev__pandas-53418` / `26bbd4b2c52f975d33a7f2211e9fd07533ed671c` | BUG: Pandas uint64 sums to int64 | 100 | `doc/source/whatsnew/v2.1.0.rst`, `pandas/core/nanops.py` | Long core reduction replay. |
| history | `pandas-dev__pandas-51793` / `c71645fff865c29e77bb81bd9510dba97d93a67c` | CLN: Refactor PeriodArray._format_native_types to use DatetimeArray | 56 | `pandas/_libs/tslibs/period.pyi`, `pandas/_libs/tslibs/period.pyx`, `pandas/core/arrays/period.py` | Period/DatetimeArray history. |
| history | `pandas-dev__pandas-52076` / `c2ef58e55936668c81b2cc795d1812924236e1a6` | BUG: Passing pyarrow string array + dtype to `pd.Series` throws ArrowInvalidError on 2.0rc | 42 | `pandas/_libs/lib.pyx`, `pandas/core/arrays/string_.py`, `pandas/core/arrays/string_arrow.py` | Arrow-string history. |
| history | `pandas-dev__pandas-54087` / `dbb19b9f6ec77edcbdf535ff506c3b7659fc0c69` | BUG: In development version, `pd.merge` with `Series` arguments an `how="cross"` fails | 38 | `pandas/core/reshape/merge.py` | Reshape/merge history. |
| history | `pandas-dev__pandas-48619` / `85246fe460e93d2b891a1c116bcef3cb1a698664` | BUG: "ValueError: The truth value ... is ambiguous" when using .loc setitem | 38 | `pandas/core/indexing.py` | Indexing history. |
| history | `pandas-dev__pandas-55807` / `51f3d03087414bdff763d3f45b11e37b2a28ea84` | ENH: _openpyxl.py load_workbook allow to modify the read_only, data_only and keep_links parameters using engine_kwargs | 100 | `doc/source/whatsnew/v2.2.0.rst`, `pandas/io/excel/_openpyxl.py` | Long IO/Excel replay. |
| current_anchor | `pandas-dev__pandas-58549` / `1556dc050511f7caaf3091a94660721840bb8c9a` | BUG: DatetimeIndex.is_year_start breaks on double-digit frequencies | 36 | `doc/source/whatsnew/v3.0.0.rst`, `pandas/_libs/tslibs/fields.pyi`, `pandas/_libs/tslibs/fields.pyx`, `pandas/_libs/tslibs/timestamps.pyx`, `pandas/core/arrays/datetimes.py` | Disjoint datetime anchor. |
| current_anchor | `pandas-dev__pandas-57758` / `a93fd6e218d0082579eee624e547a72f0fd961bc` | BUG: DataFrame Interchange Protocol errors on Boolean columns | 54 | `doc/source/whatsnew/v2.2.2.rst`, `pandas/core/interchange/utils.py` | Disjoint interchange anchor. |
| current_anchor | `pandas-dev__pandas-47804` / `f7e0e68f340b62035c30c8bf1ea4cba38a39613d` | BUG: Interchange `Column.null_count` is a NumPy scalar, not a builtin `int` | 26 | `pandas/core/exchange/column.py` | Disjoint exchange-protocol anchor. |
| current_anchor | `pandas-dev__pandas-50773` / `c426dc0d8a6952f7d4689eaa6a5294aceae66e1e` | BUG: DatetimeIndex with non-nano values and freq='D' throws ValueError | 28 | `pandas/core/arrays/datetimelike.py` | Disjoint datetime-like anchor. |
| current_anchor | `pandas-dev__pandas-51605` / `b070d87f118709f7493dfd065a17ed506c93b59a` | REGR: MultiIndex.isin with an empty iterable raises | 28 | `pandas/core/indexes/multi.py` | Disjoint MultiIndex anchor. |
| current_anchor | `pandas-dev__pandas-48970` / `c34da509497717308c97c4a211ad3ff9bab92d87` | BUG: to_datetime(..., infer_datetime_format=True) fails if argument is np.str_ | 22 | `pandas/_libs/tslibs/parsing.pyx`, `pandas/core/tools/datetimes.py` | Disjoint parser/tooling anchor. |

## W02 Team B — dask/dask

Inventory capacity: 28 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 12/12 unique touched paths. Current anchors contain exactly
two `dask/array` tasks and otherwise cover dataframe/CSV IO, delayed execution, config,
and multiprocessing scheduler behavior. There is no inventory task touching `dask/bag/`
(0/28 candidates), so bag coverage cannot be asserted and must not be fabricated. The
history set retains base/utils/dataframe and distinct array subcomponents rather than
reusing current-anchor patch files.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `dask__dask-9378` / `8b95f983c232c1bd628e9cba0695d3ef229d290b` | Mask preserving *_like functions | 100 | `dask/array/ma.py` | Long array replay. |
| history | `dask__dask-8484` / `c79a4be64bf6108aeb5dd7ff1cef0c3302bbb696` | nanmin & nanmax no longer work for scalar input | 76 | `dask/array/reductions.py` | Long reduction replay. |
| history | `dask__dask-6809` / `80239dab180ea9b2a444ef03b1998cf9fd589292` | DataFrame.join doesn't accept Series as other | 28 | `dask/dataframe/core.py` | Dataframe-core history. |
| history | `dask__dask-8185` / `9460bc4ed1295d240dd464206ec81b82d9f495e2` | Inconsistent Tokenization due to Lazy Registration | 24 | `dask/utils.py` | Utility/tokenization history. |
| history | `dask__dask-9213` / `0ee07e3cc1ccd822227545936c1be0c94f84ad54` | datetime.timedelta deterministic hashing | 54 | `dask/base.py` | Base-tokenization history. |
| history | `dask__dask-7894` / `bf4bc7dd8dc96021b171e0941abde7a5f60ce89f` | map_overlap does not always trim properly when drop_axis is not None | 30 | `dask/array/overlap.py` | Array-overlap history. |
| current_anchor | `dask__dask-10972` / `9c20facdfb5f20e28f0e9259147283f8a7982728` | test_encoding_gh601[utf-16] doesn't always fail | 70 | `dask/dataframe/io/csv.py` | Dataframe/CSV IO anchor. |
| current_anchor | `dask__dask-7656` / `07d5ad0ab1bc8903554b37453f02cc8024460f2a` | dataclass issue with fields that have init=False | 26 | `dask/delayed.py` | Delayed execution anchor. |
| current_anchor | `dask__dask-10521` / `da256320ef0167992f7183c3a275d092f5727f62` | Incorrect behavior of override_with argument in dask.config.get | 22 | `dask/config.py` | Config anchor. |
| current_anchor | `dask__dask-7191` / `2640241fbdf0c5efbcf35d96eb8cc9c3df4de2fd` | HighLevelGraph erroneously propagates into local scheduler optimization routines | 20 | `dask/multiprocessing.py` | Scheduler-process anchor. |
| current_anchor | `dask__dask-10422` / `7ace31f93ddc0b879f14bb54755b9f547bf60188` | dask.array.core.to_zarr with distributed scheduler, MutableMapping should be ok if backed by disk | 28 | `dask/array/core.py` | Array storage anchor (1/2). |
| current_anchor | `dask__dask-6749` / `e85942f8e1499488fec4a11efd137014e5f4fa27` | Missing 2D case for residuals in dask.array.linalg.lstsq | 32 | `dask/array/linalg.py` | Array linalg anchor (2/2). |

## W03 Team A — iterative/dvc

Inventory capacity: 23 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 13/13 unique touched paths; command, remote, repository,
config, parsing, stage, output, and tree work are represented.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `iterative__dvc-4075` / `a2f1367a9a75849ef6ad7ee23a5bacc18580f102` | Implement `--no-exec` option for `import-url` command | 100 | `dvc/command/imp_url.py`, `dvc/repo/imp_url.py` | Long command/repo replay. |
| history | `iterative__dvc-2231` / `817e3f8bfaa15b2494dae4853c6c3c3f5f701ad9` | Delete the Output-Files by checkout to other branches. | 52 | `dvc/remote/base.py` | Remote/checkout history. |
| history | `iterative__dvc-6954` / `28dd39a1a0d710585ff21bf66199208b1b83cbde` | Negative numbers from a Python file are not recognized as parameters | 36 | `dvc/utils/serialize/_py.py` | Serialization evidence. |
| history | `iterative__dvc-8380` / `e556c632b371b3474d6546bdf68dd4bb6f9ec093` | UnicodeDecodeError during parsing Config file | 26 | `dvc/config.py` | Config encoding history. |
| history | `iterative__dvc-5004` / `7c45711e34f565330be416621037f983d0034bef` | Boolean value might get unnecessarily uppercased | 76 | `dvc/parsing/interpolate.py` | Long parsing replay. |
| history | `iterative__dvc-2254` / `217f2c4dbd4b38ab465f0b8bd85b369b30734d3d` | run: running the same command twice on a callback stage doesn't reproduce | 46 | `dvc/stage.py` | Stage reproduction history. |
| current_anchor | `iterative__dvc-6600` / `eb6562207b0ee9bd7fd2067103f3ff3b6c6cd18b` | pull -r remote: Disregards specified http remote | 28 | `dvc/output.py` | Disjoint output anchor. |
| current_anchor | `iterative__dvc-4785` / `7da3de451f1580d0c48d7f0a82b1f96ea0e91157` | http: do not ignore HTTP statuses when working with HTTP(S) remotes | 26 | `dvc/tree/http.py` | Disjoint HTTP-tree anchor. |
| current_anchor | `iterative__dvc-1651` / `9a298fc835e0266d919fde046d6c567e52d4f045` | status: using the --remote would imply --cloud | 32 | `dvc/repo/status.py` | Disjoint repo-status anchor. |
| current_anchor | `iterative__dvc-6683` / `0bf1802d4bc045d5dc2a2c3258c3d6b0d9425761` | alias `list` as `ls`? | 100 | `dvc/command/ls/__init__.py` | Long command-list anchor. |
| current_anchor | `iterative__dvc-5839` / `daf07451f8e8f3e76a791c696b0ea175e8ed3ac1` | metrics show: --precision argument has no effect | 60 | `dvc/command/metrics.py` | Disjoint metrics command anchor. |
| current_anchor | `iterative__dvc-4778` / `f8ba5daae23ffc5c2135f86670bd562d6ce654d7` | Cannot dvc add an already tracked file that lies in a folder | 100 | `dvc/utils/__init__.py` | Long utility anchor, patch reserved. |

## W03 Team B — Project-MONAI/MONAI

Inventory capacity: 50 selected official tasks with at least 20 messages. Check:
12/12 unique problem hashes; 16/16 unique touched paths; eleven MONAI areas are covered.
This replaces Pydantic as the sixth primary Team; it has substantially more source-pack
headroom. Medical-domain terminology still requires PII/credential and licensing review
at the exact pinned source commit before any material is distributed.

| Role | instance_id / base_commit | Title | Msg | Touched files | Rationale |
| --- | --- | --- | ---: | --- | --- |
| history | `Project-MONAI__MONAI-6147` / `678b5124a74f32859d692d142728ca1f7fa98a25` | Inconsistent writing of Metadata. Loading + Saving results in different metadata. | 74 | `monai/data/image_writer.py`, `monai/networks/layers/filtering.py`, `monai/transforms/io/array.py`, `monai/transforms/io/dictionary.py` | Long cross-module metadata replay. |
| history | `Project-MONAI__MONAI-4745` / `9c12cd8aab54e31f7c87956ca6fc20573d2148ec` | Unsupported data type in `ConcatItemsD` | 66 | `monai/transforms/utility/dictionary.py` | Long transform evidence. |
| history | `Project-MONAI__MONAI-907` / `f2ea6fa7a75acc235037e91611638be6bf34188a` | sliding_window_inference() in monai.inferers went wrong when roi_size=(M,N,1) | 56 | `monai/inferers/utils.py` | Inference-history diversity. |
| history | `Project-MONAI__MONAI-7548` / `95f69dea3d2ff9fb3d0695d922213aefaf5f0c39` | Perceptual loss with medicalnet_resnet50_23datasets errors due to a typo. | 34 | `monai/losses/perceptual.py` | Loss-module history. |
| history | `Project-MONAI__MONAI-1571` / `866d53df3f754e25fb4635abeb3f27cdaaa718cd` | Classification can't work in distributed data parallel if has rich meta data | 30 | `monai/handlers/classification_saver.py`, `monai/handlers/utils.py` | Distributed handler evidence. |
| history | `Project-MONAI__MONAI-6560` / `9d6ccce3d46d64b3ffe289349f50323bd0a1b6eb` | Enhance `check_properties` in `monai.bundle.workflows` | 68 | `monai/bundle/workflows.py` | Long bundle workflow replay. |
| current_anchor | `Project-MONAI__MONAI-6895` / `59bcad45030a9abce369e5acaf6aa726fb48a5c8` | RankFilter in a single gpu environment | 24 | `monai/utils/dist.py` | Disjoint distributed-utility anchor. |
| current_anchor | `Project-MONAI__MONAI-5543` / `e4b99e15353a86fc1f14b34ddbc337ff9cd759b0` | Amend extract_levels for LocalNet | 38 | `monai/networks/nets/regunet.py` | Disjoint network anchor. |
| current_anchor | `Project-MONAI__MONAI-4662` / `cbe16eb326830ef31479fd34ae1e44d27fc2d64d` | BUG in `RandCropBoxByPosNegLabeld` | 58 | `monai/apps/detection/transforms/dictionary.py` | Disjoint detection-app anchor. |
| current_anchor | `Project-MONAI__MONAI-3715` / `d36b835b226ab95ffae5780629a5304d8df5883e` | `mode` of Evaluator can't work with string input | 60 | `monai/engines/evaluator.py` | Disjoint engine anchor. |
| current_anchor | `Project-MONAI__MONAI-3675` / `b2cc1668c0fe5b961721e5387ac6bc992e72d4d7` | Change exception to warning in AUC metric | 20 | `monai/metrics/rocauc.py` | Disjoint metric anchor. |
| current_anchor | `Project-MONAI__MONAI-6975` / `392c5c1b860c0f0cfd0aa14e9d4b342c8b5ef5e7` | `Lazy=True` ignored when using `Dataset` call | 64 | `monai/transforms/transform.py` | Disjoint transform execution anchor. |

## Required next checks before task admission

1. Recompute the listed uniqueness checks from the locked inventory in CI and retain
   the full `problem_statement_sha256` values in the source pack manifest.
2. Read `LICENSE`/`NOTICE` at every selected `base_commit`; dataset MIT metadata is not
   a substitute for repository-commit licensing or MONAI dependency notices.
3. Perform the required PII, credential, absolute-path, and future-answer scan before
   retaining any trajectory message. Preserve only cleaned, ordered replay content for
   history; keep each current-anchor reference patch/test patch outside all historical
   assets.
4. Create no Gold, Query, pair role, or source-task admission decision until evidence,
   code/workspace availability, and the Formal V2 uniqueness audit pass.
