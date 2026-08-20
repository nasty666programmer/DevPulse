# Log Viewing (Loki + Grafana) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Grafana Loki + Promtail + Grafana stack to the prod k3s cluster so logs from every pod (backend, frontend, RSS/Telegram CronJobs) are searchable through a web UI, replacing ad-hoc `kubectl logs`.

**Architecture:** Promtail runs as a DaemonSet, auto-discovering every pod on the node via the k8s API and tailing its container log files from `/var/log/pods` — no application code changes, since the backend already emits structured JSON via pino to stdout. Promtail pushes to Loki (single-binary mode, filesystem storage on a PVC, 7-day retention via the compactor). Grafana queries Loki as its only datasource (provisioned via ConfigMap, not manual UI setup) and is reachable at `/grafana` on the existing Ingress host, behind its own login (admin/password from a Secret).

**Tech Stack:** Kubernetes manifests (raw YAML + Kustomize, no Helm — matches this repo's existing convention), `grafana/promtail:3.0.0`, `grafana/loki:3.0.0`, `grafana/grafana:11.0.0`.

**Spec:** `docs/superpowers/specs/2026-08-20-loki-logging-design.md`

## Global Constraints

- All work happens in the **`pulsedev-infra`** repository, checked out locally at `C:\Users\GameON\Desktop\pulsedev-infra` — NOT in this repo (`DevPulse`). Every file path below is relative to that repo's root unless stated otherwise. Run all commands from `pulsedev-infra/`.
- No `metadata.namespace` field on any resource — matches every existing manifest in this repo (everything deploys to `default` via the ambient kubectl context; confirmed via `grep -rn namespace k8s` finding zero hits).
- Pin every image to an explicit version, never `:latest` — matches `mongo:7`, `ghcr.io/.../devpulse-backend:latest` being the one deliberate exception (documented in that file) for the rest.
- `resources.requests`/`resources.limits` on every container — matches every existing Deployment/StatefulSet/CronJob in this repo. Use the exact values from the spec's "Resource budget" section.
- Validation gate for every task (this repo's equivalent of a test suite for YAML): `kubectl kustomize k8s/base` must render without error. This is client-side template rendering only — it does not validate against a live cluster's OpenAPI schema (this repo has no `kind`/`minikube` available locally either; see Task 5). It still catches YAML syntax errors, broken `configMapKeyRef`/`secretKeyRef` names, and Kustomize wiring mistakes (missing resource entries, duplicate names).
- Every task ends with `kubectl kustomize k8s/base` succeeding and a commit.
- Secret templates (`*.example.yaml`) are committed; real Secrets are created directly on the cluster via `kubectl create secret`, never committed — matches `secret.example.yaml`/`mongo-secret.example.yaml`.

---

### Task 1: Promtail — RBAC, scrape config, DaemonSet

**Files:**
- Create: `k8s/base/logging/promtail-rbac.yaml`
- Create: `k8s/base/logging/promtail-configmap.yaml`
- Create: `k8s/base/logging/promtail-daemonset.yaml`
- Modify: `k8s/base/kustomization.yaml`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: a `promtail` DaemonSet pushing to `http://loki-service:3100/loki/api/v1/push` — Task 2 must create a Service named exactly `loki-service` listening on port `3100`, or Promtail's pushes will fail (this is the one cross-task contract in this plan; the failure mode — Promtail logs `connection refused` — is silent otherwise, so get the name/port right).

- [ ] **Step 1: Create the RBAC manifests**

Create `k8s/base/logging/promtail-rbac.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: promtail
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: promtail
rules:
  - apiGroups: [""]
    resources: ["pods", "nodes"]
    verbs: ["get", "watch", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: promtail
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: promtail
subjects:
  - kind: ServiceAccount
    name: promtail
    namespace: default
```

- [ ] **Step 2: Create the scrape config**

Create `k8s/base/logging/promtail-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
      grpc_listen_port: 0

    positions:
      filename: /run/promtail/positions.yaml

    clients:
      - url: http://loki-service:3100/loki/api/v1/push

    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        pipeline_stages:
          - cri: {}
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_node_name]
            target_label: node
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - source_labels: [__meta_kubernetes_pod_label_app]
            target_label: app
          - source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container
          - source_labels:
              - __meta_kubernetes_pod_uid
              - __meta_kubernetes_pod_container_name
            separator: /
            target_label: __path__
            replacement: /var/log/pods/*$1/*.log
```

`pipeline_stages: - cri: {}` matters here specifically because k3s uses containerd (CRI log format: a timestamp/stream prefix on every line), not plain Docker JSON logging — without this stage every log line would arrive in Loki with that prefix still attached instead of just the pino JSON payload. The `__path__` relabel pattern (`/var/log/pods/*$1/*.log`) is Promtail's own documented k8s-pod-logs convention — `$1` expands to `<pod_uid>/<container_name>`, matching how containerd lays out log files on the node.

- [ ] **Step 3: Create the DaemonSet**

Create `k8s/base/logging/promtail-daemonset.yaml`:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      serviceAccountName: promtail
      containers:
        - name: promtail
          image: grafana/promtail:3.0.0
          args:
            - -config.file=/etc/promtail/promtail.yaml
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
            - name: pod-logs
              mountPath: /var/log/pods
              readOnly: true
            - name: positions
              mountPath: /run/promtail
          resources:
            requests:
              cpu: 20m
              memory: 32Mi
            limits:
              cpu: 100m
              memory: 64Mi
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: pod-logs
          hostPath:
            path: /var/log/pods
        - name: positions
          emptyDir: {}
```

`positions` is an `emptyDir`, not a `hostPath` — it resets on pod restart, meaning a small window of already-shipped log lines may be re-sent to Loki after a Promtail restart. Acceptable for a log-viewing tool (documented in the spec's "Error handling" section); not worth a `hostPath` for this project's scale.

- [ ] **Step 4: Wire into the base kustomization**

Modify `k8s/base/kustomization.yaml` — add three lines to `resources:` (anywhere before `ingress.yaml` is fine; grouped here right after the existing CronJobs):

```yaml
resources:
  - configmap.yaml
  - mongo-statefulset.yaml
  - mongo-service.yaml
  - backend-deployment.yaml
  - backend-service.yaml
  - frontend-deployment.yaml
  - frontend-service.yaml
  - rss-collect-cronjob.yaml
  - telegram-collect-cronjob.yaml
  - logging/promtail-rbac.yaml
  - logging/promtail-configmap.yaml
  - logging/promtail-daemonset.yaml
  - ingress.yaml
  - cluster-issuer.yaml # requires cert-manager already installed on the cluster — see the file's header
  # secret.example.yaml and mongo-secret.example.yaml are templates, not applied —
  # create the real Secrets directly in the cluster (kubectl create secret ...,
  # see each file's header).
```

- [ ] **Step 5: Validate the build**

Run (from `pulsedev-infra/`): `kubectl kustomize k8s/base`
Expected: renders successfully, includes the new `ServiceAccount/promtail`, `ClusterRole/promtail`, `ClusterRoleBinding/promtail`, `ConfigMap/promtail-config`, and `DaemonSet/promtail` objects, no errors.

- [ ] **Step 6: Commit**

```bash
git add k8s/base/logging/promtail-rbac.yaml k8s/base/logging/promtail-configmap.yaml k8s/base/logging/promtail-daemonset.yaml k8s/base/kustomization.yaml
git commit -m "$(cat <<'EOF'
feat: add Promtail DaemonSet for log collection

Auto-discovers every pod on the node via the k8s API and tails its
container logs from /var/log/pods, no app-side changes needed since
the backend already emits structured JSON to stdout. Pushes to
loki-service:3100 (Task 2). CRI pipeline stage strips containerd's
timestamp/stream log-line prefix before the JSON payload reaches Loki.
EOF
)"
```

---

### Task 2: Loki — config, StatefulSet, Service

**Files:**
- Create: `k8s/base/logging/loki-configmap.yaml`
- Create: `k8s/base/logging/loki-statefulset.yaml`
- Create: `k8s/base/logging/loki-service.yaml`
- Modify: `k8s/base/kustomization.yaml`

**Interfaces:**
- Consumes: nothing from earlier tasks (Promtail's push URL from Task 1 depends on this task's Service name, not the reverse — order between Task 1 and 2 doesn't matter functionally, this plan just does Promtail first).
- Produces: `Service/loki-service` on port `3100`, used by Task 1 (push) and Task 3 (Grafana datasource query URL `http://loki-service:3100`).

- [ ] **Step 1: Create the Loki config**

Create `k8s/base/logging/loki-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: loki-config
data:
  loki.yaml: |
    auth_enabled: false

    server:
      http_listen_port: 3100

    common:
      path_prefix: /loki
      storage:
        filesystem:
          chunks_directory: /loki/chunks
          rules_directory: /loki/rules
      replication_factor: 1
      ring:
        kvstore:
          store: inmemory

    schema_config:
      configs:
        - from: 2024-01-01
          store: tsdb
          object_store: filesystem
          schema: v13
          index:
            prefix: index_
            period: 24h

    limits_config:
      retention_period: 168h
      reject_old_samples: true
      reject_old_samples_max_age: 168h

    compactor:
      working_directory: /loki/compactor
      compaction_interval: 10m
      retention_enabled: true
      retention_delete_delay: 2h
      delete_request_store: filesystem
```

`retention_period: 168h` is the spec's 7-day retention requirement. `delete_request_store: filesystem` is required by Loki's compactor whenever `retention_enabled: true` and the object store isn't S3/GCS/Azure — without it the compactor won't actually delete data past the retention window, it'll just stop ingesting new samples older than the window (a silent-looking retention bug if omitted).

- [ ] **Step 2: Create the StatefulSet**

Create `k8s/base/logging/loki-statefulset.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: loki
spec:
  serviceName: loki-service
  replicas: 1
  selector:
    matchLabels:
      app: loki
  template:
    metadata:
      labels:
        app: loki
    spec:
      # grafana/loki's image runs as uid 10001 by default; fsGroup makes the
      # PVC (owned by local-path-provisioner as root otherwise) writable by
      # that uid — without this, Loki fails to start with a permission error
      # on /loki the first time the PVC is provisioned.
      securityContext:
        fsGroup: 10001
      containers:
        - name: loki
          image: grafana/loki:3.0.0
          args:
            - -config.file=/etc/loki/loki.yaml
          ports:
            - containerPort: 3100
          volumeMounts:
            - name: config
              mountPath: /etc/loki
            - name: loki-data
              mountPath: /loki
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
      volumes:
        - name: config
          configMap:
            name: loki-config
  # k3s ships local-path-provisioner as the default StorageClass (same as
  # mongo-statefulset.yaml), so this provisions itself on the node's disk
  # with zero extra setup.
  volumeClaimTemplates:
    - metadata:
        name: loki-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 2Gi
```

- [ ] **Step 3: Create the Service**

Create `k8s/base/logging/loki-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: loki-service
spec:
  selector:
    app: loki
  ports:
    - port: 3100
      targetPort: 3100
```

- [ ] **Step 4: Wire into the base kustomization**

Modify `k8s/base/kustomization.yaml` — add after the Promtail lines from Task 1:

```yaml
  - logging/promtail-rbac.yaml
  - logging/promtail-configmap.yaml
  - logging/promtail-daemonset.yaml
  - logging/loki-configmap.yaml
  - logging/loki-statefulset.yaml
  - logging/loki-service.yaml
  - ingress.yaml
```

- [ ] **Step 5: Validate the build**

Run: `kubectl kustomize k8s/base`
Expected: renders successfully, includes `ConfigMap/loki-config`, `StatefulSet/loki`, `Service/loki-service`, no errors.

- [ ] **Step 6: Commit**

```bash
git add k8s/base/logging/loki-configmap.yaml k8s/base/logging/loki-statefulset.yaml k8s/base/logging/loki-service.yaml k8s/base/kustomization.yaml
git commit -m "$(cat <<'EOF'
feat: add Loki StatefulSet (single-binary, filesystem storage)

7-day retention via the compactor + delete_request_store: filesystem
(required for retention to actually delete data on a non-object-store
backend). 2Gi PVC via local-path-provisioner, same pattern as Mongo's.
fsGroup: 10001 so the image's non-root user can write to the PVC.
EOF
)"
```

---

### Task 3: Grafana — datasource, dashboard, Deployment, Service, Secret template

**Files:**
- Create: `k8s/base/logging/grafana-datasource-configmap.yaml`
- Create: `k8s/base/logging/grafana-dashboard-configmap.yaml`
- Create: `k8s/base/logging/grafana-deployment.yaml`
- Create: `k8s/base/logging/grafana-service.yaml`
- Create: `k8s/base/logging/grafana-secret.example.yaml`
- Modify: `k8s/base/kustomization.yaml`

**Interfaces:**
- Consumes: `Service/loki-service:3100` (Task 2).
- Produces: `Service/grafana-service` on port `3000` — consumed by Task 4's Ingress patch (`/grafana` path).

- [ ] **Step 1: Create the datasource provisioning ConfigMap**

Create `k8s/base/logging/grafana-datasource-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
data:
  loki.yaml: |
    apiVersion: 1
    datasources:
      - name: Loki
        type: loki
        uid: loki
        access: proxy
        url: http://loki-service:3100
        isDefault: true
        editable: false
```

`uid: loki` is set explicitly (not left to Grafana's auto-generated one) so the dashboard JSON in Step 2 can reference it reliably.

- [ ] **Step 2: Create the dashboard provisioning ConfigMap**

Create `k8s/base/logging/grafana-dashboard-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-provider
data:
  provider.yaml: |
    apiVersion: 1
    providers:
      - name: default
        folder: ''
        type: file
        options:
          path: /etc/grafana/provisioning/dashboards-json
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-logs
data:
  logs-by-service.json: |
    {
      "title": "Logs by service",
      "uid": "devpulse-logs",
      "schemaVersion": 39,
      "version": 1,
      "timezone": "browser",
      "time": { "from": "now-6h", "to": "now" },
      "panels": [
        {
          "type": "logs",
          "title": "All pod logs",
          "gridPos": { "h": 20, "w": 24, "x": 0, "y": 0 },
          "datasource": { "type": "loki", "uid": "loki" },
          "targets": [
            { "expr": "{app=~\".+\"}", "refId": "A" }
          ]
        }
      ]
    }
```

Two ConfigMaps in one file (the `---` separator): one is the *provider* config (tells Grafana "load dashboard JSON files from this directory"), the other holds the actual dashboard JSON that gets mounted into that directory — Grafana's file-based dashboard provisioning always needs both pieces.

- [ ] **Step 3: Create the Secret template**

Create `k8s/base/logging/grafana-secret.example.yaml`:

```yaml
# Template only — do NOT commit the real secret. Create it directly in the
# cluster instead, e.g.:
#   kubectl create secret generic grafana-secret \
#     --from-literal=GF_SECURITY_ADMIN_PASSWORD='<strong-password>'
apiVersion: v1
kind: Secret
metadata:
  name: grafana-secret
type: Opaque
stringData:
  GF_SECURITY_ADMIN_PASSWORD: '<password>'
```

- [ ] **Step 4: Create the Deployment**

Create `k8s/base/logging/grafana-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
        - name: grafana
          image: grafana/grafana:11.0.0
          ports:
            - containerPort: 3000
          env:
            # Required together whenever Grafana is served under a sub-path
            # instead of at the Ingress host's root — without both, Grafana's
            # own static assets/redirects break under /grafana.
            - name: GF_SERVER_ROOT_URL
              value: https://pulsedev.duckdns.org/grafana/
            - name: GF_SERVER_SERVE_FROM_SUB_PATH
              value: "true"
            - name: GF_SECURITY_ADMIN_USER
              value: admin
            - name: GF_SECURITY_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: grafana-secret
                  key: GF_SECURITY_ADMIN_PASSWORD
          volumeMounts:
            - name: datasources
              mountPath: /etc/grafana/provisioning/datasources
            - name: dashboard-provider
              mountPath: /etc/grafana/provisioning/dashboards
            - name: dashboard-json
              mountPath: /etc/grafana/provisioning/dashboards-json
          readinessProbe:
            httpGet:
              # Under GF_SERVER_SERVE_FROM_SUB_PATH, Grafana's own routes are
              # mounted under the sub-path too, health check included.
              path: /grafana/api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests:
              cpu: 20m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
      volumes:
        - name: datasources
          configMap:
            name: grafana-datasources
        - name: dashboard-provider
          configMap:
            name: grafana-dashboard-provider
        - name: dashboard-json
          configMap:
            name: grafana-dashboard-logs
```

No PVC: all Grafana state (datasource, dashboard, org settings) is provisioned from the ConfigMaps above, so a fresh pod comes up identically configured — matches the spec's "Error handling" section.

- [ ] **Step 5: Create the Service**

Create `k8s/base/logging/grafana-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: grafana-service
spec:
  selector:
    app: grafana
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 6: Wire into the base kustomization**

Modify `k8s/base/kustomization.yaml` — add after the Loki lines from Task 2 (note: `secret.example.yaml`, `mongo-secret.example.yaml`, and now `grafana-secret.example.yaml` all stay out of `resources:` — they're templates, not applied):

```yaml
  - logging/loki-configmap.yaml
  - logging/loki-statefulset.yaml
  - logging/loki-service.yaml
  - logging/grafana-datasource-configmap.yaml
  - logging/grafana-dashboard-configmap.yaml
  - logging/grafana-deployment.yaml
  - logging/grafana-service.yaml
  - ingress.yaml
```

- [ ] **Step 7: Validate the build**

Run: `kubectl kustomize k8s/base`
Expected: renders successfully, includes `ConfigMap/grafana-datasources`, `ConfigMap/grafana-dashboard-provider`, `ConfigMap/grafana-dashboard-logs`, `Deployment/grafana`, `Service/grafana-service`, no errors. `grafana-secret.example.yaml` does NOT appear in the output (correctly excluded, matching `secret.example.yaml`'s behavior).

- [ ] **Step 8: Commit**

```bash
git add k8s/base/logging/grafana-datasource-configmap.yaml k8s/base/logging/grafana-dashboard-configmap.yaml k8s/base/logging/grafana-deployment.yaml k8s/base/logging/grafana-service.yaml k8s/base/logging/grafana-secret.example.yaml k8s/base/kustomization.yaml
git commit -m "$(cat <<'EOF'
feat: add Grafana with Loki datasource provisioned as code

Datasource and one basic "logs by service" dashboard are provisioned
via ConfigMap, not manual UI setup — Grafana needs no PVC, a fresh pod
comes up identically configured every time. Admin password via Secret
(template committed, real one created on the server, same pattern as
backend-secret/mongo-secret).
EOF
)"
```

---

### Task 4: Ingress — expose Grafana at `/grafana`

**Files:**
- Modify: `k8s/base/ingress.yaml`

**Interfaces:**
- Consumes: `Service/grafana-service:3000` (Task 3).
- Produces: nothing consumed by later tasks (last routing change).

- [ ] **Step 1: Add the `/grafana` path**

Modify `k8s/base/ingress.yaml` — add a new path entry before the catch-all `/` path (for readability; Traefik matches by longest prefix regardless of list order, so this isn't functionally required, but keep specific-before-catch-all for anyone reading the file):

```yaml
          - path: /telegram
            pathType: Prefix
            backend:
              service:
                name: backend-service
                port:
                  number: 3000
          - path: /grafana
            pathType: Prefix
            backend:
              service:
                name: grafana-service
                port:
                  number: 3000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 80
```

(Only the new `/grafana` block is added — every other path stays exactly as-is, including the existing `tls:` block at the bottom of the file, which already covers `pulsedev.duckdns.org` and needs no change since `/grafana` is a path on that same host, not a new host.)

- [ ] **Step 2: Validate the build**

Run: `kubectl kustomize k8s/base`
Expected: renders successfully, `Ingress/devpulse-ingress` now has 6 path rules (`/feed`, `/rss`, `/digest`, `/telegram`, `/grafana`, `/`), no errors.

- [ ] **Step 3: Commit**

```bash
git add k8s/base/ingress.yaml
git commit -m "$(cat <<'EOF'
feat: route /grafana to grafana-service in the ingress

Reuses the existing pulsedev.duckdns.org host and its already-issued
TLS cert — no new DNS subdomain or cert-manager config needed.
EOF
)"
```

---

### Task 5: Local validation, then prod rollout

**Files:** none (validation and manual rollout steps only — fix forward in the relevant task's files if something fails).

**Interfaces:** N/A.

- [ ] **Step 1: Full kustomize build for both overlays**

Run:
```bash
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/prod
```
Expected: both render successfully with all logging objects present (same objects as `k8s/base`, since neither overlay currently patches anything logging-related).

- [ ] **Step 2: Live verification in `kind` (if available on the machine used to execute this task)**

This machine (used to write this plan) has no `kind`/`minikube` installed — same gap this repo's own `docs/kubernetes-migration.md` §10 already notes for its existing manifests ("Не хватает: живого прогона в kind/minikube"). If the executing environment has `kind` available:

```bash
kind create cluster
kubectl apply -k k8s/overlays/dev
kubectl get pods -w
```

Expected: `promtail-*` (DaemonSet, 1 pod on a single-node kind cluster), `loki-0` (StatefulSet), `grafana-*` (Deployment) all reach `Running`/`1/1` within ~60s. `kubectl logs -l app=promtail` shows no scrape/push errors. Tear down after: `kind delete cluster`.

If `kind` is not available, skip straight to Step 3 (prod) — this matches how the existing manifests in this repo were first verified directly on the real server.

- [ ] **Step 3: Roll out to prod**

On the prod server (or via this repo's existing deploy workflow — see `README.md`'s "Deploying" section):

```bash
kubectl create secret generic grafana-secret \
  --from-literal=GF_SECURITY_ADMIN_PASSWORD='<a real strong password, not the placeholder>'
