import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import axios from "axios";
import "./App.css";
import {
  LayoutDashboard, Users, Wallet, ListChecks, Settings,
  Menu, Download, Upload, FileBarChart2, Printer,
  UserCog, Bell, LogOut, KeyRound, BellRing, CheckCheck, Phone, Trophy
} from "lucide-react";

const API = `https://creditos-weq1.onrender.com/api`;
const api = axios.create({ baseURL: API });

// Attach token from localStorage
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

/* ================= Helpers ================= */
const pad = (n, len) => String(n).padStart(len, "0");
const fmt = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return `${pad(dt.getDate(), 2)}/${pad(dt.getMonth() + 1, 2)}/${dt.getFullYear()}`;
};
const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  let h = dt.getHours(); const m = pad(dt.getMinutes(), 2);
  const ampm = h >= 12 ? "PM" : "AM"; h = h % 12; if (h === 0) h = 12;
  return `${fmtDate(d)} ${pad(h, 2)}:${m} ${ampm}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const isVencida = (q) => {
  if (q.estado === "Pagada") return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return new Date(q.fechaVencimiento) < hoy;
};
const saldoPendiente = (c) => c.cuotas.filter((q) => q.estado !== "Pagada").reduce((s, q) => s + q.total, 0);
const creditEstado = (c) => (c.cuotas.every((q) => q.estado === "Pagada") ? "Pagado" : "Activo");
const errMsg = (e, fb = "Error") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(" · ");
  return fb;
};

/* Imprimir cronograma con firma */
function printSchedule(credit, client, config) {
  const total = credit.cuotas.reduce((s, q) => s + q.total, 0);
  const totalCap = credit.cuotas.reduce((s, q) => s + q.capital, 0);
  const totalInt = credit.cuotas.reduce((s, q) => s + q.interes, 0);
  const w = window.open("", "cronograma", "width=800,height=900");
  if (!w) return;
  const rows = credit.cuotas.map((q) => `
    <tr>
      <td class="c">${q.numero}</td>
      <td>${fmtDate(q.fechaVencimiento)}</td>
      <td class="r">${fmt(q.capital)}</td>
      <td class="r">${fmt(q.interes)}</td>
      <td class="r"><strong>${fmt(q.total)}</strong></td>
      <td class="c">${q.estado === "Pagada" ? "PAGADA" : ""}</td>
      <td></td>
    </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cronograma de pagos</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#16221D;padding:24px 32px;max-width:800px;margin:0 auto;font-size:12px;line-height:1.4;}
    h1{font-family:Georgia,serif;font-size:20px;margin:0 0 4px;color:#0E4A40;}
    .sub{color:#5B655F;font-size:11px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:20px;}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0E4A40;padding-bottom:12px;margin-bottom:16px;}
    .brand{font-family:Georgia,serif;font-weight:700;font-size:15px;color:#0E4A40;}
    .brand-sub{font-size:10px;color:#5B655F;}
    .meta-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 14px;margin-bottom:18px;font-size:12px;}
    .meta-grid .k{color:#5B655F;font-weight:600;}
    table{width:100%;border-collapse:collapse;margin-top:6px;}
    th,td{padding:6px 8px;border:1px solid #C8CFC5;text-align:left;font-size:11px;}
    th{background:#E4EDE9;color:#0E4A40;font-weight:700;text-transform:uppercase;letter-spacing:.4px;font-size:10px;}
    .c{text-align:center;}
    .r{text-align:right;font-variant-numeric:tabular-nums;}
    tfoot td{background:#F4F7F3;font-weight:700;}
    .terms{margin-top:22px;font-size:11px;color:#333;line-height:1.6;text-align:justify;}
    .sign-row{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px;}
    .sign{border-top:1px solid #16221D;padding-top:6px;text-align:center;font-size:11px;}
    .sign .who{font-weight:700;}
    .sign .lbl{color:#5B655F;font-size:10px;margin-top:2px;}
    .footer{margin-top:30px;font-size:10px;color:#5B655F;text-align:center;border-top:1px dashed #C8CFC5;padding-top:8px;}
    @media print{body{padding:16px 24px;}}
  </style></head><body>
    <div class="top">
      <div>
        <div class="brand">${config.nombre || "Mi Financiera"}</div>
        ${config.ruc ? `<div class="brand-sub">RUC: ${config.ruc}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:#5B655F">Emitido</div>
        <div style="font-weight:600">${fmtDate(new Date())}</div>
      </div>
    </div>
    <h1>Cronograma de Pagos</h1>
    <div class="sub">Contrato de crédito N° ${(credit.id || "").slice(0,8).toUpperCase()}</div>
    <div class="meta-grid">
      <div class="k">Cliente:</div><div><strong>${client?.nombre || "—"}</strong></div>
      <div class="k">DNI:</div><div>${client?.dni || "—"}</div>
      <div class="k">Teléfono:</div><div>${client?.telefono || "—"}</div>
      <div class="k">Ocupación:</div><div>${client?.ocupacion || "—"}</div>
      <div class="k">Dirección:</div><div colspan="3" style="grid-column:span 3">${client?.direccion || "—"}</div>
      <div class="k">Capital:</div><div><strong>${config.moneda} ${fmt(credit.capital)}</strong></div>
      <div class="k">Interés:</div><div>${credit.tasaInteres}%</div>
      <div class="k">N° cuotas:</div><div>${credit.numCuotas} · ${credit.frecuencia}${credit.frecuencia === "Diario" ? " (lun-sáb)" : ""}</div>
      <div class="k">Inicio:</div><div>${fmtDate(credit.fechaInicio + "T00:00:00")}</div>
    </div>
    <table>
      <thead><tr>
        <th class="c">#</th><th>Vencimiento</th><th class="r">Capital</th><th class="r">Interés</th><th class="r">Total (${config.moneda})</th><th class="c">Estado</th><th>Firma / observación</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2" class="r">TOTALES</td>
        <td class="r">${fmt(totalCap)}</td>
        <td class="r">${fmt(totalInt)}</td>
        <td class="r">${fmt(total)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>
    <div class="terms">
      <strong>Conformidad:</strong> El cliente declara haber leído y aceptado las condiciones del presente cronograma de pagos correspondiente al crédito otorgado por ${config.nombre || "Mi Financiera"}. Se compromete a cancelar cada cuota en la fecha de vencimiento indicada. El incumplimiento generará un interés moratorio conforme a la tasa vigente.
    </div>
    <div class="sign-row">
      <div class="sign">
        <div class="who">${client?.nombre || "—"}</div>
        <div class="lbl">Firma del cliente · DNI ${client?.dni || "—"}</div>
      </div>
      <div class="sign">
        <div class="who">${config.nombre || "Mi Financiera"}</div>
        <div class="lbl">Sello / firma del asesor</div>
      </div>
    </div>
    <div class="footer">Documento generado el ${fmtDateTime(new Date())} · ${config.nombre || "Mi Financiera"}</div>
    <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}

/* ================= Auth Context ================= */
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out, obj=logged in
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { setUser(false); return; }
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch {
      localStorage.removeItem("token");
      setUser(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const login = async (username, password) => {
    try {
      setError("");
      const r = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", r.data.token);
      setUser(r.data.user);
      return true;
    } catch (e) {
      setError(errMsg(e, "No se pudo iniciar sesión"));
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(false);
  };

  return <AuthCtx.Provider value={{ user, login, logout, error, refresh: check }}>{children}</AuthCtx.Provider>;
}

/* ================= Login Screen ================= */
function LoginScreen() {
  const { login, error } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await login(u, p);
    setBusy(false);
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-hero">
          <div className="brand-logo" style={{ background: "var(--brand)", color: "#F1D6A0" }}>
            <BrandIcon />
          </div>
          <h1 className="login-title">Cartera de Créditos</h1>
          <p className="login-sub">Gestión de préstamos y cobranzas</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label>Usuario</label>
            <input value={u} onChange={(e) => setU(e.target.value)} autoFocus data-testid="login-username" placeholder="admin" />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={p} onChange={(e) => setP(e.target.value)} data-testid="login-password" placeholder="••••••" />
          </div>
          {error && <div className="hint error" data-testid="login-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy} data-testid="login-submit">
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
        <div className="login-hint">
          ¿Primera vez? Usuario <b>admin</b> / clave <b>admin123</b>. Cámbiala luego desde Configuración.
        </div>
      </div>
    </div>
  );
}

/* ================= App ================= */
export default function AppWrapper() {
  return (
    <AuthProvider>
      <RootView />
    </AuthProvider>
  );
}

function RootView() {
  const { user } = useAuth();
  if (user === null) return <div className="loading-msg">Cargando…</div>;
  if (!user) return <LoginScreen />;
  return <App />;
}

/* ================= Main App ================= */
function App() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === "admin";
  const [view, setView] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [credits, setCredits] = useState([]);
  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState({ nombre: "Mi Financiera", ruc: "", moneda: "S/", mora_diaria_pct: 0 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = useCallback((msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const reqs = [api.get("/config"), api.get("/clients"), api.get("/credits")];
      if (isAdmin) reqs.push(api.get("/users"));
      const res = await Promise.all(reqs);
      setConfig(res[0].data);
      setClients(res[1].data);
      setCredits(res[2].data);
      if (isAdmin) setUsers(res[3].data);
    } catch (e) {
      console.error(e);
      showToast(errMsg(e, "Error al cargar datos"), "error");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const clientById = useCallback((id) => clients.find((c) => c.id === id), [clients]);
  const creditsByClient = useCallback((id) => credits.filter((c) => c.clientId === id), [credits]);
  const userById = useCallback((id) => users.find((u) => u.id === id), [users]);

  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);

  if (loading) return <div className="loading-msg">Cargando…</div>;

  const pageTitle = {
    dashboard: "Panel general",
    clientes: "Clientes",
    creditos: "Créditos",
    cuotas: "Cuotas",
    recordatorios: "Recordatorios",
    cobranzas: "Reporte de cobranzas",
    ranking: "Ranking de asesores",
    asesores: "Asesores",
    config: "Configuración",
  }[view] || "";

  const navigate = (v) => { setView(v); setSidebarOpen(false); };

  const ctx = {
    user, isAdmin, config, clients, credits, users,
    clientById, creditsByClient, userById,
    loadAll, openModal, closeModal, showToast, setReceipt, navigate,
  };

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} data-testid="sidebar">
        <div className="brand-logo" aria-hidden="true"><BrandIcon /></div>
        <div className="brand">
          <div className="brand-mark" data-testid="brand-name">{config.nombre}</div>
          <div className="brand-sub">Gestión de Créditos</div>
        </div>
        <nav className="nav">
          <NavBtn active={view === "dashboard"} onClick={() => navigate("dashboard")} icon={<LayoutDashboard size={18} />} label="Panel" tid="nav-dashboard" />
          <NavBtn active={view === "clientes"} onClick={() => navigate("clientes")} icon={<Users size={18} />} label="Clientes" tid="nav-clientes" />
          <NavBtn active={view === "creditos"} onClick={() => navigate("creditos")} icon={<Wallet size={18} />} label="Créditos" tid="nav-creditos" />
          <NavBtn active={view === "cuotas"} onClick={() => navigate("cuotas")} icon={<ListChecks size={18} />} label="Cuotas" tid="nav-cuotas" />
          <NavBtn active={view === "recordatorios"} onClick={() => navigate("recordatorios")} icon={<Bell size={18} />} label="Recordatorios" tid="nav-recordatorios" />
          <NavBtn active={view === "cobranzas"} onClick={() => navigate("cobranzas")} icon={<FileBarChart2 size={18} />} label="Cobranzas" tid="nav-cobranzas" />
          {isAdmin && <NavBtn active={view === "ranking"} onClick={() => navigate("ranking")} icon={<Trophy size={18} />} label="Ranking" tid="nav-ranking" />}
          {isAdmin && <NavBtn active={view === "asesores"} onClick={() => navigate("asesores")} icon={<UserCog size={18} />} label="Asesores" tid="nav-asesores" />}
          <NavBtn active={view === "config"} onClick={() => navigate("config")} icon={<Settings size={18} />} label="Configuración" tid="nav-config" />
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-chip-avatar">{(user.name || user.username).slice(0, 1).toUpperCase()}</div>
            <div className="user-chip-info">
              <div className="user-chip-name">{user.name || user.username}</div>
              <div className="user-chip-role">{user.role === "admin" ? "Administrador" : "Asesor"}</div>
            </div>
            <button className="user-chip-logout" onClick={logout} title="Cerrar sesión" data-testid="logout-btn"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú" data-testid="mobile-menu-btn">
              <Menu size={22} />
            </button>
            <div className="page-title" data-testid="page-title">{pageTitle}</div>
          </div>
          <div className="topbar-right">
            <div className="today">{fmtDate(new Date())}</div>
          </div>
        </div>

        <div className="content">
          {view === "dashboard" && <Dashboard ctx={ctx} />}
          {view === "clientes" && <Clientes ctx={ctx} />}
          {view === "creditos" && <Creditos ctx={ctx} />}
          {view === "cuotas" && <Cuotas ctx={ctx} />}
          {view === "recordatorios" && <Recordatorios ctx={ctx} />}
          {view === "cobranzas" && <Cobranzas ctx={ctx} />}
          {view === "ranking" && isAdmin && <Ranking ctx={ctx} />}
          {view === "asesores" && isAdmin && <Asesores ctx={ctx} />}
          {view === "config" && <Configuracion ctx={ctx} />}
        </div>
      </div>

      {modal && <ModalRoot modal={modal} ctx={ctx} />}
      {receipt && <Receipt data={receipt} config={config} onClose={() => setReceipt(null)} />}
      {toast && <div className={`toast ${toast.kind}`} data-testid="toast">{toast.msg}</div>}
    </div>
  );
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8h24M4 24h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="16" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="21" cy="16" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function NavBtn({ active, onClick, icon, label, tid }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} data-testid={tid}>
      <span className="nav-icon">{icon}</span>
      {label}
    </button>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard({ ctx }) {
  const { config, credits, clientById, openModal, user } = ctx;

  const stats = useMemo(() => {
    const carteraActiva = credits.filter((c) => creditEstado(c) === "Activo").reduce((s, c) => s + saldoPendiente(c), 0);
    const clientesActivos = new Set(credits.filter((c) => creditEstado(c) === "Activo").map((c) => c.clientId)).size;
    const allCuotas = credits.flatMap((c) => c.cuotas.map((q) => ({ ...q, clientId: c.clientId, creditId: c.id })));
    const vencidas = allCuotas.filter(isVencida);
    const hoyStr = new Date().toDateString();
    const cobradoHoy = allCuotas.filter((q) => q.estado === "Pagada" && q.fechaPago && new Date(q.fechaPago).toDateString() === hoyStr && q.atendioPor === user.name).reduce((s, q) => s + q.montoPagado, 0);
    const proximos = allCuotas.filter((q) => q.estado !== "Pagada" && !isVencida(q)).sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento)).slice(0, 6);
    return { carteraActiva, clientesActivos, vencidas, cobradoHoy, proximos };
  }, [credits, user.name]);

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Cartera activa</div><div className="stat-value brand">{config.moneda} {fmt(stats.carteraActiva)}</div></div>
        <div className="stat-card"><div className="stat-label">Clientes activos</div><div className="stat-value">{stats.clientesActivos}</div></div>
        <div className="stat-card"><div className="stat-label">Cuotas vencidas</div><div className="stat-value brick">{stats.vencidas.length}</div></div>
        <div className="stat-card"><div className="stat-label">Cobrado hoy {ctx.isAdmin ? "" : "(yo)"}</div><div className="stat-value amber">{config.moneda} {fmt(stats.cobradoHoy)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div className="panel-title">Cuotas vencidas</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>N° cuota</th><th>Vencimiento</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {stats.vencidas.length ? stats.vencidas.slice(0, 8).map((q) => (
                <tr key={`${q.creditId}-${q.numero}`}>
                  <td>{clientById(q.clientId)?.nombre || "—"}</td>
                  <td className="mono">#{q.numero}</td>
                  <td className="mono">{fmtDate(q.fechaVencimiento)}</td>
                  <td className="mono">{config.moneda} {fmt(q.total)}</td>
                  <td><button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "pay", creditId: q.creditId, numero: q.numero })}>Registrar pago</button></td>
                </tr>
              )) : (<tr className="empty-row"><td colSpan="5">No hay cuotas vencidas</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div className="panel-title">Próximos vencimientos</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>N° cuota</th><th>Vencimiento</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {stats.proximos.length ? stats.proximos.map((q) => (
                <tr key={`${q.creditId}-${q.numero}`}>
                  <td>{clientById(q.clientId)?.nombre || "—"}</td>
                  <td className="mono">#{q.numero}</td>
                  <td className="mono">{fmtDate(q.fechaVencimiento)}</td>
                  <td className="mono">{config.moneda} {fmt(q.total)}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => openModal({ type: "pay", creditId: q.creditId, numero: q.numero })}>Registrar pago</button></td>
                </tr>
              )) : (<tr className="empty-row"><td colSpan="5">Sin vencimientos próximos</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ================= CLIENTES ================= */
function Clientes({ ctx }) {
  const { clients, creditsByClient, config, openModal } = ctx;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Todos los clientes</div>
        <button className="btn btn-primary btn-sm" data-testid="new-client-btn" onClick={() => openModal({ type: "client" })}>+ Nuevo cliente</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Ocupación</th><th>Créditos</th><th>Deuda</th></tr></thead>
          <tbody>
            {clients.length ? clients.map((cl) => {
              const creds = creditsByClient(cl.id);
              const deuda = creds.filter((c) => creditEstado(c) === "Activo").reduce((s, c) => s + saldoPendiente(c), 0);
              return (
                <tr key={cl.id} className="clickable" data-testid={`client-row-${cl.id}`} onClick={() => openModal({ type: "clientDetail", id: cl.id })}>
                  <td><strong>{cl.nombre}</strong></td>
                  <td className="mono">{cl.dni || "—"}</td>
                  <td className="mono">{cl.telefono || "—"}</td>
                  <td>{cl.ocupacion || "—"}</td>
                  <td>{creds.length}</td>
                  <td className="mono">{deuda > 0 ? `${config.moneda} ${fmt(deuda)}` : "—"}</td>
                </tr>
              );
            }) : (<tr className="empty-row"><td colSpan="6">Todavía no registraste clientes.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= CREDITOS ================= */
function Creditos({ ctx }) {
  const { credits, clientById, userById, config, openModal, isAdmin } = ctx;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">{isAdmin ? "Todos los créditos" : "Mis créditos"}</div>
        <button className="btn btn-primary btn-sm" data-testid="new-credit-btn" onClick={() => openModal({ type: "credit" })}>+ Nuevo crédito</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Capital</th><th>Progreso</th><th>Saldo</th>
              {isAdmin && <th>Asesor</th>}<th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {credits.length ? credits.map((cr) => {
              const cl = clientById(cr.clientId);
              const asr = isAdmin ? userById(cr.asesorId) : null;
              const pagadas = cr.cuotas.filter((q) => q.estado === "Pagada").length;
              const pct = Math.round((100 * pagadas) / cr.cuotas.length);
              return (
                <tr key={cr.id} className="clickable" onClick={() => openModal({ type: "creditDetail", id: cr.id })}>
                  <td><strong>{cl ? cl.nombre : "—"}</strong></td>
                  <td className="mono">{config.moneda} {fmt(cr.capital)}</td>
                  <td>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="hint">{pagadas}/{cr.cuotas.length} cuotas</div>
                  </td>
                  <td className="mono">{config.moneda} {fmt(saldoPendiente(cr))}</td>
                  {isAdmin && <td>{asr?.name || "—"}</td>}
                  <td><span className={`badge ${creditEstado(cr) === "Pagado" ? "ok" : "pending"}`}>{creditEstado(cr)}</span></td>
                </tr>
              );
            }) : (<tr className="empty-row"><td colSpan={isAdmin ? 6 : 5}>Sin créditos.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= CUOTAS ================= */
function Cuotas({ ctx }) {
  const { credits, clientById, config, openModal } = ctx;
  const [filter, setFilter] = useState("todas");
  const [search, setSearch] = useState("");

  let cuotas = credits.flatMap((c) => c.cuotas.map((q) => ({ ...q, clientId: c.clientId, creditId: c.id })));
  if (filter === "pendientes") cuotas = cuotas.filter((q) => q.estado !== "Pagada" && !isVencida(q));
  else if (filter === "vencidas") cuotas = cuotas.filter(isVencida);
  else if (filter === "pagadas") cuotas = cuotas.filter((q) => q.estado === "Pagada");
  if (search.trim()) {
    const s = search.toLowerCase();
    cuotas = cuotas.filter((q) => (clientById(q.clientId)?.nombre || "").toLowerCase().includes(s));
  }
  cuotas.sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento));

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="filter-tabs">
          {["todas", "pendientes", "vencidas", "pagadas"].map((f) => (
            <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} data-testid={`filter-${f}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <input className="search-input" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>N°</th><th>Vencimiento</th><th>Total</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {cuotas.length ? cuotas.map((q) => (
              <tr key={`${q.creditId}-${q.numero}`}>
                <td>{clientById(q.clientId)?.nombre || "—"}</td>
                <td className="mono">{q.numero}</td>
                <td className="mono">{fmtDate(q.fechaVencimiento)}</td>
                <td className="mono">{config.moneda} {fmt(q.total)}</td>
                <td><span className={`badge ${q.estado === "Pagada" ? "ok" : isVencida(q) ? "late" : "pending"}`}>{q.estado === "Pagada" ? "Pagada" : isVencida(q) ? "Vencida" : "Pendiente"}</span></td>
                <td>
                  {q.estado === "Pagada"
                    ? <button className="btn btn-ghost btn-sm" onClick={() => openModal({ type: "showReceipt", creditId: q.creditId, numero: q.numero })}>Ver recibo</button>
                    : <button className="btn btn-primary btn-sm" onClick={() => openModal({ type: "pay", creditId: q.creditId, numero: q.numero })}>Registrar pago</button>}
                </td>
              </tr>
            )) : (<tr className="empty-row"><td colSpan="6">No hay cuotas para este filtro</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= RECORDATORIOS ================= */
function Recordatorios({ ctx }) {
  const { config, isAdmin, users, showToast } = ctx;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asesorId, setAsesorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = asesorId ? { asesorId } : {};
      const r = await api.get("/reminders", { params });
      setData(r.data);
    } catch (e) {
      showToast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [asesorId, showToast]);

  useEffect(() => { load(); }, [load]);

  const markReminded = async (r) => {
    try {
      await api.post("/reminders/mark", { creditId: r.creditId, numero: r.numero });
      showToast("Marcado como recordado");
      load();
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  const totals = data ? {
    vencidas: data.vencidas.length,
    hoy: data.hoy.length,
    manana: data.manana.length,
    semana: data.semana.length,
  } : { vencidas: 0, hoy: 0, manana: 0, semana: 0 };

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Filtrar por asesor</div>
          </div>
          <div style={{ padding: "12px 18px" }}>
            <select value={asesorId} onChange={(e) => setAsesorId(e.target.value)} style={{ width: 260 }} data-testid="reminders-asesor-filter">
              <option value="">Todos los asesores</option>
              {users.filter((u) => u.activo).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi kpi-brick"><div className="l">Vencidas</div><div className="v" data-testid="rem-vencidas">{totals.vencidas}</div></div>
        <div className="kpi kpi-amber"><div className="l">Hoy</div><div className="v" data-testid="rem-hoy">{totals.hoy}</div></div>
        <div className="kpi kpi-brand"><div className="l">Mañana</div><div className="v" data-testid="rem-manana">{totals.manana}</div></div>
        <div className="kpi"><div className="l">Esta semana</div><div className="v" data-testid="rem-semana">{totals.semana}</div></div>
      </div>

      {loading && <div className="loading-msg">Cargando recordatorios…</div>}
      {data && (
        <>
          <ReminderBucket title="Vencidas" icon={<BellRing size={16} />} kind="late" items={data.vencidas} config={config} onMark={markReminded} isAdmin={isAdmin} />
          <ReminderBucket title="Vencen hoy" icon={<BellRing size={16} />} kind="pending" items={data.hoy} config={config} onMark={markReminded} isAdmin={isAdmin} />
          <ReminderBucket title="Vencen mañana" kind="pending" items={data.manana} config={config} onMark={markReminded} isAdmin={isAdmin} />
          <ReminderBucket title="Vencen esta semana" kind="ok" items={data.semana} config={config} onMark={markReminded} isAdmin={isAdmin} />
        </>
      )}
    </>
  );
}

function ReminderBucket({ title, icon, kind, items, config, onMark, isAdmin }) {
  if (!items || !items.length) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon}{title} <span className={`badge ${kind}`} style={{ marginLeft: 6 }}>{items.length}</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Teléfono</th><th>Cuota #</th><th>Vencimiento</th><th>Monto</th>
              {isAdmin && <th>Asesor</th>}<th>Recordado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={`${r.creditId}-${r.numero}`}>
                <td><strong>{r.cliente}</strong></td>
                <td className="mono">
                  {r.telefono ? (
                    <a className="tel-link" href={`https://wa.me/51${r.telefono}`} target="_blank" rel="noreferrer">
                      <Phone size={12} /> {r.telefono}
                    </a>
                  ) : "—"}
                </td>
                <td className="mono">#{r.numero}</td>
                <td className="mono">{fmtDate(r.fechaVencimiento)}{r.dias > 0 ? ` (${r.dias}d)` : ""}</td>
                <td className="mono">{config.moneda} {fmt(r.total)}</td>
                {isAdmin && <td>{r.asesor}</td>}
                <td>{r.recordadoEn ? <span className="badge ok"><CheckCheck size={11} /> {fmtDate(r.recordadoEn)}</span> : <span className="hint">—</span>}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => onMark(r)} data-testid={`mark-reminder-${r.creditId}-${r.numero}`}>Marqué</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= COBRANZAS ================= */
function Cobranzas({ ctx }) {
  const { config, isAdmin, users } = ctx;
  const [desde, setDesde] = useState(todayISO().slice(0, 8) + "01");
  const [hasta, setHasta] = useState(todayISO());
  const [asesorId, setAsesorId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { desde, hasta };
      if (isAdmin && asesorId) params.asesorId = asesorId;
      const r = await api.get("/reports/cobranzas", { params });
      setData(r.data);
    } catch { setData(null); } finally { setLoading(false); }
  }, [desde, hasta, asesorId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const header = ["Fecha", "Operación", "Cliente", "Cuota #", "Capital", "Interés", "Mora", "Total", "Método", "Operador", "Asesor"];
    const rows = data.rows.map((r) => [fmtDateTime(r.fechaPago), r.operacion || "", r.cliente, r.numero, r.capital, r.interes, r.mora, r.total, r.metodoPago || "", r.atendioPor || "", r.asesor || ""]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cobranzas_${desde}_${hasta}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Filtros</div>
          <div className="tag-row">
            <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={!data || !data.rows.length}><Download size={14} /> Exportar CSV</button>
          </div>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div className="field-row-3">
            <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            {isAdmin && (
              <div className="field"><label>Asesor</label>
                <select value={asesorId} onChange={(e) => setAsesorId(e.target.value)} data-testid="cobranzas-asesor">
                  <option value="">Todos</option>
                  {users.filter((u) => u.activo).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="loading-msg">Cargando reporte…</div>}
      {data && (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="l">Cantidad</div><div className="v">{data.totales.cantidad}</div></div>
            <div className="kpi"><div className="l">Capital</div><div className="v">{config.moneda} {fmt(data.totales.capital)}</div></div>
            <div className="kpi"><div className="l">Interés</div><div className="v">{config.moneda} {fmt(data.totales.interes)}</div></div>
            <div className="kpi"><div className="l">Total cobrado</div><div className="v">{config.moneda} {fmt(data.totales.total)}</div></div>
          </div>

          <div className="split-cols">
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Por método</div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Método</th><th>Total</th></tr></thead>
                  <tbody>
                    {data.porMetodo.length ? data.porMetodo.map((r) => (
                      <tr key={r.metodo}><td>{r.metodo}</td><td className="mono">{config.moneda} {fmt(r.total)}</td></tr>
                    )) : <tr className="empty-row"><td colSpan="2">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Por operador</div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Operador</th><th>Total</th></tr></thead>
                  <tbody>
                    {data.porOperador.length ? data.porOperador.map((r) => (
                      <tr key={r.operador}><td>{r.operador}</td><td className="mono">{config.moneda} {fmt(r.total)}</td></tr>
                    )) : <tr className="empty-row"><td colSpan="2">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div className="panel-title">Detalle</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Op.</th><th>Cliente</th><th>#</th><th>Total</th><th>Método</th><th>Operador</th>{isAdmin && <th>Asesor</th>}</tr></thead>
                <tbody>
                  {data.rows.length ? data.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="mono">{fmtDateTime(r.fechaPago)}</td>
                      <td className="mono">{r.operacion || "—"}</td>
                      <td>{r.cliente}</td>
                      <td className="mono">#{r.numero}</td>
                      <td className="mono">{config.moneda} {fmt(r.total)}</td>
                      <td>{r.metodoPago || "—"}</td>
                      <td>{r.atendioPor || "—"}</td>
                      {isAdmin && <td>{r.asesor}</td>}
                    </tr>
                  )) : <tr className="empty-row"><td colSpan={isAdmin ? 8 : 7}>Sin cobros</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ================= RANKING (admin only) ================= */
function Ranking({ ctx }) {
  const { config } = ctx;
  const [period, setPeriod] = useState("mes");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/reports/ranking", { params: { period } });
      setData(r.data);
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  const totals = data ? {
    cobrado: data.rows.reduce((s, r) => s + r.cobrado, 0),
    mora: data.rows.reduce((s, r) => s + r.mora_recuperada, 0),
    cuotas: data.rows.reduce((s, r) => s + r.puntuales + r.atrasadas, 0),
  } : { cobrado: 0, mora: 0, cuotas: 0 };

  const periodLabel = {
    mes: "este mes", prev_mes: "el mes anterior", trimestre: "los últimos 90 días", all: "todo el histórico",
  }[period];

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Período</div>
        </div>
        <div style={{ padding: "12px 18px" }}>
          <div className="filter-tabs">
            {[["mes", "Este mes"], ["prev_mes", "Mes anterior"], ["trimestre", "Últimos 90 días"], ["all", "Todo"]].map(([k, l]) => (
              <button key={k} className={`filter-tab ${period === k ? "active" : ""}`} onClick={() => setPeriod(k)} data-testid={`period-${k}`}>{l}</button>
            ))}
          </div>
          {data && data.desde && (
            <div className="hint" style={{ marginTop: 8 }}>Rango: {data.desde} → {data.hasta}</div>
          )}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi kpi-brand"><div className="l">Total cobrado ({periodLabel})</div><div className="v">{config.moneda} {fmt(totals.cobrado)}</div></div>
        <div className="kpi kpi-amber"><div className="l">Mora recuperada</div><div className="v">{config.moneda} {fmt(totals.mora)}</div></div>
        <div className="kpi"><div className="l">Cuotas cobradas</div><div className="v">{totals.cuotas}</div></div>
        <div className="kpi"><div className="l">Asesores</div><div className="v">{data ? data.rows.length : 0}</div></div>
      </div>

      {loading && <div className="loading-msg">Cargando ranking…</div>}
      {data && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Desempeño por asesor</div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th><th>Asesor</th>
                  <th>Cobrado</th><th>Capital</th><th>Interés</th><th>Mora recup.</th>
                  <th>Puntuales</th><th>Atrasadas</th><th>Puntualidad</th>
                  <th>Créditos activos</th><th>Cartera pendiente</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length ? data.rows.map((r, i) => (
                  <tr key={r.asesorId} data-testid={`ranking-row-${r.username}`}>
                    <td style={{ fontSize: 20, textAlign: "center", width: 42 }}>{medal(i)}</td>
                    <td>
                      <strong>{r.asesor}</strong>
                      <div className="hint">@{r.username} · {r.role === "admin" ? "Administrador" : "Asesor"}</div>
                    </td>
                    <td className="mono"><strong>{config.moneda} {fmt(r.cobrado)}</strong></td>
                    <td className="mono">{fmt(r.capital_cobrado)}</td>
                    <td className="mono">{fmt(r.interes_cobrado)}</td>
                    <td className="mono">{fmt(r.mora_recuperada)}</td>
                    <td className="mono"><span className="badge ok">{r.puntuales}</span></td>
                    <td className="mono">{r.atrasadas ? <span className="badge late">{r.atrasadas}</span> : "—"}</td>
                    <td className="mono">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-bar" style={{ width: 60 }}><div className="progress-fill" style={{ width: `${r.puntualidad_pct}%` }} /></div>
                        {r.puntualidad_pct}%
                      </div>
                    </td>
                    <td className="mono">{r.creditos_activos}</td>
                    <td className="mono">{config.moneda} {fmt(r.cartera_pendiente)}</td>
                  </tr>
                )) : <tr className="empty-row"><td colSpan="11">Sin datos en este período</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ================= ASESORES (admin only) ================= */
function Asesores({ ctx }) {
  const { users, openModal, loadAll, showToast, user: currentUser } = ctx;

  const toggle = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { activo: !u.activo });
      await loadAll();
      showToast(u.activo ? "Asesor desactivado" : "Asesor activado");
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  const del = async (u) => {
    if (!window.confirm(`¿Eliminar al asesor "${u.name}"?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      await loadAll();
      showToast("Asesor eliminado");
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Asesores del equipo</div>
        <button className="btn btn-primary btn-sm" data-testid="new-asesor-btn" onClick={() => openModal({ type: "user" })}>+ Nuevo asesor</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
          <tbody>
            {users.length ? users.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.username}`}>
                <td><strong>{u.name}</strong></td>
                <td className="mono">{u.username}</td>
                <td><span className={`badge ${u.role === "admin" ? "ok" : "pending"}`}>{u.role === "admin" ? "Administrador" : "Asesor"}</span></td>
                <td>{u.activo ? <span className="badge ok">Activo</span> : <span className="badge late">Inactivo</span>}</td>
                <td className="mono">{fmtDate(u.creadoEn)}</td>
                <td>
                  <div className="tag-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => openModal({ type: "user", existing: u })} data-testid={`edit-user-${u.username}`}>Editar</button>
                    {u.role !== "admin" && u.id !== currentUser.id && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(u)}>{u.activo ? "Desactivar" : "Activar"}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(u)}>Eliminar</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )) : <tr className="empty-row"><td colSpan="6">Sin asesores creados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= CONFIG ================= */
function Configuracion({ ctx }) {
  const { config, loadAll, showToast, isAdmin, openModal } = ctx;
  const [f, setF] = useState(config);
  const [importing, setImporting] = useState(false);

  const save = async () => {
    try { await api.put("/config", f); await loadAll(); showToast("Configuración guardada"); }
    catch (e) { showToast(errMsg(e), "error"); }
  };

  const doExport = async () => {
    try {
      const r = await api.get("/backup/export");
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `backup_creditos_${todayISO()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  const doImport = async (file, mode) => {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      payload.mode = mode;
      const r = await api.post("/backup/import", payload);
      await loadAll();
      showToast(`Importados ${r.data.clients} clientes y ${r.data.credits} créditos`);
    } catch (e) {
      showToast(errMsg(e, "Archivo inválido"), "error");
    } finally { setImporting(false); }
  };

  return (
    <div className="split-cols">
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Datos de la empresa</div></div>
        <div style={{ padding: 18 }}>
          <div className="field"><label>Nombre de la empresa</label>
            <input data-testid="cfg-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} disabled={!isAdmin} />
            <div className="hint">Aún puedes decidir el nombre. Cámbialo cuando quieras.</div>
          </div>
          <div className="field-row">
            <div className="field"><label>RUC</label><input value={f.ruc} onChange={(e) => setF({ ...f, ruc: e.target.value })} disabled={!isAdmin} /></div>
            <div className="field"><label>Moneda</label><input value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} disabled={!isAdmin} /></div>
          </div>
          <div className="field"><label>Tasa de mora diaria (%)</label>
            <input type="number" step="0.01" value={f.mora_diaria_pct} onChange={(e) => setF({ ...f, mora_diaria_pct: parseFloat(e.target.value) || 0 })} disabled={!isAdmin} />
            <div className="hint">Ej. 0.5 = 0.5% por cada día de atraso sobre (capital + interés).</div>
          </div>
          {isAdmin && <button className="btn btn-primary btn-block" onClick={save} data-testid="cfg-save">Guardar cambios</button>}
          {!isAdmin && <div className="hint">Solo el administrador puede modificar estos datos.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div className="panel-title">Cuenta y seguridad</div></div>
        <div style={{ padding: 18 }}>
          <button className="btn btn-secondary btn-block" onClick={() => openModal({ type: "changePassword" })} data-testid="change-password-btn">
            <KeyRound size={14} /> Cambiar mi contraseña
          </button>

          {isAdmin && (
            <>
              <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid var(--line)" }} />
              <div className="panel-title" style={{ marginBottom: 10 }}>Backup</div>
              <button className="btn btn-secondary btn-block" onClick={doExport} data-testid="backup-export"><Download size={14} /> Exportar backup (JSON)</button>
              <div style={{ height: 8 }} />
              <label className="btn btn-ghost btn-block" style={{ cursor: "pointer" }}>
                <Upload size={14} /> {importing ? "Importando…" : "Importar (fusionar)"}
                <input type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0], "merge")} />
              </label>
              <div style={{ height: 8 }} />
              <label className="btn btn-danger btn-block" style={{ cursor: "pointer" }}>
                <Upload size={14} /> Importar (reemplazar todo)
                <input type="file" accept="application/json" hidden onChange={(e) => {
                  if (e.target.files[0] && window.confirm("Esto eliminará TODOS los datos actuales.")) doImport(e.target.files[0], "replace");
                }} />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= MODAL ROOT ================= */
function ModalRoot({ modal, ctx }) {
  if (modal.type === "client") return <ClientModal ctx={ctx} existing={modal.existing} />;
  if (modal.type === "clientDetail") return <ClientDetailModal ctx={ctx} id={modal.id} />;
  if (modal.type === "credit") return <CreditModal ctx={ctx} preselectClientId={modal.preselectClientId} />;
  if (modal.type === "creditDetail") return <CreditDetailModal ctx={ctx} id={modal.id} />;
  if (modal.type === "pay") return <PayModal ctx={ctx} creditId={modal.creditId} numero={modal.numero} />;
  if (modal.type === "showReceipt") return <ShowReceiptFromCredit ctx={ctx} creditId={modal.creditId} numero={modal.numero} />;
  if (modal.type === "user") return <UserModal ctx={ctx} existing={modal.existing} />;
  if (modal.type === "changePassword") return <ChangePasswordModal ctx={ctx} />;
  if (modal.type === "reassignCredit") return <ReassignCreditModal ctx={ctx} creditId={modal.creditId} />;
  return null;
}

/* ================= CLIENT MODAL ================= */
function ClientModal({ ctx, existing }) {
  const isEdit = !!existing;
  const [f, setF] = useState({
    nombre: existing?.nombre || "",
    dni: existing?.dni || "",
    telefono: existing?.telefono || "",
    ocupacion: existing?.ocupacion || "",
    direccion: existing?.direccion || "",
  });
  const [err, setErr] = useState({});
  const { loadAll, closeModal, openModal, showToast } = ctx;

  const validate = () => {
    const e = {};
    if (!f.nombre.trim()) e.nombre = "Nombre obligatorio";
    if (f.dni && (!/^\d{8}$/.test(f.dni))) e.dni = "El DNI debe tener 8 dígitos";
    if (f.telefono && (!/^9\d{8}$/.test(f.telefono))) e.telefono = "Teléfono peruano: 9 dígitos empezando con 9";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      const res = isEdit ? await api.put(`/clients/${existing.id}`, f) : await api.post("/clients", f);
      await loadAll(); closeModal(); showToast(isEdit ? "Cliente actualizado" : "Cliente creado");
      if (!isEdit) openModal({ type: "clientDetail", id: res.data.id });
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">{isEdit ? "Editar cliente" : "Nuevo cliente"}</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre completo</label>
            <input data-testid="client-nombre" value={f.nombre} className={err.nombre ? "error" : ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. José Yáñez" />
            {err.nombre && <div className="hint error">{err.nombre}</div>}
          </div>
          <div className="field-row">
            <div className="field">
              <label>DNI</label>
              <input data-testid="client-dni" value={f.dni} className={err.dni ? "error" : ""} onChange={(e) => setF({ ...f, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="00000000" />
              {err.dni && <div className="hint error">{err.dni}</div>}
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input data-testid="client-telefono" value={f.telefono} className={err.telefono ? "error" : ""} onChange={(e) => setF({ ...f, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })} placeholder="9xxxxxxxx" />
              {err.telefono && <div className="hint error">{err.telefono}</div>}
            </div>
          </div>
          <div className="field">
            <label>Ocupación</label>
            <input data-testid="client-ocupacion" value={f.ocupacion} onChange={(e) => setF({ ...f, ocupacion: e.target.value })} placeholder="Ej. Comerciante, Docente, Independiente…" />
          </div>
          <div className="field"><label>Dirección</label><input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} placeholder="Opcional" /></div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} data-testid="client-save">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ClientDetailModal({ ctx, id }) {
  const { clientById, creditsByClient, config, loadAll, closeModal, openModal, showToast, isAdmin, userById } = ctx;
  const cl = clientById(id);
  if (!cl) return null;
  const creds = creditsByClient(id);

  const del = async () => {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    try { await api.delete(`/clients/${id}`); await loadAll(); closeModal(); showToast("Cliente eliminado"); }
    catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal wide">
        <div className="modal-head"><div className="modal-title">{cl.nombre}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 16 }}>
            DNI {cl.dni || "—"} · Tel. {cl.telefono || "—"} · Ocupación: {cl.ocupacion || "—"}<br />
            {cl.direccion || "Sin dirección registrada"}
          </div>
          <div className="tag-row" style={{ marginBottom: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { closeModal(); openModal({ type: "client", existing: cl }); }}>Editar datos</button>
            <button className="btn btn-danger btn-sm" onClick={del}>Eliminar cliente</button>
          </div>
          <div className="panel-title" style={{ marginBottom: 8 }}>Créditos</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Capital</th><th>Cuotas</th><th>Saldo</th>{isAdmin && <th>Asesor</th>}<th>Estado</th><th></th></tr></thead>
              <tbody>
                {creds.length ? creds.map((cr) => {
                  const asr = isAdmin ? userById(cr.asesorId) : null;
                  return (
                    <tr key={cr.id} className="clickable" onClick={() => { closeModal(); openModal({ type: "creditDetail", id: cr.id }); }}>
                      <td className="mono">{config.moneda} {fmt(cr.capital)}</td>
                      <td>{cr.cuotas.filter((q) => q.estado === "Pagada").length}/{cr.cuotas.length}</td>
                      <td className="mono">{config.moneda} {fmt(saldoPendiente(cr))}</td>
                      {isAdmin && <td>{asr?.name || "—"}</td>}
                      <td><span className={`badge ${creditEstado(cr) === "Pagado" ? "ok" : "pending"}`}>{creditEstado(cr)}</span></td>
                      <td>→</td>
                    </tr>
                  );
                }) : (<tr className="empty-row"><td colSpan={isAdmin ? 6 : 5}>Sin créditos</td></tr>)}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => { closeModal(); openModal({ type: "credit", preselectClientId: id }); }}>+ Nuevo crédito</button>
        </div>
      </div>
    </div>
  );
}

/* ================= CREDIT MODAL ================= */
function CreditModal({ ctx, preselectClientId }) {
  const { clients, config, loadAll, closeModal, openModal, showToast } = ctx;
  const [f, setF] = useState({
    clientId: preselectClientId || clients[0]?.id || "",
    capital: "", tasaInteres: "", numCuotas: "", frecuencia: "Mensual", fechaInicio: todayISO(),
  });

  if (!clients.length) {
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal">
          <div className="modal-head"><div className="modal-title">Sin clientes</div><button className="modal-close" onClick={closeModal}>×</button></div>
          <div className="modal-body">Primero registra un cliente.</div>
          <div className="modal-foot"><button className="btn btn-primary" onClick={() => { closeModal(); openModal({ type: "client" }); }}>Registrar cliente</button></div>
        </div>
      </div>
    );
  }

  const capital = parseFloat(f.capital) || 0;
  const interes = parseFloat(f.tasaInteres) || 0;
  const num = parseInt(f.numCuotas) || 0;
  const interesTotal = capital * (interes / 100);
  const totalPagar = capital + interesTotal;
  const cuotaTotal = num ? totalPagar / num : 0;

  const save = async () => {
    if (!capital || !num || !f.fechaInicio) { showToast("Completa capital, cuotas y fecha", "error"); return; }
    try {
      const res = await api.post("/credits", {
        clientId: f.clientId, capital, tasaInteres: interes, numCuotas: num,
        frecuencia: f.frecuencia, fechaInicio: f.fechaInicio,
      });
      await loadAll(); closeModal(); showToast("Crédito creado");
      openModal({ type: "creditDetail", id: res.data.id });
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">Nuevo crédito</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Cliente</label>
            <select data-testid="credit-cliente" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label>Capital ({config.moneda})</label>
              <input data-testid="credit-capital" type="number" step="0.01" value={f.capital} onChange={(e) => setF({ ...f, capital: e.target.value })} placeholder="1000.00" />
            </div>
            <div className="field"><label>Interés total (%)</label>
              <input data-testid="credit-interes" type="number" step="0.01" value={f.tasaInteres} onChange={(e) => setF({ ...f, tasaInteres: e.target.value })} placeholder="18" />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>N° de cuotas</label>
              <input data-testid="credit-numcuotas" type="number" value={f.numCuotas} onChange={(e) => setF({ ...f, numCuotas: e.target.value })} placeholder="12" />
            </div>
            <div className="field"><label>Frecuencia</label>
              <select value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value })}>
                <option>Diario</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option>
              </select>
              {f.frecuencia === "Diario" && <div className="hint">Los cobros diarios se calculan de lunes a sábado (sin domingos).</div>}
            </div>
          </div>
          <div className="field"><label>Fecha de inicio</label>
            <input type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} />
          </div>
          {capital > 0 && num > 0 && (
            <div className="summary-box">
              <div className="summary-row"><span>Interés total</span><span className="mono">{config.moneda} {fmt(interesTotal)}</span></div>
              <div className="summary-row"><span>Total a pagar</span><span className="mono">{config.moneda} {fmt(totalPagar)}</span></div>
              <div className="summary-row total"><span>Cuota ({num}x)</span><span className="mono">{config.moneda} {fmt(cuotaTotal)}</span></div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} data-testid="credit-save">Crear crédito</button>
        </div>
      </div>
    </div>
  );
}

/* ================= CREDIT DETAIL ================= */
function CreditDetailModal({ ctx, id }) {
  const { credits, clientById, userById, config, loadAll, closeModal, openModal, showToast, isAdmin } = ctx;
  const cr = credits.find((c) => c.id === id);
  if (!cr) return null;
  const cl = clientById(cr.clientId);
  const asr = userById(cr.asesorId);

  const del = async () => {
    if (!window.confirm("¿Eliminar este crédito y todas sus cuotas?")) return;
    try { await api.delete(`/credits/${id}`); await loadAll(); closeModal(); showToast("Crédito eliminado"); }
    catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal wide">
        <div className="modal-head"><div className="modal-title">{cl ? cl.nombre : "Crédito"}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 10 }}>
            Capital {config.moneda} {fmt(cr.capital)} · Interés {cr.tasaInteres}% · {cr.frecuencia} · Inicio {fmtDate(cr.fechaInicio + "T00:00:00")}
            {asr && <> · Asesor: <strong>{asr.name}</strong></>}
          </div>
          {isAdmin && (
            <div className="tag-row" style={{ marginBottom: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { closeModal(); openModal({ type: "reassignCredit", creditId: cr.id }); }} data-testid="reassign-credit">
                <UserCog size={14} /> Reasignar asesor
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => printSchedule(cr, cl, config)} data-testid="print-schedule-admin">
                <Printer size={14} /> Imprimir cronograma
              </button>
            </div>
          )}
          {!isAdmin && (
            <div className="tag-row" style={{ marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => printSchedule(cr, cl, config)} data-testid="print-schedule">
                <Printer size={14} /> Imprimir cronograma
              </button>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Vencimiento</th><th>Capital</th><th>Interés</th><th>Total</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {cr.cuotas.map((q) => (
                  <tr key={q.numero}>
                    <td className="mono">{q.numero}</td>
                    <td className="mono">{fmtDate(q.fechaVencimiento)}</td>
                    <td className="mono">{fmt(q.capital)}</td>
                    <td className="mono">{fmt(q.interes)}</td>
                    <td className="mono">{fmt(q.total)}</td>
                    <td><span className={`badge ${q.estado === "Pagada" ? "ok" : isVencida(q) ? "late" : "pending"}`}>{q.estado === "Pagada" ? "Pagada" : isVencida(q) ? "Vencida" : "Pendiente"}</span></td>
                    <td>
                      {q.estado === "Pagada"
                        ? <button className="btn btn-ghost btn-sm" onClick={() => openModal({ type: "showReceipt", creditId: cr.id, numero: q.numero })}>Ver recibo</button>
                        : <button className="btn btn-primary btn-sm" data-testid={`credit-pay-${q.numero}`} onClick={() => openModal({ type: "pay", creditId: cr.id, numero: q.numero })}>Pagar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-danger" style={{ marginTop: 14 }} onClick={del}>Eliminar crédito</button>
        </div>
      </div>
    </div>
  );
}

/* ================= REASSIGN CREDIT ================= */
function ReassignCreditModal({ ctx, creditId }) {
  const { credits, users, loadAll, closeModal, openModal, showToast } = ctx;
  const cr = credits.find((c) => c.id === creditId);
  const [asesorId, setAsesorId] = useState(cr?.asesorId || "");
  if (!cr) return null;

  const save = async () => {
    try {
      await api.patch(`/credits/${creditId}/asesor`, { asesorId });
      await loadAll(); closeModal(); showToast("Crédito reasignado");
      openModal({ type: "creditDetail", id: creditId });
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">Reasignar crédito</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Asesor</label>
            <select value={asesorId} onChange={(e) => setAsesorId(e.target.value)} data-testid="reassign-select">
              {users.filter((u) => u.activo).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} data-testid="reassign-save">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ================= PAY MODAL ================= */
function PayModal({ ctx, creditId, numero }) {
  const { credits, clientById, config, loadAll, closeModal, showToast, setReceipt } = ctx;
  const cr = credits.find((c) => c.id === creditId);
  const q = cr?.cuotas.find((x) => x.numero === numero);
  const cl = clientById(cr?.clientId);

  const [pf, setPf] = useState({
    capital: q?.capital.toFixed(2) || "0",
    interes: q?.interes.toFixed(2) || "0",
    mora: q?.mora.toFixed(2) || "0",
    metodoPago: "Efectivo",
  });
  const [moraInfo, setMoraInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/mora/preview", { params: { creditId, numero } });
        setMoraInfo(r.data);
        // Auto-aplicar mora sugerida si hay días de atraso
        if (r.data && r.data.dias > 0 && r.data.mora > 0) {
          setPf((prev) => ({ ...prev, mora: r.data.mora.toFixed(2) }));
        }
      } catch { /* ignore */ }
    })();
     
  }, [creditId, numero]);

  if (!cr || !q) return null;

  const exonerarMora = () => setPf({ ...pf, mora: "0.00" });

  const cap = parseFloat(pf.capital) || 0;
  const int = parseFloat(pf.interes) || 0;
  const mora = parseFloat(pf.mora) || 0;
  const total = cap + int + mora;

  const confirm = async () => {
    try {
      const r = await api.post(`/credits/${creditId}/cuotas/${numero}/pagar`, {
        capital: cap, interes: int, mora, metodoPago: pf.metodoPago,
      });
      await loadAll(); closeModal(); showToast("Pago registrado");
      const nq = r.data.cuotas.find((x) => x.numero === numero);
      setReceipt({ credit: r.data, cuota: nq, client: cl });
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">Registrar pago — Cuota #{q.numero}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 14 }}>{cl?.nombre} · Vence {fmtDate(q.fechaVencimiento)}</div>
          <div className="field-row">
            <div className="field"><label>Capital</label><input type="number" step="0.01" value={pf.capital} onChange={(e) => setPf({ ...pf, capital: e.target.value })} /></div>
            <div className="field"><label>Interés</label><input type="number" step="0.01" value={pf.interes} onChange={(e) => setPf({ ...pf, interes: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Mora</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" step="0.01" value={pf.mora} onChange={(e) => setPf({ ...pf, mora: e.target.value })} data-testid="pay-mora" />
              {parseFloat(pf.mora) > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={exonerarMora} data-testid="exonerar-mora" title="Poner mora en 0 (exonerar)">
                  Exonerar
                </button>
              )}
            </div>
            {moraInfo && moraInfo.dias > 0 && (
              <div className="hint">
                Mora auto-calculada: <strong>{fmt(moraInfo.mora)}</strong> ({moraInfo.dias} día(s) × {moraInfo.tasa_diaria_pct}%). Puedes editarla o exonerarla.
              </div>
            )}
            {moraInfo && moraInfo.dias === 0 && <div className="hint">Sin atraso</div>}
          </div>
          <div className="field">
            <label>Método de pago</label>
            <select value={pf.metodoPago} onChange={(e) => setPf({ ...pf, metodoPago: e.target.value })}>
              <option>Efectivo</option><option>Transferencia</option><option>Yape</option><option>Plin</option>
            </select>
          </div>
          <div className="summary-box"><div className="summary-row total"><span>Total a cobrar</span><span className="mono">{config.moneda} {fmt(total)}</span></div></div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm} data-testid="pay-confirm">Confirmar pago</button>
        </div>
      </div>
    </div>
  );
}

function ShowReceiptFromCredit({ ctx, creditId, numero }) {
  const { credits, clientById, setReceipt, closeModal } = ctx;
  useEffect(() => {
    const cr = credits.find((c) => c.id === creditId);
    const q = cr?.cuotas.find((x) => x.numero === numero);
    if (cr && q) setReceipt({ credit: cr, cuota: q, client: clientById(cr.clientId) });
    closeModal();
     
  }, []);
  return null;
}

/* ================= USER MODAL ================= */
function UserModal({ ctx, existing }) {
  const isEdit = !!existing;
  const [f, setF] = useState({
    username: existing?.username || "",
    name: existing?.name || "",
    password: "",
    role: existing?.role || "asesor",
  });
  const { loadAll, closeModal, showToast } = ctx;

  const save = async () => {
    if (!f.name.trim()) { showToast("Nombre obligatorio", "error"); return; }
    if (!isEdit && (!f.username.trim() || !f.password)) { showToast("Usuario y contraseña obligatorios", "error"); return; }
    try {
      if (isEdit) {
        const upd = { name: f.name, role: f.role };
        if (f.password) upd.password = f.password;
        await api.put(`/users/${existing.id}`, upd);
      } else {
        await api.post("/users", f);
      }
      await loadAll(); closeModal(); showToast(isEdit ? "Asesor actualizado" : "Asesor creado");
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">{isEdit ? "Editar asesor" : "Nuevo asesor"}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Nombre completo</label>
            <input data-testid="user-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. María López" />
          </div>
          <div className="field-row">
            <div className="field"><label>Usuario</label>
              <input data-testid="user-username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} disabled={isEdit} placeholder="maria.lopez" />
              {isEdit && <div className="hint">No se puede cambiar el usuario</div>}
            </div>
            <div className="field"><label>Rol</label>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} disabled={isEdit && existing.role === "admin"}>
                <option value="asesor">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <div className="field"><label>{isEdit ? "Nueva contraseña (opcional)" : "Contraseña"}</label>
            <input data-testid="user-password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={isEdit ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres"} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} data-testid="user-save">{isEdit ? "Guardar" : "Crear asesor"}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ ctx }) {
  const { closeModal, showToast } = ctx;
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });

  const save = async () => {
    if (f.new_password.length < 6) { showToast("La nueva contraseña debe tener al menos 6 caracteres", "error"); return; }
    if (f.new_password !== f.confirm) { showToast("Las contraseñas no coinciden", "error"); return; }
    try {
      await api.post("/auth/change-password", { current_password: f.current_password, new_password: f.new_password });
      closeModal();
      showToast("Contraseña actualizada");
    } catch (e) { showToast(errMsg(e), "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">Cambiar contraseña</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="field"><label>Contraseña actual</label><input type="password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} data-testid="cp-current" /></div>
          <div className="field"><label>Nueva contraseña</label><input type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} data-testid="cp-new" /></div>
          <div className="field"><label>Confirmar nueva contraseña</label><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} data-testid="cp-confirm" /></div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} data-testid="cp-save">Cambiar</button>
        </div>
      </div>
    </div>
  );
}

/* ================= RECEIPT ================= */
function Receipt({ data, config, onClose }) {
  const { credit, cuota, client } = data;
  const next = credit.cuotas.find((x) => x.numero === cuota.numero + 1);
  const nota = next ? `Cuota ${next.numero}- Próx: ${fmtDate(next.fechaVencimiento)} ${config.moneda} ${fmt(next.total)}` : "Crédito cancelado en su totalidad";
  return (
    <div className="receipt-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="receipt-wrap">
        <div className="receipt-actions">
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
          <button className="btn btn-ghost" style={{ background: "#fff" }} onClick={onClose}>Cerrar</button>
        </div>
        <div className="receipt" id="receiptPrintArea">
          <div className="receipt-weave" />
          <div className="receipt-inner">
            <div className="r-brand">{config.nombre}</div>
            <div className="r-opnum">Recibo #{cuota.operacion}</div>
            <hr className="r-line" />
            <div className="r-ruc">{config.ruc ? config.ruc + " - " : ""}{(config.nombre || "").toUpperCase()}</div>
            <div className="r-grid">
              <div className="k">Usuario:</div><div>{cuota.atendioPor || "—"}</div>
              <div className="k">Fecha:</div><div>{fmtDateTime(cuota.fechaPago)}</div>
              <div className="k">Operación:</div><div>{cuota.operacion}</div>
              <div className="k">Nombres:</div><div>{client?.nombre}</div>
            </div>
            <hr className="r-line" />
            <div className="r-sec-title">AMORTIZACIÓN DE CRÉDITO</div>
            <div className="r-amort">
              <div className="row"><span>CAPITAL:</span><span className="mono">{fmt(cuota.capital)}</span></div>
              <div className="row"><span>INTERES:</span><span className="mono">{fmt(cuota.interes)}</span></div>
              <div className="row"><span>MORA:</span><span className="mono">{fmt(cuota.mora)}</span></div>
              <div className="row total"><span>TOTAL:</span><span className="mono">{fmt(cuota.total)}</span></div>
            </div>
            <hr className="r-line" />
            <div className="r-note"><span className="k">NOTA:</span>{nota}</div>
            <div className="r-note"><span className="k">PAGO:</span>{(cuota.metodoPago || "").toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
