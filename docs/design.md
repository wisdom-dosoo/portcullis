# Portcullis UI/UX Product Specification

## 1. Product UI concept

Portcullis should feel like a secure developer control plane for managing MCP servers, tools, access policies, traffic, audit events, and system reliability.

The interface should communicate:

* Security
* Infrastructure control
* Technical precision
* Reliability
* Visibility
* Developer trust

The UI should be divided into two main experiences:

1. **Administrator Control Plane**
2. **Developer/User Workspace**

The administrator controls the entire platform, including organizations, servers, policies, security, billing, and platform health.

The developer or user interacts with approved MCP servers, creates API keys, monitors usage, tests tools, views logs, and manages personal or team integrations.

---

# 2. User roles

## Platform Super Admin

Responsible for the entire hosted Portcullis platform.

Permissions include:

* View all organizations
* Suspend organizations
* View platform-wide usage
* Manage plans and limits
* Review security incidents
* Configure system settings
* Manage infrastructure integrations
* View global audit logs

## Organization Owner

Responsible for one company or workspace.

Permissions include:

* Manage organization settings
* Invite and remove members
* Configure billing
* Register MCP servers
* Create policies
* Manage API keys
* View all organization logs
* Configure alerts

## Organization Admin

Responsible for technical administration within an organization.

Permissions include:

* Register and manage MCP servers
* Manage tools
* Create policies
* Manage users and roles
* View usage and audit logs
* Configure webhooks and integrations

## Developer

Uses MCP servers and tools.

Permissions include:

* View approved servers
* Discover approved tools
* Create personal API keys
* Test tool invocations
* View personal usage
* View permitted logs
* Access documentation

## Security Auditor

Read-only security role.

Permissions include:

* View policies
* View audit logs
* View authentication events
* View blocked requests
* Export compliance reports
* Cannot change configuration

## Billing Manager

Responsible only for subscriptions and usage.

Permissions include:

* View billing
* Download invoices
* View usage
* Upgrade or downgrade plans
* Manage payment details

---

# 3. Main navigation structure

## Administrator navigation

```text
Overview
Organizations
Users
MCP Servers
Tool Registry
Policies
Traffic
Audit Logs
Security
Infrastructure
Billing
System Settings
```

## Organization administrator navigation

```text
Dashboard
MCP Servers
Tools
Playground
Policies
API Keys
Team
Traffic
Observability
Audit Logs
Alerts
Integrations
Billing
Settings
```

## Developer/user navigation

```text
Home
Available Servers
Tool Explorer
Playground
My API Keys
My Usage
Request Logs
Documentation
Profile
```

---

# 4. Global UI layout

## Desktop layout

The primary desktop layout should contain:

* Collapsible left sidebar
* Top navigation bar
* Main content area
* Optional right-side contextual panel
* Command palette
* Notification center

### Left sidebar

The sidebar should show:

* Portcullis logo
* Current organization selector
* Navigation links
* Environment selector
* User profile menu
* Collapse control

### Top navigation bar

The top bar should include:

* Page title
* Breadcrumbs
* Global search
* Environment badge
* System status indicator
* Notifications
* Help menu
* User avatar

### Context panel

The right-side panel can display:

* Activity details
* Tool documentation
* Policy explanation
* Request trace information
* Configuration help
* Validation errors

---

# 5. Visual design system

## Color palette

Portcullis should use a dark-first infrastructure interface.

### Core colors

* Background: `#0C1116`
* Surface: `#151B22`
* Elevated surface: `#1B232C`
* Border: `#26303A`
* Primary green: `#2DD4A7`
* Secondary cyan: `#48B8E8`
* Warning amber: `#F4B942`
* Critical red: `#F05D5E`
* Success green: `#35C88A`
* Muted text: `#8B98A7`
* Main text: `#F1F5F9`

## Security state colors

* Allowed: Green
* Blocked: Red
* Warning: Amber
* Pending: Blue
* Disabled: Gray
* Degraded: Orange
* Healthy: Green

## Typography

Recommended:

* UI text: Inter
* Headings: Inter or Manrope
* Code and identifiers: JetBrains Mono

## Signature visual motif

Use the Portcullis grille motif as:

* Loading animation
* Access state indicator
* Security status icon
* Navigation highlight
* Empty-state illustration
* Logo symbol