kubectl apply -k k8s/overlays/prod
```

- [ ] **Step 4: Confirm all logging pods are healthy**

```bash
kubectl get pods -l 'app in (promtail,loki,grafana)'
```
Expected: `promtail-*` `1/1 Running`, `loki-0` `1/1 Running`, `grafana-*` `1/1 Running`. No `CrashLoopBackOff`.

- [ ] **Step 5: Confirm Promtail is shipping logs successfully**

```bash
kubectl logs -l app=promtail --tail=50
```
Expected: no repeated `connection refused` / `context deadline exceeded` errors when pushing to `loki-service:3100`.

- [ ] **Step 6: Confirm logs are queryable in Grafana**

Open `https://pulsedev.duckdns.org/grafana`, log in as `admin` with the password from Step 3, open Explore, select the **Loki** datasource, run:

```
{app="backend"}
```

Expected: live backend log lines appear (matching what `kubectl logs` on a backend pod shows).

- [ ] **Step 7: Confirm Promtail follows pod churn automatically**

```bash
kubectl delete pod -l app=backend
```

Wait for the replacement pod to become `Running`, then re-run the Explore query from Step 6.
Expected: logs from the new pod appear with no manifest change and no Promtail restart needed — this is the point of `kubernetes_sd_configs` auto-discovery from Task 1.

- [ ] **Step 8: Confirm retention config matches the spec**

```bash
kubectl exec -it loki-0 -- cat /etc/loki/loki.yaml | grep retention_period
```
Expected: `retention_period: 168h` (7 days) — a config review, not a week-long live wait, matching the spec's testing section.

No commit for this task unless a fix was needed — in that case, amend the fix into the task it belongs to (Task 1-4), re-run that task's `kubectl kustomize k8s/base` check, commit there, then re-run this task's steps.
