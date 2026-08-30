"use client";

import { useState, useMemo } from "react";
import {
  Puzzle,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Unlink,
  Plus,
  X,
  ExternalLink,
  Info,
  Clock,
  Zap,
} from "lucide-react";

/* ── types ───────────────────────────────────────────────────────────────── */

type IntegrationCategory =
  | "identity"
  | "observability"
  | "notifications"
  | "infrastructure"
  | "developer";

type IntegrationStatus = "connected" | "disconnected" | "error" | "pending";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  lastSync: string | null;
  docsUrl: string;
  configFields: ConfigField[];
  // set when connected
  configValues: Record<string, string>;
}

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  placeholder: string;
  options?: string[];   // for select
  required: boolean;
}

/* ── category config ─────────────────────────────────────────────────────── */

const CATEGORY_CONFIG: Record<
  IntegrationCategory,
  { label: string; color: string; bg: string }
> = {
  identity:       { label: "Identity",        color: "var(--pc-primary)",   bg: "rgba(45,212,167,0.12)" },
  observability:  { label: "Observability",   color: "var(--pc-secondary)", bg: "rgba(72,184,232,0.12)" },
  notifications:  { label: "Notifications",   color: "#9b8cff",             bg: "rgba(155,140,255,0.12)" },
  infrastructure: { label: "Infrastructure",  color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  developer:      { label: "Developer tools", color: "var(--pc-muted)",     bg: "rgba(139,152,167,0.12)" },
};

const STATUS_CONFIG: Record<
  IntegrationStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  connected:    { label: "Connected",    color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)",  icon: <CheckCircle2 size={12} /> },
  disconnected: { label: "Not connected",color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.1)", icon: <XCircle size={12} /> },
  error:        { label: "Error",        color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)",  icon: <AlertTriangle size={12} /> },
  pending:      { label: "Pending",      color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)", icon: <RefreshCw size={12} /> },
};

/* ── SVG logos (inline monochrome, sized 28×28) ──────────────────────────── */