Avoid medieval illustrations, castles, shields, knights, or fantasy imagery.

---

# 6. Authentication pages

## 6.1 Sign-in page

### Purpose

Allow users to securely access Portcullis.

### Required features

* Email and password login
* GitHub OAuth
* Google OAuth
* Microsoft OAuth
* Enterprise SSO button
* Remember device option
* Forgot password link
* MFA challenge
* Terms and privacy links
* Service status indicator

### Design elements

* Split-screen layout
* Login form on the left
* Abstract Portcullis grille visualization on the right
* Security statement
* Supported authentication providers

### States

* Invalid credentials
* Account suspended
* MFA required
* SSO required
* Session expired
* Too many attempts
* Service unavailable

---

## 6.2 Registration page

### Required features

* Full name
* Work email
* Password
* Organization name
* Intended use
* Terms acceptance
* Email verification

### Additional options

* Join an existing organization
* Create a new organization
* Accept invitation
* Continue with GitHub

---

## 6.3 MFA setup page

### Required features

* QR code
* Manual setup key
* Verification field
* Recovery codes
* Download recovery codes
* Confirmation state

---

## 6.4 Password recovery page

### Required features

* Email input
* Reset link confirmation
* New password
* Password strength rules
* Session revocation option

---

# 7. Onboarding experience

## 7.1 Welcome page

### Purpose

Explain the product and guide users toward their first successful MCP request.

### Required sections

* Welcome message
* Short explanation of Portcullis
* Current onboarding progress
* Role selection
* Documentation link
* Skip onboarding option

### Onboarding checklist

```text
Create organization
Register MCP server
Discover tools
Create access policy
Generate API key
Send first request
View trace
Invite teammate
```

---

## 7.2 Organization setup page

### Required features

* Organization name
* Organization slug
* Company size
* Region
* Data residency preference
* Default environment
* Team invitation fields

---

## 7.3 Register first MCP server

### Required features

* Server name
* Server URL
* Transport type
* Authentication method
* Environment
* Health-check path
* Timeout configuration
* Description
* Tags
* Test connection button

### Transport options

* HTTP
* Server-Sent Events
* WebSocket
* STDIO bridge
* Custom adapter

### Authentication options

* No authentication
* API key
* Bearer token
* OAuth 2.0
* Basic authentication
* Custom headers

### Test result panel

Display:

* Connection status
* Response time
* Protocol compatibility
* Available tools
* Authentication status
* TLS status
* Warnings
* Errors

---

## 7.4 First policy wizard

### Required features

* Select server
* Select tools
* Select users or roles
* Set access action
* Add conditions
* Add rate limit
* Add environment restrictions
* Review generated policy
* Test policy
* Activate policy

---

# 8. Administrator control-plane pages

## 8.1 Platform overview dashboard

### Purpose

Give platform administrators a complete overview of the Portcullis service.

### Top summary cards

* Total organizations
* Active users
* Registered MCP servers
* Tool invocations today
* Blocked requests
* Platform error rate
* Monthly recurring revenue
* Current system status

### Main charts

* Requests over time
* Successful versus blocked traffic
* Server health distribution
* Organization growth
* Token or compute usage
* API latency percentiles
* Error rate by service
* Subscription distribution

### Activity panels

* Recent organizations
* New server registrations
* Security incidents
* Failed deployments
* System alerts
* Recent admin actions

### Quick actions

* Create organization
* Suspend account
* View incidents
* Configure limits
* Open infrastructure status

---

## 8.2 Organizations page

### Purpose

Manage all customer organizations.

### Table columns

* Organization
* Plan
* Members
* MCP servers
* Monthly requests
* Status
* Created date
* Last activity
* Actions

### Filters

* Plan
* Status
* Region
* Usage tier
* Created date
* Risk level

### Organization detail drawer

* Organization profile
* Owner
* Plan
* Billing status
* Usage
* Server count
* Security status
* Recent activity
* Support history

### Actions

* Open organization
* Suspend
* Reactivate
* Change plan
* Adjust limits
* Impersonate for support
* Export data
* Delete organization

Impersonation must require:

* Reason
* Approval or elevated permission
* Visible session banner
* Full audit trail

---

## 8.3 Platform users page

### Required features

* Global user search
* Role filtering
* Organization filtering
* Login status
* MFA status
* Last login
* Suspended status
* Risk score
* Session count

