# T14 Natural Negative review questions

- Verify all ten cases are self-contained coding or configuration tasks whose answers are fully determined by the visible context.
- Verify coverage is balanced across Borealis Platform, Meridian Fleet, Forge Build, Aurora Release, and Cedar Config, with Kubernetes, Helm, Flux GitOps, Tekton/container builds, progressive delivery, and configuration drift represented.
- Verify each case is independent, uses no internal lookup or asset references, and contains no provider-visible implementation metadata.
- Verify the requested YAML/Dockerfile/Helm outputs preserve the explicitly immutable fields and use the exact values stated in each context.
