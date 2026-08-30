---
name: prometheus-configuration
description: Set up Prometheus for comprehensive metric collection, storage, and monitoring of infrastructure and applications. Use when implementing metrics collection, setting up monitoring infrastructure, or configuring alerting systems.
---

## TDAI Host Routing

Load this package with `skill_view`. If the manifest points to a supporting file, read that file with `skill_files_read`; do not install or execute source-repository dependencies for Task 1.

Use when:
- Setting up Prometheus monitoring
- Reviewing collection and metric configuration

Do not use when:
- Do not use for tracing-only investigations
- Do not change monitoring configuration without checking service impact

The upstream technical workflow below is preserved unchanged.


# Prometheus Configuration

Complete guide to Prometheus setup, metric collection, scrape configuration, and recording rules.

## Purpose

Configure Prometheus for comprehensive metric collection, alerting, and monitoring of infrastructure and applications.

## When to Use

- Set up Prometheus monitoring
- Configure metric scraping
- Create recording rules
- Design alert rules
- Implement service discovery

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.

## Best Practices

1. **Use consistent naming** for metrics (prefix_name_unit)
2. **Set appropriate scrape intervals** (15-60s typical)
3. **Use recording rules** for expensive queries
4. **Implement high availability** (multiple Prometheus instances)
5. **Configure retention** based on storage capacity
6. **Use relabeling** for metric cleanup
7. **Monitor Prometheus itself**
8. **Implement federation** for large deployments
9. **Use Thanos/Cortex** for long-term storage
10. **Document custom metrics**

## Troubleshooting

**Check scrape targets:**

```bash
curl http://localhost:9090/api/v1/targets
```

**Check configuration:**

```bash
curl http://localhost:9090/api/v1/status/config
```

**Test query:**

```bash
curl 'http://localhost:9090/api/v1/query?query=up'
```


## Related Skills

- `grafana-dashboards` - For visualization
- `slo-implementation` - For SLO monitoring
- `distributed-tracing` - For request tracing