### User detail page

Display:

* Identity
* Organizations
* Roles
* Active sessions
* Authentication history
* API keys
* Security events
* Audit activity

### Actions

* Revoke sessions
* Reset MFA
* Suspend user
* Force password reset
* Remove from organization
* View audit trail

---

## 8.4 Global MCP servers page

### Required features

* Search all servers
* Health status
* Organization
* Region
* Environment
* Transport
* Tool count
* Error rate
* Last request
* Version
* Status

### Bulk actions

* Disable
* Run health check
* Change limits
* Export
* Assign risk classification

### Server detail tabs

* Overview
* Tools
* Traffic
* Logs
* Security
* Configuration
* Versions
* Incidents

---

## 8.5 Global tool registry

### Purpose

Provide platform-wide visibility into all exposed tools.

### Table columns

* Tool name
* Server
* Organization
* Description
* Risk level
* Invocations
* Error rate
* Last used
* Status

### Risk classifications

* Read-only
* Data mutation
* Financial action
* External communication
* Administrative
* Destructive
* Sensitive data access

### Features

* Duplicate tool detection
* Unsafe naming detection
* Schema validation
* Missing descriptions
* Tool risk review
* Tool deprecation
* Global disable switch

---

## 8.6 Global policy management

### Required features

* View all policies
* Organization filters
* Status
* Policy conflicts
* Invalid policies
* Recently changed policies
* High-risk permissions
* Policy coverage

### Policy analysis panels

* Users with broad access
* Tools without policies
* Deny rules triggered
* Policies bypassed
* Conflicting conditions
* Expired temporary policies

---

## 8.7 Platform traffic page

### Required features

* Requests per minute
* Requests by organization
* Requests by tool
* Status codes
* Latency percentiles
* Upstream errors
* Rate-limited requests
* Cached responses
* Geographic traffic distribution

### Controls

* Live mode
* Time range
* Environment
* Organization
* Server
* Tool
* Result type
* Response time threshold

---

## 8.8 Platform audit logs

### Required features

* Immutable event list
* Search by actor
* Search by action
* Organization filter
* Date filter
* IP address
* Target resource
* Outcome
* Risk level

### Event examples

* User invited
* API key created
* Policy changed
* Server disabled
* Request blocked
* Organization suspended
* Admin impersonation started
* Billing plan changed
* Secret rotated

### Export options

* CSV
* JSON
* SIEM webhook
* Compliance report

---

## 8.9 Security operations page

### Summary cards

* Open incidents
* Failed login attempts
* Blocked tool calls
* Compromised API keys
* Policy violations
* Suspicious IP addresses
* High-risk organizations

### Security panels

* Threat activity timeline
* Authentication anomalies
* API key abuse
* Unexpected tool usage
* Privilege escalation attempts
* Traffic spikes
* Geographic anomalies
* Data exfiltration indicators

### Actions

* Block IP
* Revoke key
* Suspend user
* Disable server
* Quarantine organization
* Start incident
* Export evidence

---

## 8.10 Infrastructure page

### Required sections

* Gateway instances
* Database status
* Redis status
* Queue health
* Worker status
* Deployment versions
* Regional availability
* Error rates
* Resource utilization

### Instance table

* Instance ID
* Region
* Version
* CPU
* Memory
* Requests
* Error rate
* Uptime
* Status

### Deployment controls

* View deployments
* Roll back
* Restart instance
* Scale workers
* Toggle maintenance mode
* View migration status

---

## 8.11 Platform billing page

### Required features

* Revenue summary
* Monthly recurring revenue
* Active subscriptions
* Failed payments
* Trial accounts
* Plan distribution
* Usage overages
* Refund history

### Plan configuration

* Monthly request limit
* Server limit
* User limit
* Audit retention
* SSO availability
* Support level
* Data residency
* Custom pricing

---

## 8.12 System settings page

### Sections

* General
* Authentication
* Email
* Security
* Rate limits
* Data retention
* Feature flags
* Regions
* Maintenance
* Webhooks
* Legal
* Branding

### Important controls

* Default session duration
* MFA requirements
* Password policy
* Global request size
* Default timeout
* Maximum retries
* Audit retention
* Registration availability
* Allowed OAuth providers

---

