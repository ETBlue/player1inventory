import * as React from "react";

interface SwatchEntry {
  token: string;
  label: string;
}

interface SwatchGroupProps {
  heading: string;
  entries: SwatchEntry[];
}

function SwatchGroup({ heading, entries }: SwatchGroupProps) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h4
        style={{
          fontSize: "0.875rem",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--foreground-muted)",
        }}
      >
        {heading}
      </h4>

      {entries.map(({ token, label }) => (
        <div
          key={token}
          style={{
            display: "grid",
            gridTemplateColumns: "10rem 1fr",
            gap: "0.75rem",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              backgroundColor: `var(${token})`,
              height: "3rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--accessory-default)",
            }}
          />
          <div style={{ margin: 0 }}>
            <div
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                fontWeight: "500",
                color: "var(--foreground-default)",
              }}
            >
              {label}
            </div>
            <div
              style={{
                margin: 0,
                fontSize: "0.6875rem",
                color: "var(--foreground-muted)",
                fontFamily: "monospace",
              }}
            >
              {token}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const backgroundSwatches: SwatchEntry[] = [
  { token: "--background-base", label: "Base" },
  { token: "--background-surface", label: "Surface" },
  { token: "--background-elevated", label: "Elevated" },
];

const foregroundSwatches: SwatchEntry[] = [
  { token: "--foreground-emphasized", label: "Emphasized" },
  { token: "--foreground-default", label: "Default" },
  { token: "--foreground-muted", label: "Muted" },
];

const foregroundColorlessSwatches: SwatchEntry[] = [
  { token: "--foreground-colorless", label: "Colorless" },
  { token: "--foreground-colorless-inverse", label: "Colorless Inv." },
];

const accessorySwatches: SwatchEntry[] = [
  { token: "--accessory-emphasized", label: "Emphasized" },
  { token: "--accessory-default", label: "Default" },
  { token: "--accessory-muted", label: "Muted" },
];

const importanceBackgroundSwatches: SwatchEntry[] = [
  { token: "--importance-primary-background", label: "Primary" },
  { token: "--importance-secondary-background", label: "Secondary" },
  { token: "--importance-destructive-background", label: "Destructive" },
  { token: "--importance-neutral-background", label: "Neutral" },
];

const importanceForegroundSwatches: SwatchEntry[] = [
  { token: "--importance-primary-foreground", label: "Primary Foreground" },
  { token: "--importance-secondary-foreground", label: "Secondary Foreground" },
  { token: "--importance-destructive-foreground", label: "Destructive Foreground" },
  { token: "--importance-neutral-foreground", label: "Neutral Foreground" },
];

const importanceAccessorySwatches: SwatchEntry[] = [
  { token: "--importance-primary-accessory", label: "Primary Accessory" },
  { token: "--importance-secondary-accessory", label: "Secondary Accessory" },
  {
    token: "--importance-destructive-accessory",
    label: "Destructive Accessory",
  },
  { token: "--importance-neutral-accessory", label: "Neutral Accessory" },
];

const statusBackgroundSwatches: SwatchEntry[] = [
  { token: "--status-ok-background", label: "OK background" },
  { token: "--status-warning-background", label: "Warning background" },
  { token: "--status-error-background", label: "Error background" },
  { token: "--status-inactive-background", label: "Inactive background" },
];

const statusBackgroundMutedSwatches: SwatchEntry[] = [
  { token: "--status-ok-background-muted", label: "OK Background Muted" },
  {
    token: "--status-warning-background-muted",
    label: "Warning Background Muted",
  },
  { token: "--status-error-background-muted", label: "Error Background Muted" },
  {
    token: "--status-inactive-background-muted",
    label: "Inactive Background Muted",
  },
];

const statusBackgroundInverseSwatches: SwatchEntry[] = [
  { token: "--status-ok-background-inverse", label: "OK Background Inverse" },
  {
    token: "--status-warning-background-inverse",
    label: "Warning Background Inverse",
  },
  {
    token: "--status-error-background-inverse",
    label: "Error Background Inverse",
  },
  {
    token: "--status-inactive-background-inverse",
    label: "Inactive Background Inverse",
  },
];

const statusForegroundSwatches: SwatchEntry[] = [
  { token: "--status-ok-foreground", label: "OK Foreground" },
  { token: "--status-warning-foreground", label: "Warning Foreground" },
  { token: "--status-error-foreground", label: "Error Foreground" },
  { token: "--status-inactive-foreground", label: "Inactive Foreground" },
];

const statusAccessorySwatches: SwatchEntry[] = [
  { token: "--status-ok-accessory", label: "OK Accessory" },
  { token: "--status-warning-accessory", label: "Warning Accessory" },
  { token: "--status-error-accessory", label: "Error Accessory" },
  { token: "--status-inactive-accessory", label: "Inactive Accessory" },
];

const statusAccessoryMutedSwatches: SwatchEntry[] = [
  { token: "--status-ok-accessory-muted", label: "OK Accessory Muted" },
  {
    token: "--status-warning-accessory-muted",
    label: "Warning Accessory Muted",
  },
  { token: "--status-error-accessory-muted", label: "Error Accessory Muted" },
  {
    token: "--status-inactive-accessory-muted",
    label: "Inactive Accessory Muted",
  },
];

const tagBackgroundSwatches: SwatchEntry[] = [
  { token: "--tag-orange-background", label: "Orange Background" },
  { token: "--tag-brown-background", label: "Brown Background" },
  { token: "--tag-green-background", label: "Green Background" },
  { token: "--tag-teal-background", label: "Teal Background" },
  { token: "--tag-cyan-background", label: "Cyan Background" },
  { token: "--tag-blue-background", label: "Blue Background" },
  { token: "--tag-indigo-background", label: "Indigo Background" },
  { token: "--tag-purple-background", label: "Purple Background" },
  { token: "--tag-pink-background", label: "Pink Background" },
  { token: "--tag-rose-background", label: "Rose Background" },
];

const tagBackgroundInverseSwatches: SwatchEntry[] = [
  {
    token: "--tag-orange-background-inverse",
    label: "Orange Background Inverse",
  },
  {
    token: "--tag-brown-background-inverse",
    label: "Brown Background Inverse",
  },
  {
    token: "--tag-green-background-inverse",
    label: "Green Background Inverse",
  },
  { token: "--tag-teal-background-inverse", label: "Teal Background Inverse" },
  { token: "--tag-cyan-background-inverse", label: "Cyan Background Inverse" },
  { token: "--tag-blue-background-inverse", label: "Blue Background Inverse" },
  {
    token: "--tag-indigo-background-inverse",
    label: "Indigo Background Inverse",
  },
  {
    token: "--tag-purple-background-inverse",
    label: "Purple Background Inverse",
  },
  { token: "--tag-pink-background-inverse", label: "Pink Background Inverse" },
  { token: "--tag-rose-background-inverse", label: "Rose Background Inverse" },
];

const tagForegroundSwatches: SwatchEntry[] = [
  { token: "--tag-orange-foreground", label: "Orange Foreground" },
  { token: "--tag-brown-foreground", label: "Brown Foreground" },
  { token: "--tag-green-foreground", label: "Green Foreground" },
  { token: "--tag-teal-foreground", label: "Teal Foreground" },
  { token: "--tag-cyan-foreground", label: "Cyan Foreground" },
  { token: "--tag-blue-foreground", label: "Blue Foreground" },
  { token: "--tag-indigo-foreground", label: "Indigo Foreground" },
  { token: "--tag-purple-foreground", label: "Purple Foreground" },
  { token: "--tag-pink-foreground", label: "Pink Foreground" },
  { token: "--tag-rose-foreground", label: "Rose Foreground" },
];

const tagAccessorySwatches: SwatchEntry[] = [
  { token: "--tag-orange-accessory", label: "Orange Accessory" },
  { token: "--tag-brown-accessory", label: "Brown Accessory" },
  { token: "--tag-green-accessory", label: "Green Accessory" },
  { token: "--tag-teal-accessory", label: "Teal Accessory" },
  { token: "--tag-cyan-accessory", label: "Cyan Accessory" },
  { token: "--tag-blue-accessory", label: "Blue Accessory" },
  { token: "--tag-indigo-accessory", label: "Indigo Accessory" },
  { token: "--tag-purple-accessory", label: "Purple Accessory" },
  { token: "--tag-pink-accessory", label: "Pink Accessory" },
  { token: "--tag-rose-accessory", label: "Rose Accessory" },
];

export function ColorSwatches() {
  return (
    <div style={{ padding: "1rem 0" }}>
      <h3>General</h3>
      <SwatchGroup heading="Foreground" entries={foregroundSwatches} />
      <SwatchGroup
        heading="Foreground Colorless"
        entries={foregroundColorlessSwatches}
      />
      <SwatchGroup heading="Background" entries={backgroundSwatches} />
      <SwatchGroup
        heading="Accessory (borders, dividers)"
        entries={accessorySwatches}
      />
      <h3>Importance</h3>
      <SwatchGroup
        heading="Importance — Foreground"
        entries={importanceForegroundSwatches}
      />
      <SwatchGroup
        heading="Importance — Background"
        entries={importanceBackgroundSwatches}
      />
      <SwatchGroup
        heading="Importance — Accessory"
        entries={importanceAccessorySwatches}
      />
      <h3>Status</h3>
      <SwatchGroup
        heading="Status — Foreground"
        entries={statusForegroundSwatches}
      />
      <SwatchGroup
        heading="Status — Background"
        entries={statusBackgroundSwatches}
      />
      <SwatchGroup
        heading="Status — Background Muted"
        entries={statusBackgroundMutedSwatches}
      />
      <SwatchGroup
        heading="Status — Accessory"
        entries={statusAccessorySwatches}
      />
      <SwatchGroup
        heading="Status — Accessory Muted"
        entries={statusAccessoryMutedSwatches}
      />
      <SwatchGroup
        heading="Status — Background Inverse"
        entries={statusBackgroundInverseSwatches}
      />
      <h3>Tag</h3>
      <SwatchGroup
        heading="Tag palette — Foreground"
        entries={tagForegroundSwatches}
      />
      <SwatchGroup
        heading="Tag palette — Background"
        entries={tagBackgroundSwatches}
      />
      <SwatchGroup
        heading="Tag palette — Accessory"
        entries={tagAccessorySwatches}
      />
      <SwatchGroup
        heading="Tag palette — Background Inverse"
        entries={tagBackgroundInverseSwatches}
      />
    </div>
  );
}