function Logo({ id }: { id: string }) {
  const size = 28;
  const style: React.CSSProperties = { width: size, height: size, flexShrink: 0 };

  const logos: Record<string, React.ReactNode> = {
    supabase: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.01 13.004.726 14.4 1.948 14.4h9.949l.003 8.564c.015.986 1.26 1.41 1.874.637l9.262-11.651c.754-.954.038-2.35-1.184-2.35h-9.949L11.9 1.036z"
          fill="url(#sb-g)" />
        <defs>
          <linearGradient id="sb-g" x1="14.5" y1="3" x2="8" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3ECF8E" />
            <stop offset="1" stopColor="#1C7A4A" />
          </linearGradient>
        </defs>
      </svg>
    ),
    auth0: (
      <svg viewBox="0 0 24 24" style={style} fill="#EB5424">
        <path d="M14.974 3H9.026L6.06 12l2.965 9h5.948l2.966-9L14.974 3zm-2.974 14.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/>
      </svg>
    ),
    clerk: (
      <svg viewBox="0 0 24 24" style={style}>
        <circle cx="12" cy="8" r="4" fill="#6C47FF"/>
        <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="#6C47FF" strokeWidth="2" strokeLinecap="round" fill="none"/>
      </svg>
    ),
    okta: (
      <svg viewBox="0 0 24 24" style={style} fill="#007DC1">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 2a8 8 0 110 16A8 8 0 0112 4z"/>
      </svg>
    ),
    entra: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M12 2L2 8v8l10 6 10-6V8L12 2z" fill="#0078D4"/>
        <path d="M12 2v20M2 8l10 6 10-6" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
      </svg>
    ),
    opentelemetry: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M3 12h5M16 12h5M12 3v5M12 16v5" stroke="#F5A800" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="3" fill="#F5A800"/>
        <path d="M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5" stroke="#425CC7" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    grafana: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <circle cx="12" cy="12" r="10" fill="#F46800"/>
        <path d="M8 14s1-2 4-2 4 2 4 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="9" cy="10" r="1.5" fill="#fff"/>
        <circle cx="15" cy="10" r="1.5" fill="#fff"/>
      </svg>
    ),
    datadog: (
      <svg viewBox="0 0 24 24" style={style} fill="#632CA6">
        <path d="M3 6l5 3-1 3 5-1 2 4 5-2-2-4 2-3-5-2-2 3-4-1z"/>
      </svg>
    ),
    sentry: (
      <svg viewBox="0 0 24 24" style={style} fill="#362D59">
        <path d="M13.868 2.29a2.25 2.25 0 00-3.736 0L2.08 17.5h4.65l4.832-8.37 2.917 5.054c.394-.17.815-.28 1.26-.28h1.09L13.868 2.29zm-1.868 12.71c0 1.243-1.007 2.25-2.25 2.25S7.5 16.243 7.5 15H5.25C5.25 17.485 7.265 19.5 9.75 19.5S14.25 17.485 14.25 15h-2.25zM15.75 15c0 .621-.504 1.125-1.125 1.125A1.125 1.125 0 0113.5 15h-2.25c0 1.864 1.511 3.375 3.375 3.375S18 16.864 18 15h-2.25z"/>
      </svg>
    ),
    prometheus: (
      <svg viewBox="0 0 24 24" style={style} fill="#E6522C">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#E6522C" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="3" fill="#E6522C"/>
        <path d="M12 5v3M12 16v3M5 12h3M16 12h3" stroke="#E6522C" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    slack: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"
          fill="#E01E5A"/>
      </svg>
    ),
    discord: (
      <svg viewBox="0 0 24 24" style={style} fill="#5865F2">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
      </svg>
    ),
    teams: (
      <svg viewBox="0 0 24 24" style={style} fill="#5059C9">
        <path d="M20 3h-7a1 1 0 00-1 1v8a1 1 0 001 1h7a1 1 0 001-1V4a1 1 0 00-1-1z"/>
        <path d="M15 13v3a3 3 0 01-3 3H5a3 3 0 01-3-3V9a3 3 0 013-3h4" fill="#7B83EB"/>
        <circle cx="17.5" cy="2.5" r="2.5" fill="#5059C9"/>
      </svg>
    ),
    email: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--pc-muted)" strokeWidth="1.5"/>
        <path d="M2 8l10 7 10-7" stroke="var(--pc-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    pagerduty: (
      <svg viewBox="0 0 24 24" style={style} fill="#06AC38">
        <path d="M16.5 3H7.5C5.015 3 3 5.015 3 7.5V12h6V7.5c0-.825.675-1.5 1.5-1.5h6c.825 0 1.5.675 1.5 1.5V12H21V7.5C21 5.015 18.985 3 16.5 3zM3 12h6v9H3zm12 0h6v9h-6z"/>
      </svg>
    ),
    railway: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M4 4h16v4H4z" fill="#0B0D0E"/>
        <path d="M4 10h16v4H4z" fill="#761ADA" fillOpacity=".8"/>
        <path d="M4 16h16v4H4z" fill="#761ADA"/>
      </svg>
    ),
    render: (
      <svg viewBox="0 0 24 24" style={style} fill="#46E3B7">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 3a7 7 0 110 14A7 7 0 0112 5zm0 3a4 4 0 100 8 4 4 0 000-8z"/>
      </svg>
    ),
    cloudflare: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M16.5 15.5c.3-1.1-.1-1.9-.8-2.4l-7.7-.1c-.1 0-.2-.1-.2-.2s.1-.2.2-.2l7.8-.2c.9-.5 1.5-1.4 1.7-2.5C18 8.2 16.6 6.5 14.7 6.5c-.3 0-.6 0-.9.1C13.2 5 11.7 4 10 4c-2.7 0-4.8 2.1-4.8 4.7 0 .3 0 .7.1 1C3.9 9.9 3 11 3 12.4c0 1.6 1.3 2.9 3 2.9h10.3c.1 0 .2-.1.2-.2v-.1z" fill="#F6821F"/>
        <path d="M18.5 10.5l.5-.1c.2-.1.3-.3.2-.5l-.3-.8c-.1-.2-.3-.3-.5-.3l-.5.1c-.3-1.6-1.7-2.8-3.3-2.8-.5 0-1 .1-1.4.4-.6-1.3-2-2.2-3.6-2.2-2.2 0-4 1.8-4 4 0 .2 0 .4.1.6-1.3.3-2.3 1.4-2.3 2.8 0 1.6 1.3 2.9 3 2.9h12.1c1.1 0 2-.9 2-2 0-.9-.6-1.7-1.5-1.9z" fill="#FBAD41"/>
      </svg>
    ),
    neon: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#00E599"/>
        <path d="M7 8h10M7 12h10M7 16h6" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    redis: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <ellipse cx="12" cy="7" rx="9" ry="3" fill="#D82C20"/>
        <path d="M3 7v10c0 1.657 4.029 3 9 3s9-1.343 9-3V7" fill="none" stroke="#D82C20" strokeWidth="1.5"/>
        <path d="M3 12c0 1.657 4.029 3 9 3s9-1.343 9-3" stroke="#D82C20" strokeWidth="1.5"/>
      </svg>
    ),
    upstash: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#00CB94"/>
        <path d="M7 12l3-4 4 6 2-3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" style={style} fill="var(--pc-foreground)">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
    gitlab: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" fill="#FC6D26"/>
      </svg>
    ),
    vercel: (
      <svg viewBox="0 0 24 24" style={style} fill="var(--pc-foreground)">
        <path d="M24 22.525H0l12-21.05 12 21.05z"/>
      </svg>
    ),
    postman: (
      <svg viewBox="0 0 24 24" style={style} fill="#FF6C37">
        <path d="M13.527.099C6.955-.744.942 3.9.099 10.473c-.843 6.572 3.8 12.584 10.373 13.428 6.573.843 12.587-3.801 13.428-10.374C24.744 6.955 20.101.943 13.527.099zm2.471 7.485a.855.855 0 01.593.593.854.854 0 01-.593.594.857.857 0 01-.592-.594.857.857 0 01.592-.593zm-4.942 6.871l-2.83-2.83 6.006-6.006 1.414 1.413-4.59 7.423zm-3.536-2.12l2.829 2.829-3.536.707.707-3.536zm9.192-8.486l-6.718 6.718-1.414-1.413 6.718-6.718 1.414 1.413z"/>
      </svg>
    ),
    // identity additions
    cognito: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="#C7511F"/>
        <path d="M12 2v20M3 7l9 5 9-5" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5"/>
        <circle cx="12" cy="12" r="3" fill="#FF9900"/>
      </svg>
    ),
    google_workspace: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    keycloak: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <circle cx="12" cy="12" r="10" fill="#4D4D4D"/>
        <path d="M8 8h3v3H8zm5 0h3v3h-3zM8 13h3v3H8zm5 0h3v3h-3z" fill="#00B8E3"/>
        <path d="M10.5 10.5h3v3h-3z" fill="#fff"/>
      </svg>
    ),
    // observability additions
    newrelic: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M12 2L2 7.5v9L12 22l10-5.5v-9L12 2z" fill="#1CE783"/>
        <path d="M12 6l-6 3.3v5.4L12 18l6-3.3V9.3L12 6z" fill="#1CE783" fillOpacity=".3"/>
        <circle cx="12" cy="12" r="2.5" fill="#fff"/>
      </svg>
    ),
    honeycomb: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M12 2l4 2.25v4.5L12 11 8 8.75V4.25L12 2zM4 8.5l4 2.25v4.5L4 17.5l-2-1.125V7.625L4 8.5zM20 8.5l2 1.125v8.75L20 19.5l-4-2.25v-4.5L20 8.5zM12 13l4 2.25v4.5L12 22l-4-2.25v-4.5L12 13z" fill="#F4A11D"/>
      </svg>
    ),
    dynatrace: (
      <svg viewBox="0 0 24 24" style={style} fill="#1496FF">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 14.5h-9l4.5-9 4.5 9z"/>
      </svg>
    ),
    // notifications additions
    opsgenie: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#172B4D"/>
        <path d="M12 6a4 4 0 014 4c0 2.5-2 5-4 7-2-2-4-4.5-4-7a4 4 0 014-4z" fill="#2684FF"/>
        <circle cx="12" cy="10" r="1.5" fill="#fff"/>
      </svg>
    ),
    telegram: (
      <svg viewBox="0 0 24 24" style={style} fill="#26A5E4">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.5 4.25 12.6c-.645-.204-.657-.645.136-.953l10.57-4.075c.537-.194 1.007.13.938.649z"/>
      </svg>
    ),
    twilio: (
      <svg viewBox="0 0 24 24" style={style} fill="#F22F46">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4a8 8 0 110 16A8 8 0 0112 4zm-2 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm4 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-4 4a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm4 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>
      </svg>
    ),
    // infrastructure additions
    flyio: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#7C3AED"/>
        <path d="M8 9l4-3 4 3v7l-4 2-4-2V9z" fill="none" stroke="#fff" strokeWidth="1.2"/>
        <path d="M12 6v13M8 9l4 3 4-3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    aws: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576a.346.346 0 01.056.184c0 .08-.048.16-.152.24l-.503.335a.383.383 0 01-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 01-.287-.375 6.18 6.18 0 01-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.486-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.030-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 01-.28.104.488.488 0 01-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 01.224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 011.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 00-.735-.136 6.02 6.02 0 00-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.063-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 01-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.29 1.246-5.29c.04-.16.088-.264.151-.312a.549.549 0 01.32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.354 1.381-5.354c.048-.16.104-.264.16-.312a.52.52 0 01.311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 01-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 01-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.224a.563.563 0 01-.048-.224v-.407c0-.167.063-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 00.41-.758.777.777 0 00-.215-.559c-.144-.151-.415-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 01-.39-1.158c0-.335.071-.63.215-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 01.24.2.43.43 0 01.071.263v.375c0 .168-.063.256-.184.256a.83.83 0 01-.303-.096 3.652 3.652 0 00-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.07.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z" fill="#FF9900"/>
      </svg>
    ),
    planetscale: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <circle cx="12" cy="12" r="10" fill="#000"/>
        <path d="M5 5l14 14M5 19L19 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="3" fill="#fff"/>
      </svg>
    ),
    // developer tools additions
    linear: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M3.22 12.16a9.05 9.05 0 007.94 8.54L3.5 12.94a9.1 9.1 0 01-.28-.78zm.08-1.4l9.94 9.94a9.05 9.05 0 01-9.94-9.94zm1.1-2.44l11.28 11.28a9.05 9.05 0 01-2.36 1.04L4.03 10.36a9.05 9.05 0 01.37-2.04zm1.68-2.36l11.96 11.96a9.05 9.05 0 01-1.52 1.34L5.72 7.34c.43-.5.9-.96 1.36-1.38zm2.36-1.68l10.8 10.8a9.05 9.05 0 01-.9 1.7L7.76 5.98c.54-.36 1.1-.68 1.68-.94zm2.96-1.1l8.34 8.34a9.05 9.05 0 01-.48 1.92L10.64 4.42c.6-.2 1.22-.36 1.86-.44zm2.96-.22l5.08 5.08A9.05 9.05 0 0119.7 12a9 9 0 01-.08 1.22l-7.36-7.36a9 9 0 011.9-2.7z" fill="#5E6AD2"/>
      </svg>
    ),
    jira: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M11.975 2.018L2.148 11.845a.501.501 0 000 .707l4.925 4.925a.5.5 0 00.707 0l4.196-4.197 4.196 4.197a.5.5 0 00.707 0l4.925-4.925a.501.501 0 000-.707L11.975 2.018zm0 3.535l3.505 3.504-3.505 3.505-3.504-3.505 3.504-3.504z" fill="#2684FF"/>
        <path d="M11.975 9.057l-3.504 3.504 3.504 3.505 3.505-3.505-3.505-3.504z" fill="url(#jira-g)"/>
        <defs>
          <linearGradient id="jira-g" x1="12" y1="9" x2="12" y2="16" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2684FF"/>
            <stop offset="1" stopColor="#0052CC"/>
          </linearGradient>
        </defs>
      </svg>
    ),
    terraform: (
      <svg viewBox="0 0 24 24" style={style} fill="none">
        <path d="M9.02 4.8L15 8.27v6.95l-5.98-3.46V4.8zM15.98 8.27L22 4.8v6.95l-6.02 3.48V8.27zM2 2l5.98 3.46v6.95L2 8.94V2zM9.02 15.75L15 19.22V22l-5.98-3.46v-2.79z" fill="#7B42BC"/>
      </svg>
    ),
  };

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: "var(--pc-elevated)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1px solid var(--pc-border)",
      }}
    >
      {logos[id] ?? (
        <Puzzle size={20} style={{ color: "var(--pc-muted)" }} />
      )}
    </div>
  );
}