# 9. Organization administrator pages

## 9.1 Organization dashboard

### Purpose

Provide a complete operational view for one organization.

### Summary cards

* Active servers
* Available tools
* Requests today
* Success rate
* Blocked requests
* Active users
* API keys
* Monthly usage

### Charts

* Requests over time
* Latency
* Error rate
* Top tools
* Top users
* Rate-limit activity
* Server availability

### Secondary panels

* Recent policy changes
* Unhealthy servers
* Security alerts
* Recent team activity
* Usage versus plan
* Quick-start checklist

### Quick actions

* Add server
* Create API key
* Add policy
* Invite user
* Test tool
* View logs

---

## 9.2 MCP servers list page

### Table columns

* Server name
* Environment
* Health
* Transport
* Tools
* Requests
* Error rate
* Last check
* Owner
* Actions

### View modes

* Table view
* Card view
* Dependency map

### Filters

* Environment
* Health
* Transport
* Owner
* Tag
* Status
* Region

### Actions

* Add server
* Clone configuration
* Disable
* Run health check
* Export configuration
* Delete

---

## 9.3 Add MCP server page

### Form sections

#### Basic information

* Name
* Description
* Environment
* Owner
* Tags

#### Connection

* Base URL
* Transport
* Protocol version
* Region
* Timeout
* Retry count

#### Authentication

* Authentication type
* Secret reference
* Token header
* OAuth configuration
* Certificate

#### Health

* Health-check interval
* Health endpoint
* Failure threshold
* Recovery threshold

#### Security

* Allowed IP ranges
* TLS validation
* Request size limit
* Response size limit
* Sensitive data handling

### Required interaction

A persistent connection-test panel should update as configuration changes.

---

## 9.4 MCP server detail page

### Header

Display:

* Server name
* Status
* Environment
* Version
* Owner
* Last health check
* Actions menu

### Tabs

#### Overview

* Health summary
* Requests
* Error rate
* Latency
* Tool count
* Recent events
* Connection details

#### Tools

* Tool list
* Tool descriptions
* Input schema
* Risk classification
* Status
* Invocation count

#### Playground

* Interactive tool tester
* Input form generated from schema
* Raw JSON editor
* Authentication context
* Response viewer
* Trace timeline

#### Traffic

* Request charts
* Status distribution
* Latency
* Traffic by tool
* Rate limits

#### Logs

* Searchable request logs
* Structured events
* Error logs
* Download logs

#### Security

* Authentication settings
* Allowed networks
* Policy coverage
* Risk classification
* Security findings

#### Configuration

* Connection settings
* Timeouts
* Retries
* Headers
* Secret references
* Health checks

#### Versions

* Configuration history
* Version differences
* Rollback
* Change author

---

# 10. Tool registry pages

## 10.1 Tool explorer

### Required features

* Search
* Filter by server
* Filter by environment
* Filter by category
* Filter by risk level
* Filter by access status
* Grid and table views

### Tool cards

Each card should show:

* Tool name
* Short description
* Server
* Risk level
* Access status
* Invocation count
* Last used
* Version

### Tool detail panel

* Description
* Input schema
* Output schema
* Examples
* Permissions
* Policies
* Usage
* Errors
* Changelog

---

## 10.2 Tool detail page

### Header

* Tool name
* Server
* Risk label
* Status
* Version
* Test button
* Disable button

### Sections

#### Documentation

* Description
* Use cases
* Input parameters
* Output structure
* Example calls
* Limitations

#### Schema

* Visual schema viewer
* JSON Schema
* Required fields
* Validation rules

#### Access

* Allowed users
* Allowed roles
* Active policies
* Temporary access
* Denied subjects

#### Usage

* Requests
* Success rate
* Latency
* Top consumers
* Cost
* Error trends

#### Security

* Risk classification
* Sensitive fields
* Data access
* Destructive capability
* Human approval requirement

---

# 11. Playground

## Purpose

Allow developers and administrators to test MCP tools safely.

## Layout

Use a three-column design:

### Left panel

* Server selector
* Tool selector
* Environment
* Authentication identity
* Policy simulation mode

### Center panel

* Generated input form
* JSON editor
* Headers
* Timeout
* Idempotency key
* Execute button

### Right panel

* Response
* Status
* Duration
* Trace ID
* Policy decision
* Upstream details
* Token or cost usage

