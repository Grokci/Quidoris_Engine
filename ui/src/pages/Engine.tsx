import React, { useEffect, useState } from "react";
import { health } from "../lib.api";

export default function Engine() {
  const [status, setStatus] = useState<string>("Checking daemon…");
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const h = await health();
        setDetails(h);
        setStatus(h.ok ? "Daemon online" : "Daemon not ready");
      } catch (e: any) {
        setStatus("Daemon unreachable");
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0f", color: "white", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.02em" }}>Quidoris Engine</h1>
        <p style={{ color: "rgba(255,255,255,0.70)", marginTop: 8 }}>
          Workspace scaffold. Next: Library, Upload, Search, Runs, Evidence spotlight.
        </p>

        <div style={{ marginTop: 18, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, background: "rgba(255,255,255,0.06)", padding: 14 }}>
          <div style={{ fontWeight: 650 }}>{status}</div>
          <pre style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", overflowX: "auto" }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {[
            { title: "Library", desc: "Folders + tags, drag/drop upload, manage docs." },
            { title: "Readme", desc: "Help viewer with search + kid-mode instructions." },
            { title: "Runs", desc: "Create runs, trace steps, stream via SSE." },
            { title: "Evidence", desc: "Open citation → evidence spotlight." },
          ].map((c) => (
            <div key={c.title} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, background: "rgba(255,255,255,0.04)", padding: 14 }}>
              <div style={{ fontWeight: 650 }}>{c.title}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
