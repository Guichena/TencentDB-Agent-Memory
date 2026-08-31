# Sol review questions

- K2 Positive 的唯一缺口是否严格限定为 Repartition 类定义的固定 file/line，没有暗示方法体、调用边或分区修复结论？
- K2 Negative 是否只补入 `dask/dataframe/dask_expr/_repartition.py:29`，并保持公共入口、量化重分区、数组实现排除项及 query 不变？
- K3 Positive 的唯一缺口是否严格限定为固定 operations policy 的完整结论，没有把已有的行数指标、worker 指标或无基准背景误当成政策原文？
- K3 Negative 是否只补齐先比较 partition row-count spread、记录 partitioning decision、再解读 worker utilization，以及没有 measured run 不 claim speedup 的规则？
- 两个 pair 的 provider-visible 文本是否没有资产标识、动作名称、Gold/评分/模型/生成器语言，并且各自的目标资源与排除项保持唯一可选？