## Required features

* Schema-generated forms
* Raw JSON mode
* Save example
* Copy cURL
* Copy Python
* Copy TypeScript
* Replay request
* Compare responses
* Simulate identity
* Test policy before activation
* Redact sensitive values
* Share test session internally

## Safety requirements

Destructive tools should display:

* Warning banner
* Environment badge
* Confirmation modal
* Required typed confirmation
* Optional approval request
* Audit notice

---

# 12. Policy management pages

## 12.1 Policy list page

### Table columns

* Policy name
* Effect
* Subjects
* Tools
* Conditions
* Priority
* Status
* Last updated
* Author

### Filters

* Allow or deny
* Role
* Tool
* Server
* Environment
* Status
* Expiration
* Risk level

### Policy health summary

* Active policies
* Disabled policies
* Conflicts
* Unprotected tools
* Expired policies
* Overly broad policies

---

## 12.2 Policy builder

### Recommended UI

Use a visual rule builder combined with an advanced code editor.

### Step 1: Name and purpose

* Policy name
* Description
* Owner
* Environment
* Tags

### Step 2: Subjects

Choose:

* User
* Team
* Role
* Service account
* API key
* Organization

### Step 3: Resources

Choose:

* Server
* Tool
* Tool category
* Tool tag
* All tools

### Step 4: Action

* Allow
* Deny
* Require approval
* Log only

### Step 5: Conditions

Conditions may include:

* Time window
* IP range
* Environment
* Request rate
* Data sensitivity
* User role
* Tool risk
* Geographic region
* Request payload field
* Maximum cost
* Maximum duration

### Step 6: Controls

* Rate limit
* Quota
* Human approval
* Response redaction
* Request transformation
* Logging level

### Step 7: Test

* Choose sample identity
* Choose tool
* Provide request
* View decision
* Explain why allowed or denied

### Step 8: Review and publish

* Policy summary
* Affected users
* Affected tools
* Conflict warnings
* Security warnings
* Publish date
* Expiration date

---

## 12.3 Policy detail page

### Tabs

* Overview
* Rules
* Coverage
* Test
* Activity
* Versions

### Important feature

Provide a human-readable explanation:

> Developers in the Backend team may invoke read-only GitHub tools in development and staging environments between 06:00 and 22:00 UTC, limited to 100 requests per hour.

---

# 13. API key management

## 13.1 API keys page

### Table columns

* Key name
* Prefix
* Owner
* Scope
* Environment
* Created
* Last used
* Expiration
* Status

### Actions

* Create
* Rotate
* Revoke
* Disable
* Copy key ID
* View usage

### Security requirements

* Show secret once
* Require MFA for creation
* Require reason for high-privilege keys
* Warn about broad scopes
* Allow expiration
* Allow IP restrictions
* Allow tool restrictions

---

## 13.2 Create API key modal

### Required fields

* Key name
* Owner
* Environment
* Expiration
* Allowed servers
* Allowed tools
* Rate limit
* IP ranges
* Description

### Final screen

Display:

* Secret key
* Copy button
* Download `.env` snippet
* cURL example
* Python example
* Warning that the secret will not be shown again

---

# 14. Team management

## 14.1 Team members page

### Table columns

* User
* Email
* Role
* Teams
* MFA status
* Last active
* Invitation status
* Actions

### Features

* Invite user
* Bulk invite
* Change role
* Remove member
* Resend invitation
* Revoke sessions
* View activity
* Assign teams

---

## 14.2 Roles and permissions page

### Required features

* Built-in roles
* Custom roles
* Permission matrix
* Role inheritance
* User assignment
* Policy assignment

### Permission categories

* Servers
* Tools
* Policies
* Logs
* Keys
* Billing
* Members
* Settings
* Security
* Integrations

---

## 14.3 Teams page

### Required features

* Team name
* Description
* Members
* Team lead
* Tool access
* Policies
* API keys
* Recent activity

---

# 15. Traffic and request monitoring

## 15.1 Traffic overview page

### Summary cards

* Total requests
* Success rate
* P95 latency
* Error rate
* Blocked requests
* Rate-limited requests
* Active users
* Data transferred

### Charts

* Request volume
* Latency percentiles
* Error rate
* Traffic by server
* Traffic by tool
* Traffic by user
* Traffic by environment

