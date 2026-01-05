import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, KeyRound, Sparkles, ShieldCheck } from "lucide-react";
import qPng from "../assets/quidoris-q.png";
import { login, waitForDaemon, startDaemon, type Provider } from "../lib.api";

type Stage = "login" | "loading" | "ready";

function providerLabelFor(provider: Provider) {
  switch (provider) {
    case "local_cli":
      return "Local CLI (BYOK)";
    case "hf":
      return "Hugging Face (BYOK)";
    case "openai_compat":
      return "OpenAI-compatible (BYOK)";
  }
}

function QMarkSvg({ size = 220 }: { size?: number }) {
  const id = useMemo(() => `qgrad-${Math.random().toString(16).slice(2)}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" aria-label="Quidoris Q">
      <defs>
        <linearGradient id={id} x1="40" y1="40" x2="200" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b41cff" />
          <stop offset="0.55" stopColor="#3b5cff" />
          <stop offset="1" stopColor="#2bb7ff" />
        </linearGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <circle cx="112" cy="108" r="76" stroke={`url(#${id})`} strokeWidth="28" strokeLinecap="round" opacity="0.98" />
      </g>
      <path d="M136 154 C 132 170, 151 184, 168 186" stroke={`url(#${id})`} strokeWidth="24" strokeLinecap="round" />
      <circle cx="186" cy="186" r="24" stroke={`url(#${id})`} strokeWidth="22" strokeLinecap="round" />
    </svg>
  );
}

function Backdrop() {
  const noiseDataUrl =
    "data:image/svg+xml;utf8," +
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>" +
    "<rect width='160' height='160' filter='url(%23n)' opacity='0.55'/></svg>";

  return (
    <>
      <div className="grid" />
      <div className="noise" style={{ backgroundImage: `url('${noiseDataUrl}')` }} />
    </>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [stage, setStage] = useState<Stage>("login");
  const [email, setEmail] = useState("grokci@gmail.com");
  const [password, setPassword] = useState(""); // keep empty by default
  const [remember, setRemember] = useState(true);
  const [provider, setProvider] = useState<Provider>("local_cli");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("loading");

    try {
      // 1) Ask the local launcher to start the daemon (if not already running).
      await startDaemon();

      // 2) Ensure daemon is reachable (local-first UX).
      await waitForDaemon({ timeoutMs: 5200 });

      // 3) Attempt login (optional in local-only mode; keep here for your auth path).
      await login(email, password);

      // 4) Route into the app.
      setStage("ready");
      window.setTimeout(() => nav("/app"), 250);
    } catch (err: any) {
      setStage("login");
      const msg = String(err?.message ?? err ?? "Unknown error");
      setError(msg === "daemon_unreachable" ? "Quidoris Engine daemon not reachable." : msg);
    }
  }

  return (
    <div className="bg">
      <Backdrop />
      <div className="container">
        <div className="grid2">
          <div style={{ position: "relative" }}>
            <div className="badges">
              <span className="badge solid">Quidoris Research Group</span>
              <span className="badge">Local • Private • BYOK</span>
            </div>

            <div className="h1">Quidoris Engine <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.70)" }}>(RLM Harness)</span></div>
            <div className="sub">
              A local-first environment that turns your document library into an interactive substrate:
              search, read, cite, and iterate—without stuffing a thousand files into an LLM context.
            </div>

            <div className="pillrow">
              <span className="pill"><ShieldCheck size={16} /> Trustable outputs</span>
              <span className="pill"><Sparkles size={16} /> Provider-agnostic</span>
              <span className="pill"><BookOpen size={16} /> README + kid-mode</span>
              <span className="pill"><KeyRound size={16} /> BYOK</span>
            </div>

            <div style={{ marginTop: 18, fontSize: 12, color: "rgba(255,255,255,0.55)", maxWidth: 560 }}>
              Tip: for truly local-only workflows you can optionally bypass auth and treat this screen as a profile selector.
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div className="qfloat">
              <div className="spin">
                {/* Use PNG for brand (as requested) */}
                <img src={qPng} alt="Q" style={{ width: "100%", height: "100%", borderRadius: 28 }} />
              </div>
              <div className="drift" />
            </div>

            <div className="card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <h2>Sign in</h2>
                  <p>Choose a provider, then enter your local profile.</p>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {stage === "login" && (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <form onSubmit={onSubmit}>
                      <div className="field">
                        <label>Provider</label>
                        <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                          <option value="local_cli">Local CLI (BYOK)</option>
                          <option value="hf">Hugging Face (BYOK)</option>
                          <option value="openai_compat">OpenAI-compatible (BYOK)</option>
                        </select>
                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                          Selected: {providerLabelFor(provider)}
                        </div>
                      </div>

                      <div className="sep" />

                      <div className="field">
                        <label>Email</label>
                        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
                      </div>

                      <div className="field">
                        <div className="row">
                          <label>Password</label>
                          <a className="smalllink" href="#" onClick={(e) => { e.preventDefault(); alert("Hook this to your reset flow."); }}>
                            Forgot?
                          </a>
                        </div>
                        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" />
                      </div>

                      <div className="checkbox">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        <span>Remember me on this device</span>
                      </div>

                      {error && (
                        <div className="toast">
                          <strong style={{ color: "rgba(255,255,255,0.92)" }}>Couldn’t enter the engine.</strong>
                          <div style={{ marginTop: 6 }}>{error}</div>
                          {error.includes("daemon") && (
                            <div className="code">
                              # In another terminal, start the daemon (example)

                              bun run quidoris-engine.ts "test"

                              # Then reload this page.

                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <button className="btn primary" type="submit">Enter the Engine</button>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                        This is local software; your keys stay on your machine.
                      </div>
                    </form>
                  </motion.div>
                )}

                {stage === "loading" && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="center"
                  >
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}>
                      <QMarkSvg size={120} />
                    </motion.div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>Booting the environment…</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                        Index, FTS, providers, and UI handshakes.
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <div className="progress"><div /></div>
                      <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                        Connecting: {providerLabelFor(provider)}
                      </div>
                    </div>
                  </motion.div>
                )}

                {stage === "ready" && (
                  <motion.div
                    key="ready"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="center"
                  >
                    <div style={{ fontSize: 18, fontWeight: 650 }}>Welcome.</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                      Launching the workspace…
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
