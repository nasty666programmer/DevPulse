# Log viewing (Loki + Grafana) — Design

Date: 2026-08-20
Status: Approved

## Purpose

Give the team a searchable web UI over the structured JSON logs the
backend already emits (via `Logger`/pino, added in a prior change) —
instead of `kubectl logs` per pod. Result: a Grafana Explore view over
all pod logs (backend, frontend, RSS/Telegram CronJobs) on the prod
cluster, filterable by pod/level/text, with 7 days of retention.

Out of scope for this iteration (deliberately): alerting on log
patterns, metrics/traces (only logs), log-based dashboards beyond one
basic "logs by service" panel, and any change to application code —
the existing pino JSON-to-stdout output is consumed as-is.

## Constraint that shapes this design

Prod is a single Hetzner CX22 node (2 vCPU / 4GB RAM) already running
MongoDB, backend, frontend, Traefik ingress and cert-manager (see
`docs/kubernetes-migration.md` §8). Current committed resource
`requests` there: backend 128Mi, mongo 256Mi, frontend 2×16Mi — roughly
2.5-3GB genuinely free at idle once k3s system components are
accounted for.

A full ELK stack (Elasticsearch + Kibana, typically ≥2GB JVM heap for
Elasticsearch alone, plus Kibana) does not comfortably fit alongside
the existing workload on this node. **Grafana Loki + Promtail +
Grafana** gives the same practical result — search and browse logs
through a web UI — for a small fraction of the resource footprint,
because Loki indexes only log metadata/labels, not full text, unlike
Elasticsearch.

## Components

```
k8s/base/logging/                    (new, in pulsedev-infra)
  promtail-rbac.yaml                 — ServiceAccount + ClusterRole + ClusterRoleBinding
  promtail-configmap.yaml            — scrape config (kubernetes_sd_configs)
  promtail-daemonset.yaml            — 1 pod (single node)
  loki-configmap.yaml                — single-binary config, filesystem storage, 7d retention
  loki-statefulset.yaml              — + PVC 2Gi (local-path-provisioner, same as mongo)
  loki-service.yaml
  grafana-datasource-configmap.yaml  — provisions Loki as a datasource (as code)
  grafana-dashboard-configmap.yaml   — one basic "logs by service" dashboard (as code)
  grafana-deployment.yaml            — no PVC; state is fully provisioned via ConfigMaps
  grafana-service.yaml
  grafana-secret.example.yaml        — template for the admin password (real one created via kubectl)
```

All new files register in `k8s/base/kustomization.yaml`. `k8s/base/ingress.yaml`
gets one new path (`/grafana`). No changes to the `DevPulse` repo (app
code) — Promtail reads container stdout as-is.

## Resource budget

Mirrors the existing `requests`/`limits` style already used for
backend/mongo/frontend in `pulsedev-infra`:

| Component | Kind | requests | limits |
|---|---|---|---|
| Promtail | DaemonSet (1 pod) | 20m / 32Mi | 100m / 64Mi |
| Loki | StatefulSet + PVC 2Gi | 50m / 128Mi | 200m / 256Mi |
| Grafana | Deployment | 20m / 64Mi | 200m / 128Mi |

Total added: ~90m CPU / ~224Mi RAM requests — fits the node's free
headroom alongside the existing workload.

## Data flow

```
backend/frontend/CronJob pods (pino JSON → stdout)
  → containerd writes to /var/log/pods on the node
  → Promtail DaemonSet tails those files, attaches k8s labels
    (namespace, pod, container, app) via kubernetes_sd_configs
  → pushes to Loki (single-binary, filesystem storage)
  → Grafana queries Loki via LogQL (Explore, or the provisioned dashboard)
```

Promtail auto-discovers pods through the k8s API (RBAC via
ClusterRole) — no per-service scrape config, so new CronJobs or
services are picked up automatically with no manifest change.

Because pino already emits structured JSON (`{"level":30,"msg":"...",
"err":{...}}`), LogQL's `| json` parser can extract `level` at query
time in Grafana without any Promtail-side pipeline config — numeric
pino levels (30=info, 40=warn, 50=error) are filterable directly in
Explore.

## Retention and storage

Loki's `limits_config.retention_period: 168h` (7 days) + built-in
compactor. 2Gi PVC — generous headroom for a 6-user pet-project log
volume over that window.

## Access

Grafana is reachable at `https://pulsedev.duckdns.org/grafana` — a new
path on the existing `devpulse-ingress`/host, reusing the already-issued
Let's Encrypt cert (no new DNS subdomain or cert-manager config
needed). Requires `GF_SERVER_ROOT_URL=https://pulsedev.duckdns.org/grafana/`
and `GF_SERVER_SERVE_FROM_SUB_PATH=true` env vars so Grafana's static
assets/redirects work correctly under the sub-path.

Auth is Grafana's own login screen (admin user + password from a
Secret, same pattern as `backend-secret`/`mongo-secret`: a
`grafana-secret.example.yaml` template in-repo, real secret created via
`kubectl create secret` on the server), behind TLS. No additional
Traefik BasicAuth layer — considered and deliberately skipped as
redundant for this project's scale.

## Error handling

- Promtail losing connectivity to Loki: buffers and retries (built-in
  behavior); does not crash or drop the pod it's reading from.
- Loki pod restart: Promtail's `positions.yaml` (stored on its own
  local state, not persisted) means a restart may re-send a small
  overlap of recent lines — acceptable for a log-viewing use case, not
  a correctness-critical pipeline.
- Grafana pod restart: no data loss — all configuration (datasource,
  dashboard, org settings) is provisioned from ConfigMaps, not stored
  in a PVC, so a fresh pod comes up identically configured.

## Testing / rollout

1. `kubectl apply -k k8s/overlays/dev` in `kind`/`minikube` first —
   confirm all three pods reach `Running` and Promtail's RBAC is
   sufficient (matches this repo's existing "verify in kind before
   prod" convention).
2. `kubectl logs -l app=promtail` — no scrape/push errors.
3. On prod: log into `https://pulsedev.duckdns.org/grafana`, open
   Explore, select the Loki datasource, run `{app="backend"}` — confirm
   live backend logs appear.
4. `kubectl delete pod` on a backend pod — confirm Promtail picks up
   the replacement pod automatically (no manifest change needed) and
   logs keep flowing.
5. Confirm the compactor's retention setting in `loki-configmap.yaml`
   matches 7d (config review, not a week-long live wait).