### Live feed

Show recent requests with:

* Time
* User
* Tool
* Server
* Result
* Duration
* Policy decision

---

## 15.2 Request logs page

### Table columns

* Timestamp
* Request ID
* Identity
* Tool
* Server
* Status
* Policy result
* Duration
* Region

### Filters

* Request ID
* Identity
* Tool
* Server
* Status
* Error type
* Time range
* Environment
* Policy result

### Request detail drawer

Display:

* Request metadata
* Trace timeline
* Authentication
* Policy evaluation
* Upstream request
* Upstream response
* Redacted payload
* Retry attempts
* Error details
* Related audit events

---

# 16. Observability pages

## 16.1 Observability dashboard

### Required metrics

* Request throughput
* P50 latency
* P95 latency
* P99 latency
* Error rate
* Server availability
* Retry rate
* Circuit-breaker state
* Queue depth
* Cache hit rate

### Panels

* Service map
* Trace explorer
* Error groups
* Slow tools
* Unhealthy servers
* Regional performance

---

## 16.2 Trace explorer

### Features

* Trace search
* Trace ID
* Duration
* Tool
* User
* Error status
* Date range
* Minimum duration

### Trace detail

Visual waterfall:

```text
Client request
Authentication
Policy evaluation
Rate limit check
Tool registry lookup
Upstream connection
Tool execution
Response filtering
Audit event
```

Each span should display:

* Start time
* Duration
* Status
* Attributes
* Logs
* Errors

---

## 16.3 Error analysis page

### Required features

* Error grouping
* Frequency
* First seen
* Last seen
* Affected servers
* Affected tools
* Stack trace
* Related deployment
* Resolution status

### Actions

* Assign owner
* Mark resolved
* Create issue
* Mute
* Add alert
* Open trace

---

# 17. Audit logs

## Organization audit page

### Events to track

* User login
* User invitation
* Role change
* API key creation
* API key revocation
* Policy creation
* Policy activation
* Server registration
* Server configuration change
* Tool disable
* Request blocked
* Billing change
* Integration change

### Event detail

Show:

* Actor
* Action
* Resource
* Previous value
* New value
* Timestamp
* IP address
* User agent
* Request ID
* Reason
* Outcome

### Features

* Export
* Saved searches
* Retention filter
* Compliance mode
* Webhook forwarding

---

# 18. Alerts and incident management

## 18.1 Alerts page

### Alert rule types

* High error rate
* Server unavailable
* Latency threshold exceeded
* Request spike
* Policy violation
* API key abuse
* Quota exceeded
* Circuit breaker opened
* Suspicious login
* New high-risk tool

### Notification channels

* Email
* Slack
* Microsoft Teams
* Discord
* Webhook
* PagerDuty
* In-app notification

---

## 18.2 Incident detail page

### Required information

* Incident title
* Severity
* Status
* Start time
* Affected services
* Timeline
* Assigned responders
* Related alerts
* Related traces
* Root cause
* Resolution
* Postmortem link

### Statuses

* Investigating
* Identified
* Monitoring
* Resolved

---

# 19. Integrations page

## Integration categories

### Identity

* Supabase Auth
* Auth0
* Clerk
* Okta
* Microsoft Entra ID

### Observability

* OpenTelemetry
* Grafana
* Datadog
* Sentry
* Prometheus

### Notifications

* Slack
* Discord
* Microsoft Teams
* Email
* PagerDuty

### Infrastructure

* Railway
* Render
* Cloudflare
* Neon
* Redis Cloud
* Upstash

### Developer tools

* GitHub
* GitLab
* Vercel
* Postman

### Integration card

Display:

* Logo
* Name
* Description
* Status
* Last sync
* Configure button
* Disconnect button

---

# 20. Billing and usage

## 20.1 Usage page

### Summary cards

* Requests used
* Request limit
* Active servers
* Server limit
* Team members
* Retention usage
* Data transfer
* Estimated bill

### Charts

* Daily request usage
* Usage by tool
* Usage by server
* Usage by user
* Overage projection

### Features

* Usage alerts
* Budget limit
* Cost allocation tags
* Export usage
* Projected end-of-month usage

---

## 20.2 Subscription page

### Required features

* Current plan
* Included limits
* Billing cycle
* Next invoice
* Payment method
* Invoice history
* Upgrade
* Downgrade
* Cancel subscription

