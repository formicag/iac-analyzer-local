# Side-by-Side: CDK Security Pillar (web-app-cdk.ts)

**File:** `web-app-cdk.ts` (three-tier web app with ECS Fargate, RDS, ALB, S3)
**Pillar:** Security (11 questions, 63 best practices)

## Summary

|  | Claude Sonnet 4.6 (AWS) | Gemma 4 (Local) |
|---|---|---|
| **Applied** | 5 | 10 |
| **Not Applied** | 43 | 31 |
| **Not Relevant** | 14 | 21 |
| **Agreement** | — | **80%** |
| **Speed** | ~10 min | ~33 min |

## Full Results (62 matched best practices)

| Best Practice | Claude | Gemma 4 | Match |
|---|---|---|---|
| Analyze public and cross account access | Not Applied | Not Applied | YES |
| Apply data protection controls based on data sensitivity | Not Applied | Not Applied | YES |
| Audit and rotate credentials periodically | Not Applied | Not Applied | YES |
| Authenticate network communications | Not Applied | Not Applied | YES |
| Automate compute protection | Not Applied | **Applied** | NO |
| Automate data at rest protection | Not Applied | **Applied** | NO |
| Automate deployment of standard security controls | Not Applied | **Applied** | NO |
| Automate identification and classification | Not Applied | Not Applied | YES |
| Automate network protection | Not Applied | Not Applied | YES |
| Automate testing throughout the dev/release lifecycle | Not Applied | **N/R** | NO |
| Build a program that embeds security ownership | N/R | N/R | YES |
| Capture logs, findings, and metrics in standardized locations | Not Applied | Not Applied | YES |
| Centralize services for packages and dependencies | Not Applied | Not Applied | YES |
| Configure service and application logging | Not Applied | Not Applied | YES |
| Control traffic within your network layers | Not Applied | **Applied** | NO |
| Correlate and enrich security events | Not Applied | Not Applied | YES |
| Create network layers | Applied | Applied | YES |
| Define access requirements | Not Applied | **N/R** | NO |
| Define permission guardrails for your organization | Not Applied | **N/R** | NO |
| Define scalable data lifecycle management | Not Applied | Not Applied | YES |
| Deploy software programmatically | Applied | Applied | YES |
| Develop and test security incident response playbooks | N/R | N/R | YES |
| Develop incident management plans | N/R | N/R | YES |
| Employ user groups and attributes | Not Applied | Not Applied | YES |
| Enforce access control | Not Applied | **Applied** | NO |
| Enforce encryption at rest | Applied | Applied | YES |
| Enforce encryption in transit | Not Applied | Not Applied | YES |
| Establish a framework for learning from incidents | N/R | N/R | YES |
| Establish emergency access process | N/R | N/R | YES |
| Evaluate and implement new security services | N/R | N/R | YES |
| Grant least privilege access | Not Applied | Not Applied | YES |
| Identify and prioritize risks using a threat model | N/R | N/R | YES |
| Identify and validate control objectives | Not Applied | **N/R** | NO |
| Identify key personnel and external resources | N/R | N/R | YES |
| Implement inspection-based protection | Not Applied | Not Applied | YES |
| Implement secure key and certificate management | Not Applied | Not Applied | YES |
| Implement secure key management | Not Applied | Not Applied | YES |
| Initiate remediation for non-compliant resources | Not Applied | Not Applied | YES |
| Manage access based on lifecycle | N/R | N/R | YES |
| Perform regular penetration testing | N/R | N/R | YES |
| Perform vulnerability management | Not Applied | Not Applied | YES |
| Pre-deploy tools | Not Applied | Not Applied | YES |
| Pre-provision access | Not Applied | Not Applied | YES |
| Prepare forensic capabilities | Not Applied | Not Applied | YES |
| Provision compute from hardened images | Not Applied | Not Applied | YES |
| Reduce manual management and interactive access | Applied | Applied | YES |
| Reduce permissions continuously | Not Applied | **N/R** | NO |
| Reduce security management scope | Applied | Applied | YES |
| Regularly assess security properties of the pipelines | Not Applied | **N/R** | NO |
| Rely on a centralized identity provider | Not Applied | Not Applied | YES |
| Run simulations | N/R | N/R | YES |
| Secure account root user and properties | Not Applied | **N/R** | NO |
| Separate workloads using accounts | Not Applied | Not Applied | YES |
| Share resources securely with a third party | Not Applied | Not Applied | YES |
| Share resources securely within your organization | Not Applied | Not Applied | YES |
| Stay up to date with security threats and recommendations | N/R | N/R | YES |
| Store and use secrets securely | Not Applied | Not Applied | YES |
| Train for application security | N/R | N/R | YES |
| Understand your data classification scheme | N/R | N/R | YES |
| Use strong sign-in mechanisms | Not Applied | Not Applied | YES |
| Use temporary credentials | Not Applied | Not Applied | YES |
| Validate software integrity | Not Applied | Not Applied | YES |

## Disagreement Analysis

**Gemma 4 more generous (5 cases):** Credits CDK constructs (encryption, access control, VPC layering) as meeting best practices. Reasonable — CDK does automate these controls.

**Gemma 4 stricter on relevance (7 cases):** Marks org-level practices (account root, permission guardrails, code reviews) as "Not Relevant" since they can't be assessed from the code. Also reasonable.

**Key: Both models agree on all critical security findings** — hardcoded credentials, missing WAF, no HTTPS listener, no logging, no IAM policies. The disagreements are edge cases on partial implementations.
