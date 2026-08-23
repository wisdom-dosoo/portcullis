{{/*
Expand the name of the chart.
*/}}
{{- define "portcullis.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "portcullis.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "portcullis.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "portcullis.labels" -}}
helm.sh/chart: {{ include "portcullis.chart" . }}
{{ include "portcullis.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "portcullis.selectorLabels" -}}
app.kubernetes.io/name: {{ include "portcullis.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "portcullis.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "portcullis.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL fullname helper
*/}}
{{- define "portcullis.postgresql.fullname" -}}
{{- printf "%s-%s" .Release.Name "postgresql" }}
{{- end }}

{{/*
Redis fullname helper
*/}}
{{- define "portcullis.redis.fullname" -}}
{{- printf "%s-%s" .Release.Name "redis" }}
{{- end }}