---

# 21. Organization settings

## Settings sections

### General

* Organization name
* Slug
* Logo
* Time zone
* Default environment

### Environments

* Development
* Staging
* Production
* Custom environments

### Security

* MFA requirement
* Session duration
* Allowed email domains
* IP allowlist
* API key rules
* Approval requirements

### Data

* Retention period
* Export
* Data residency
* Delete organization

### Notifications

* Alert preferences
* Weekly reports
* Security summaries
* Usage alerts

### Developer settings

* Default timeout
* Retry policy
* Webhook signing
* API version
* SDK preferences

---

# 22. Developer/user workspace pages

## 22.1 Developer home

### Purpose

Show only information relevant to the signed-in developer.

### Summary cards

* Available servers
* Available tools
* My API keys
* Requests today
* Success rate
* Remaining quota

### Main content

* Recently used tools
* Favorite tools
* Recent requests
* Team announcements
* Documentation shortcuts
* Active incidents

### Quick actions

* Explore tools
* Generate API key
* Test tool
* View documentation

---

## 22.2 Available servers

### Required features

* Search approved servers
* Environment filter
* Status
* Tool count
* Owner
* Description
* Documentation
* Request access

Developers should not see administrative configuration unless permitted.

---

## 22.3 Developer tool explorer

### Required features

* Search tools
* Category filters
* Favorites
* Recently used
* Access status
* Request-access action
* Code examples

### Tool detail

* Description
* Parameters
* Examples
* Permission status
* Limits
* Server
* Support contact
* Try in playground

---

## 22.4 My API keys

### Required features

* Create personal key
* View scopes
* View last used
* Rotate key
* Revoke key
* View request usage
* Copy integration examples

A user must never be allowed to grant themselves permissions beyond their assigned role and policies.

---

## 22.5 My usage

### Display

* Requests today
* Monthly requests
* Error rate
* Top tools
* Rate-limit status
* Quota remaining
* Usage history

### Developer value

Provide actionable explanations:

* Which requests failed
* Why a request was blocked
* Which limit was reached
* How to request more access

---

## 22.6 My request logs

Developers should see only requests they initiated or requests visible to their role.

### Features

* Search
* Retry request
* Copy request
* Open trace
* View policy explanation
* Report problem

---

## 22.7 Documentation hub

### Sections

* Quick start
* Authentication
* MCP connection guide
* API reference
* SDK guides
* Tool catalog
* Policy behavior
* Error codes
* Rate limits
* Webhooks
* Examples
* Troubleshooting

### Interactive features

* Copy code
* Language selector
* Run example
* Environment selector
* Personal API key insertion
* Search documentation

---

# 23. Notification center

## Notification types

* Server unavailable
* Access request approved
* Access request denied
* API key expiring
* Policy changed
* Usage threshold reached
* Security alert
* Invitation received
* Incident resolved
* New tool available

## Notification controls

* Mark as read
* Mark all as read
* Filter
* Open related resource
* Configure notification preferences

---

# 24. Command palette

Portcullis should include a keyboard-driven command palette.

Open with:

```text
Ctrl + K
```

### Supported commands

* Go to server
* Search tool
* Create API key
* Add MCP server
* Open playground
* View request
* Create policy
* Invite user
* Switch organization
* Switch environment
* Open documentation

This will make the platform feel like a professional developer tool.

---

# 25. Search experience

Global search should cover:

* Servers
* Tools
* Users
* Policies
* API keys
* Requests
* Audit events
* Documentation

Search results should be grouped by resource type and support keyboard navigation.

---

# 26. Empty states

Every empty page should explain:

* What the feature does
* Why it matters
* What action the user should take

Example for MCP servers:

> No MCP servers are registered. Connect your first server to discover tools, enforce policies, and monitor tool traffic.

Action:

> Register MCP Server

Avoid blank tables with only “No data.”

---

# 27. Loading states

Use:

* Skeleton tables
* Skeleton charts
* Inline spinners
* Progress steps for long operations
* Portcullis grille animation

Long-running operations should show:

* Current step
* Progress
* Estimated stage
* Cancel option
* Background completion notification

Examples:

* Discovering tools
* Running health check
* Exporting logs
* Generating compliance report

---

# 28. Error states