/* ── integration catalogue ───────────────────────────────────────────────── */

const INTEGRATIONS: Integration[] = [];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── configure modal ─────────────────────────────────────────────────────── */

function ConfigureModal({
  integration,
  onSave,
  onClose,
}: {
  integration: Integration;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      integration.configFields.map((f) => [f.key, integration.configValues[f.key] ?? ""]),
    ),
  );
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setTestResult(null);
  }

  async function testConnection() {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setTesting(false);
    setTestResult("ok");
  }

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    color: "var(--pc-foreground)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 520,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 12,
          zIndex: 60,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "sticky",
            top: 0,
            background: "var(--pc-surface)",
            zIndex: 1,
          }}
        >
          <Logo id={integration.id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{integration.name}</div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
              {CATEGORY_CONFIG[integration.category].label}
            </div>
          </div>
          {integration.docsUrl !== "#" && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--pc-secondary)",
                textDecoration: "none",
              }}
            >
              Docs <ExternalLink size={10} />
            </a>
          )}
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", margin: 0 }}>
            {integration.description}
          </p>

          {/* fields */}
          {integration.configFields.map((field) => {
            const isPassword = field.type === "password";
            const revealed = showPasswords[field.key];
            return (
              <div key={field.key}>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--pc-muted)",
                    display: "block",
                    marginBottom: 5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {field.label}
                  {!field.required && (
                    <span style={{ fontWeight: 400, marginLeft: 4 }}>(optional)</span>
                  )}
                </label>

                {field.type === "select" ? (
                  <select
                    value={values[field.key] || field.placeholder}
                    onChange={(e) => set(field.key, e.target.value)}
                    style={inputBase}
                  >
                    {field.options?.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ position: "relative" }}>
                    <input
                      type={isPassword && !revealed ? "password" : "text"}
                      value={values[field.key]}
                      onChange={(e) => set(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      style={{ ...inputBase, paddingRight: isPassword ? 34 : 10 }}
                    />
                    {isPassword && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                        }
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--pc-muted)",
                          padding: 0,
                        }}
                      >
                        {revealed ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* test result */}
          {testResult === "ok" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "rgba(53,200,138,0.1)",
                border: "1px solid rgba(53,200,138,0.3)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--pc-success)",
              }}
            >
              <CheckCircle2 size={13} />
              Connection test successful
            </div>
          )}

          {/* footer */}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", paddingTop: 4 }}>
            <button
              onClick={testConnection}
              disabled={testing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                color: "var(--pc-foreground)",
                fontSize: 12,
                cursor: testing ? "default" : "pointer",
                opacity: testing ? 0.6 : 1,
              }}
            >
              <Zap size={12} />
              {testing ? "Testing…" : "Test connection"}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onSave(values); onClose(); }}
                style={{
                  padding: "8px 18px",
                  background: "var(--pc-primary)",
                  border: "none",
                  borderRadius: 6,
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save & connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── integration card ────────────────────────────────────────────────────── */

function IntegrationCard({
  integration,
  onConfigure,
  onDisconnect,
}: {
  integration: Integration;
  onConfigure: () => void;
  onDisconnect: () => void;
}) {
  const sta = STATUS_CONFIG[integration.status];
  const cat = CATEGORY_CONFIG[integration.category];
  const isConnected = integration.status === "connected";
  const isError = integration.status === "error";

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: `1px solid ${isError ? "rgba(240,93,94,0.35)" : isConnected ? "rgba(53,200,138,0.2)" : "var(--pc-border)"}`,
        borderRadius: 10,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color 0.15s",
      }}
    >
      {/* top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Logo id={integration.id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 3 }}>
            {integration.name}
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--pc-muted)",
              margin: 0,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {integration.description}
          </p>
        </div>
      </div>

      {/* status + last sync */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
            background: sta.bg,
            color: sta.color,
          }}
        >
          {sta.icon}
          {sta.label}
        </span>

        {(isConnected || isError) && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--pc-muted)",
            }}
          >
            <Clock size={10} />
            {relativeTime(integration.lastSync)}
          </span>
        )}
      </div>

      {/* action buttons */}
      <div style={{ display: "flex", gap: 7 }}>
        <button
          onClick={onConfigure}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "7px 0",
            background: isConnected ? "var(--pc-elevated)" : "var(--pc-primary)",
            border: `1px solid ${isConnected ? "var(--pc-border)" : "transparent"}`,
            borderRadius: 6,
            color: isConnected ? "var(--pc-foreground)" : "#000",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Settings size={12} />
          {isConnected || isError ? "Configure" : "Connect"}
        </button>

        {(isConnected || isError) && (
          <button
            onClick={onDisconnect}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: "7px 12px",
              background: "transparent",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Unlink size={12} />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]); // open source: no demo integrations — connect real providers
  const [configuring, setConfiguring] = useState<Integration | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "">("");

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const errorCount = integrations.filter((i) => i.status === "error").length;

  const filtered = useMemo(() => {
    let r = integrations;
    if (activeCategory) r = r.filter((i) => i.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
    }
    return r;
  }, [integrations, activeCategory, search]);

  // group by category (preserving order)
  const categoryOrder: IntegrationCategory[] = [
    "identity", "observability", "notifications", "infrastructure", "developer",
  ];

  const grouped = useMemo(() => {
    const g: Record<IntegrationCategory, Integration[]> = {
      identity: [], observability: [], notifications: [], infrastructure: [], developer: [],
    };
    for (const i of filtered) g[i.category].push(i);
    return g;
  }, [filtered]);

  function handleSave(id: string, values: Record<string, string>) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "connected",
              lastSync: new Date().toISOString(),
              configValues: values,
            }
          : i,
      ),
    );
  }

  function handleDisconnect(id: string) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: "disconnected", lastSync: null, configValues: {} }
          : i,
      ),
    );
  }

  const showAll = !activeCategory && !search;
  const visibleCategories = showAll
    ? categoryOrder
    : categoryOrder.filter((c) => grouped[c].length > 0);

  return (
    <div
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--pc-bg)",
        color: "var(--pc-foreground)",
      }}
    >
      <div className="rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2 mb-4" style={{ background: "rgba(244,185,66,0.10)", borderColor: "rgba(244,185,66,0.35)", color: "#F4B942" }}>
        <span style={{ fontWeight: 600 }}>Demo</span>
        <span style={{ color: "var(--pc-muted)" }}>— integrations are UI-only — connections are not persisted.</span>
      </div>
      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Puzzle size={20} style={{ color: "var(--pc-primary)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Integrations</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Connect identity providers, observability tools, notification channels, and infrastructure.
        </p>
      </div>

      {/* summary strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Connected",    value: connectedCount,              color: "var(--pc-success)",  icon: <CheckCircle2 size={14} /> },
          { label: "Errors",       value: errorCount,                  color: "var(--pc-critical)", icon: <AlertTriangle size={14} /> },
          { label: "Available",    value: integrations.length,         color: "var(--pc-muted)",    icon: <Puzzle size={14} /> },
        ].map(({ label, value, color, icon }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
            }}
          >
            <span style={{ color }}>{icon}</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{value}</span>
            <span style={{ fontSize: 12, color: "var(--pc-muted)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* search + category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--pc-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations…"
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              background: "var(--pc-surface)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveCategory("")}
            style={{
              padding: "7px 14px",
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--pc-border)",
              background: !activeCategory ? "var(--pc-elevated)" : "transparent",
              color: !activeCategory ? "var(--pc-foreground)" : "var(--pc-muted)",
              cursor: "pointer",
            }}
          >
            All
          </button>
          {categoryOrder.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(active ? "" : cat)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 14,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${active ? cfg.color : "var(--pc-border)"}`,
                  background: active ? cfg.bg : "transparent",
                  color: active ? cfg.color : "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* grouped grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--pc-muted)",
            fontSize: 13,
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
          }}
        >
          No integrations match your search
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {visibleCategories.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const cfg = CATEGORY_CONFIG[cat];
            return (
              <div key={cat}>
                {/* category header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      padding: "2px 10px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      background: cfg.bg,
                      color: cfg.color,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>
                    {items.filter((i) => i.status === "connected").length}/{items.length} connected
                  </span>
                </div>

                {/* card grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 12,
                  }}
                >
                  {items.map((integration) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      onConfigure={() => setConfiguring(integration)}
                      onDisconnect={() => handleDisconnect(integration.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* info note */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--pc-muted)",
        }}
      >
        <Info size={12} />
        Integration configuration is stored locally in this preview. In production, credentials are encrypted at rest in the gateway configuration store.
      </div>

      {/* configure modal */}
      {configuring && (
        <ConfigureModal
          integration={configuring}
          onSave={(values) => handleSave(configuring.id, values)}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}
