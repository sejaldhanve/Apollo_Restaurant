# Security Principles & Data Isolation Architecture

## 1. Zero Trust Security Model

No component or network zone in Apollo Restaurant OS is intrinsically trusted. Every inter-service and client-service interaction requires explicit authentication and authorization.

## 2. Multi-Tenant Data Isolation

- **Tenant Context Resolution**: The backend resolves `organizationId` and `locationId` strictly from cryptographically verified claims inside the JWT authentication token.
- **No Client Trust**: Identifiers passed in request payloads or URL parameters are cross-checked against the authenticated token context.
- **Row-Level Security (RLS)**: PostgreSQL queries strictly filter by `organization_id` on all multi-tenant tables.

## 3. Principle of Least Privilege for AI Agents

- **Tool Sandbox**: Agents do not have arbitrary shell or SQL execution rights. They interact strictly through documented, audited tool contracts.
- **Read-Only vs. Mutating Tools**: Separate tool categories for read operations vs. state-changing operations.
- **Human Approval Checkpoints (HITL)**: Sensitive actions (e.g. employee schedule publication, large inventory PO authorizations, financial refunds above \$50) require explicit human manager sign-off via LangGraph interrupt edges.
- **Payment Gateway Isolation**: Payment card processing (PCI-DSS scope) is strictly segregated into dedicated, tokenized iframe components; AI agents NEVER read, process, or transmit raw credit card numbers.

## 4. Secure Desktop Defaults (Electron)

- `nodeIntegration: false` in all renderer processes.
- `contextIsolation: true` to prevent DOM script injection attacks.
- Strict Content Security Policy (CSP) blocking unauthorized external script evaluation.
- Local SQLite database encrypted at rest via SQLCipher using device-bound hardware keys.