Errors should explain:

* What failed
* Why it may have failed
* What the user can do
* Whether configuration was saved
* Technical trace ID

Example:

> Portcullis could not connect to the MCP server. The connection timed out after 10 seconds. Verify the server URL, network access, and authentication settings.

Actions:

* Retry
* Edit connection
* View technical details
* Open documentation

---

# 29. Confirmation patterns

Require stronger confirmation for high-risk actions:

* Delete server
* Revoke all keys
* Disable production tool
* Publish broad policy
* Remove organization
* Suspend user
* Roll back configuration
* Delete audit data

Use typed confirmation for destructive actions.

Example:

> Type `disable-production` to continue.

---

# 30. Responsive design

## Desktop

Full sidebar, data tables, multi-column dashboards, trace waterfall.

## Tablet

Collapsible sidebar, reduced chart density, stacked panels.

## Mobile

Portcullis should support monitoring and lightweight management, but not every complex configuration workflow.

Mobile priorities:

* View system status
* Receive alerts
* View requests
* Approve access
* Disable a key
* Disable a server
* View incidents

Complex policy editing and server configuration should redirect users to desktop.

---

# 31. Accessibility requirements

Portcullis should meet WCAG 2.2 AA standards.

Required:

* Keyboard navigation
* Visible focus states
* Screen-reader labels
* Proper heading hierarchy
* Color-independent status indicators
* High contrast
* Reduced-motion mode
* Accessible charts
* Form error summaries
* Large click targets
* Tooltips available through keyboard focus

---

# 32. Recommended screen priority for the MVP

## Phase 1: Essential screens

Build first:

1. Sign in
2. Onboarding
3. Organization dashboard
4. MCP server list
5. Add server
6. Server detail
7. Tool explorer
8. Tool detail
9. Playground
10. Policy list
11. Policy builder
12. API keys
13. Request logs
14. Team management
15. Settings

## Phase 2: Operational screens

Build next:

1. Traffic dashboard
2. Observability
3. Trace explorer
4. Audit logs
5. Alerts
6. Integrations
7. Billing
8. Usage

## Phase 3: Platform administration

Build after the organization product works:

1. Platform overview
2. Organizations
3. Global users
4. Global MCP servers
5. Global security
6. Infrastructure
7. Platform billing
8. System settings

---

# 33. Suggested frontend architecture

```text
apps/dashboard/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   ├── organization/
│   │   ├── developer/
│   │   └── auth/
│   ├── components/
│   │   ├── charts/
│   │   ├── data-table/
│   │   ├── forms/
│   │   ├── policy-builder/
│   │   ├── playground/
│   │   ├── trace-viewer/
│   │   └── ui/
│   ├── features/
│   │   ├── servers/
│   │   ├── tools/
│   │   ├── policies/
│   │   ├── api-keys/
│   │   ├── traffic/
│   │   ├── audit/
│   │   ├── observability/
│   │   ├── team/
│   │   └── billing/
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── utils/
└── tests/
```

---

# 34. Recommended frontend stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* TanStack Query
* TanStack Table
* React Hook Form
* Zod
* Zustand
* Recharts or Apache ECharts
* Monaco Editor
* React Flow
* Framer Motion
* Playwright
* Vitest
* Storybook

## Tool usage

* Monaco Editor for JSON, policy code, and configuration
* React Flow for server and tool dependency maps
* TanStack Table for high-volume data pages
* TanStack Query for server state
* Zustand for UI state
* Zod for form and API validation
* Playwright for end-to-end testing

---

# 35. Final product experience

The Portcullis interface should allow an administrator to complete this workflow:

```text
Register MCP server
→ Validate connection
→ Discover tools
→ Classify tool risk
→ Create access policy
→ Generate API key
→ Test invocation
→ Observe request trace
→ Configure alert
→ Invite developer
```

A developer should complete this workflow:

```text
Join organization
→ View approved tools
→ Generate personal API key
→ Test a tool
→ Copy integration code
→ Send production request
→ View request log
→ Understand policy or error result
```

The UI should never feel like a generic analytics dashboard. Every page should help users answer one of these questions:

* What servers and tools do we have?
* Who can access them?
* What requests are happening?
* Why was something allowed or blocked?
* Is the infrastructure healthy?
* What changed?
* What action should I take next?
