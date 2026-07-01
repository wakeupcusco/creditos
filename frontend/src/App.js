import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import "./App.css";
import {
  LayoutDashboard, Users, Wallet, ListChecks, Settings,
  Menu, X, Download, Upload, FileBarChart2, Printer, Coins
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API });

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

/* ================= Root App ================= */
export default function App() {
  const [view, setView] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [credits, setCredits] = useState([]);
  const [config, setConfig] = useState({ nombre: "Mi Financiera", ruc: "", moneda: "S/", mora_diaria_pct: 0 });
  const [operator, setOperator] = useState(localStorage.getItem("operator") || "");
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
      const [cfg, cls, crs] = await Promise.all([
        api.get("/config"), api.get("/clients"), api.get("/credits"),
      ]);
      setConfig(cfg.data);
      setClients(cls.data);
      setCredits(crs.data);
    } catch (e) {
      console.error(e);
      showToast("Error al cargar datos", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { localStorage.setItem("operator", operator); }, [operator]);

  const clientById = useCallback((id) => clients.find((c) => c.id === id), [clients]);
  const creditsByClient = useCallback((id) => credits.filter((c) => c.clientId === id), [credits]);

  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);

  if (loading) return <div className="loading-msg">Cargando…</div>;

  const pageTitle = { dashboard: "Panel general", clientes: "Clientes", creditos: "Créditos", cuotas: "Cuotas", cobranzas: "Reporte de cobranzas", config: "Configuración" }[view] || "";

  const navigate = (v) => { setView(v); setSidebarOpen(false); };

  const ctx = {
    config, clients, credits, operator, clientById, creditsByClient,
    loadAll, openModal, closeModal, showToast, setReceipt, navigate,
  };

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} data-testid="sidebar-backdrop" />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} data-testid="sidebar">
        <div className="brand-logo" aria-hidden="true">
          <BrandIcon />
        </div>
        <div className="brand">
          <div className="brand-mark" data-testid="brand-name">{config.nombre}</div>
          <div className="brand-sub">Gestión de Créditos</div>
        </div>
        <nav className="nav">
          <NavBtn active={view === "dashboard"} onClick={() => navigate("dashboard")} icon={<LayoutDashboard />} label="Panel" tid="nav-dashboard" />
          <NavBtn active={view === "clientes"} onClick={() => navigate("clientes")} icon={<Users />} label="Clientes" tid="nav-clientes" />
          <NavBtn active={view === "creditos"} onClick={() => navigate("creditos")} icon={<Wallet />} label="Créditos" tid="nav-creditos" />
          <NavBtn active={view === "cuotas"} onClick={() => navigate("cuotas")} icon={<ListChecks />} label="Cuotas" tid="nav-cuotas" />
          <NavBtn active={view === "cobranzas"} onClick={() => navigate("cobranzas")} icon={<FileBarChart2 />} label="Cobranzas" tid="nav-cobranzas" />
          <NavBtn active={view === "config"} onClick={() => navigate("config")} icon={<Settings />} label="Configuración" tid="nav-config" />
        </nav>
        <div className="sidebar-footer">
          {clients.length} clientes<br />{credits.length} créditos registrados
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú" data-testid="mobile-menu-btn">
              <Menu />
            </button>
            <div className="page-title" data-testid="page-title">{pageTitle}</div>
          </div>
          <div className="topbar-right">
            <div className="operator-field">
              Atendido por
              <input
                data-testid="operator-input"
                value={operator}
                placeholder="tu nombre"
                onChange={(e) => setOperator(e.target.value)}
              />
            </div>
            <div className="today">{fmtDate(new Date())}</div>
          </div>
        </div>

        <div className="content">
          {view === "dashboard" && <Dashboard ctx={ctx} />}
          {view === "clientes" && <Clientes ctx={ctx} />}
          {view === "creditos" && <Creditos ctx={ctx} />}
          {view === "cuotas" && <Cuotas ctx={ctx} />}
          {view === "cobranzas" && <Cobranzas ctx={ctx} />}
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
  const { config, credits, clientById, openModal } = ctx;

  const stats = useMemo(() => {
    const carteraActiva = credits.filter((c) => creditEstado(c) === "Activo").reduce((s, c) => s + saldoPendiente(c), 0);
    const clientesActivos = new Set(credits.filter((c) => creditEstado(c) === "Activo").map((c) => c.clientId)).size;
    const allCuotas = credits.flatMap((c) => c.cuotas.map((q) => ({ ...q, clientId: c.clientId, creditId: c.id })));
    const vencidas = allCuotas.filter(isVencida);
    const hoyStr = new Date().toDateString();
    const cobradoHoy = allCuotas.filter((q) => q.estado === "Pagada" && q.fechaPago && new Date(q.fechaPago).toDateString() === hoyStr).reduce((s, q) => s + q.montoPagado, 0);
    const proximos = allCuotas.filter((q) => q.estado !== "Pagada" && !isVencida(q)).sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento)).slice(0, 6);
    return { carteraActiva, clientesActivos, vencidas, cobradoHoy, proximos };
  }, [credits]);

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card" data-testid="stat-cartera"><div className="stat-label">Cartera activa</div><div className="stat-value brand">{config.moneda} {fmt(stats.carteraActiva)}</div></div>
        <div className="stat-card" data-testid="stat-clientes"><div className="stat-label">Clientes activos</div><div className="stat-value">{stats.clientesActivos}</div></div>
        <div className="stat-card" data-testid="stat-vencidas"><div className="stat-label">Cuotas vencidas</div><div className="stat-value brick">{stats.vencidas.length}</div></div>
        <div className="stat-card" data-testid="stat-cobrado"><div className="stat-label">Cobrado hoy</div><div className="stat-value amber">{config.moneda} {fmt(stats.cobradoHoy)}</div></div>
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
                  <td><button className="btn btn-primary btn-sm" data-testid={`pay-btn-${q.creditId}-${q.numero}`} onClick={() => openModal({ type: "pay", creditId: q.creditId, numero: q.numero })}>Registrar pago</button></td>
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
          <thead><tr><th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Créditos</th><th>Deuda actual</th></tr></thead>
          <tbody>
            {clients.length ? clients.map((cl) => {
              const creds = creditsByClient(cl.id);
              const deuda = creds.filter((c) => creditEstado(c) === "Activo").reduce((s, c) => s + saldoPendiente(c), 0);
              return (
                <tr key={cl.id} className="clickable" data-testid={`client-row-${cl.id}`} onClick={() => openModal({ type: "clientDetail", id: cl.id })}>
                  <td><strong>{cl.nombre}</strong></td>
                  <td className="mono">{cl.dni || "—"}</td>
                  <td className="mono">{cl.telefono || "—"}</td>
                  <td>{creds.length}</td>
                  <td className="mono">{deuda > 0 ? `${config.moneda} ${fmt(deuda)}` : "—"}</td>
                </tr>
              );
            }) : (<tr className="empty-row"><td colSpan="5">Todavía no registraste clientes. Crea el primero para empezar.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= CREDITOS ================= */
function Creditos({ ctx }) {
  const { credits, clientById, config, openModal } = ctx;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Todos los créditos</div>
        <button className="btn btn-primary btn-sm" data-testid="new-credit-btn" onClick={() => openModal({ type: "credit" })}>+ Nuevo crédito</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Capital</th><th>Progreso</th><th>Saldo</th><th>Estado</th></tr></thead>
          <tbody>
            {credits.length ? credits.map((cr) => {
              const cl = clientById(cr.clientId);
              const pagadas = cr.cuotas.filter((q) => q.estado === "Pagada").length;
              const pct = Math.round((100 * pagadas) / cr.cuotas.length);
              return (
                <tr key={cr.id} className="clickable" data-testid={`credit-row-${cr.id}`} onClick={() => openModal({ type: "creditDetail", id: cr.id })}>
                  <td><strong>{cl ? cl.nombre : "—"}</strong></td>
                  <td className="mono">{config.moneda} {fmt(cr.capital)}</td>
                  <td>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="hint">{pagadas}/{cr.cuotas.length} cuotas</div>
                  </td>
                  <td className="mono">{config.moneda} {fmt(saldoPendiente(cr))}</td>
                  <td><span className={`badge ${creditEstado(cr) === "Pagado" ? "ok" : "pending"}`}>{creditEstado(cr)}</span></td>
                </tr>
              );
            }) : (<tr className="empty-row"><td colSpan="5">Todavía no registraste créditos.</td></tr>)}
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
        <input className="search-input" data-testid="cuota-search" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
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

/* ================= COBRANZAS ================= */
function Cobranzas({ ctx }) {
  const { config } = ctx;
  const [desde, setDesde] = useState(todayISO().slice(0, 8) + "01");
  const [hasta, setHasta] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/reports/cobranzas", { params: { desde, hasta } });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const header = ["Fecha", "Operación", "Cliente", "Cuota #", "Capital", "Interés", "Mora", "Total", "Método", "Operador"];
    const rows = data.rows.map((r) => [fmtDateTime(r.fechaPago), r.operacion || "", r.cliente, r.numero, r.capital, r.interes, r.mora, r.total, r.metodoPago || "", r.atendioPor || ""]);
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
          <div className="panel-title">Filtro de fechas</div>
          <div className="tag-row">
            <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={!data || !data.rows.length} data-testid="export-csv-btn"><Download size={14} /> Exportar CSV</button>
          </div>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div className="field-row">
            <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-testid="report-desde" /></div>
            <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="report-hasta" /></div>
          </div>
        </div>
      </div>

      {loading && <div className="loading-msg">Cargando reporte…</div>}
      {data && (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="l">Cantidad de cobros</div><div className="v" data-testid="kpi-cantidad">{data.totales.cantidad}</div></div>
            <div className="kpi"><div className="l">Capital</div><div className="v">{config.moneda} {fmt(data.totales.capital)}</div></div>
            <div className="kpi"><div className="l">Interés</div><div className="v">{config.moneda} {fmt(data.totales.interes)}</div></div>
            <div className="kpi"><div className="l">Total cobrado</div><div className="v" data-testid="kpi-total">{config.moneda} {fmt(data.totales.total)}</div></div>
          </div>

          <div className="split-cols">
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Por método de pago</div></div>
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
            <div className="panel-head"><div className="panel-title">Detalle de cobros</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Operación</th><th>Cliente</th><th>#</th><th>Total</th><th>Método</th><th>Operador</th></tr></thead>
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
                    </tr>
                  )) : <tr className="empty-row"><td colSpan="7">Sin cobros en el rango seleccionado</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ================= CONFIG ================= */
function Configuracion({ ctx }) {
  const { config, loadAll, showToast } = ctx;
  const [f, setF] = useState(config);
  const [importing, setImporting] = useState(false);

  const save = async () => {
    try {
      await api.put("/config", f);
      await loadAll();
      showToast("Configuración guardada");
    } catch { showToast("Error al guardar", "error"); }
  };

  const doExport = async () => {
    const r = await api.get("/backup/export");
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `backup_creditos_${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
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
      showToast("Error al importar: archivo inválido", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="split-cols">
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Datos de la empresa</div></div>
        <div style={{ padding: 18 }}>
          <div className="field"><label>Nombre de la empresa</label>
            <input data-testid="cfg-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            <div className="hint">Aún puedes decidir el nombre. Cámbialo cuando quieras.</div>
          </div>
          <div className="field-row">
            <div className="field"><label>RUC</label><input data-testid="cfg-ruc" value={f.ruc} onChange={(e) => setF({ ...f, ruc: e.target.value })} /></div>
            <div className="field"><label>Moneda</label><input data-testid="cfg-moneda" value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} /></div>
          </div>
          <div className="field"><label>Tasa de mora diaria (%)</label>
            <input data-testid="cfg-mora" type="number" step="0.01" value={f.mora_diaria_pct} onChange={(e) => setF({ ...f, mora_diaria_pct: parseFloat(e.target.value) || 0 })} />
            <div className="hint">Ej. 0.5 = 0.5% por cada día de atraso sobre (capital + interés).</div>
          </div>
          <button className="btn btn-primary btn-block" onClick={save} data-testid="cfg-save">Guardar cambios</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div className="panel-title">Backup de datos</div></div>
        <div style={{ padding: 18 }}>
          <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 0 }}>
            Descarga un archivo JSON con todos tus clientes, créditos y configuración. Puedes restaurarlo en cualquier momento.
          </p>
          <button className="btn btn-secondary btn-block" onClick={doExport} data-testid="backup-export">
            <Download size={14} /> Exportar backup (JSON)
          </button>
          <div style={{ height: 12 }} />
          <label className="btn btn-ghost btn-block" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {importing ? "Importando…" : "Importar (fusionar)"}
            <input type="file" accept="application/json" hidden data-testid="backup-import-merge"
              onChange={(e) => e.target.files[0] && doImport(e.target.files[0], "merge")} />
          </label>
          <div style={{ height: 8 }} />
          <label className="btn btn-danger btn-block" style={{ cursor: "pointer" }}>
            <Upload size={14} /> Importar (reemplazar todo)
            <input type="file" accept="application/json" hidden
              onChange={(e) => {
                if (e.target.files[0] && window.confirm("Esto eliminará TODOS los datos actuales antes de importar. ¿Continuar?")) {
                  doImport(e.target.files[0], "replace");
                }
              }} />
          </label>
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
  return null;
}

/* ================= CLIENT MODAL ================= */
function ClientModal({ ctx, existing }) {
  const isEdit = !!existing;
  const [f, setF] = useState({ nombre: existing?.nombre || "", dni: existing?.dni || "", telefono: existing?.telefono || "", direccion: existing?.direccion || "" });
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
      const res = isEdit
        ? await api.put(`/clients/${existing.id}`, f)
        : await api.post("/clients", f);
      await loadAll();
      closeModal();
      showToast(isEdit ? "Cliente actualizado" : "Cliente creado");
      if (!isEdit) openModal({ type: "clientDetail", id: res.data.id });
    } catch (e) {
      const msg = e?.response?.data?.detail;
      showToast(typeof msg === "string" ? msg : "Error al guardar", "error");
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">{isEdit ? "Editar cliente" : "Nuevo cliente"}</div>
          <button className="modal-close" onClick={closeModal} data-testid="modal-close">×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre completo</label>
            <input data-testid="client-nombre" value={f.nombre} className={err.nombre ? "error" : ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. José Armando Yáñez" />
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

/* ================= CLIENT DETAIL ================= */
function ClientDetailModal({ ctx, id }) {
  const { clientById, creditsByClient, config, loadAll, closeModal, openModal, showToast } = ctx;
  const cl = clientById(id);
  if (!cl) return null;
  const creds = creditsByClient(id);

  const del = async () => {
    if (creds.length) { showToast("Este cliente tiene créditos registrados", "error"); return; }
    if (!window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;
    try {
      await api.delete(`/clients/${id}`);
      await loadAll(); closeModal(); showToast("Cliente eliminado");
    } catch { showToast("Error al eliminar", "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal wide">
        <div className="modal-head">
          <div className="modal-title">{cl.nombre}</div>
          <button className="modal-close" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 16 }}>DNI {cl.dni || "—"} · Tel. {cl.telefono || "—"} · {cl.direccion || "Sin dirección registrada"}</div>
          <div className="tag-row" style={{ marginBottom: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { closeModal(); openModal({ type: "client", existing: cl }); }}>Editar datos</button>
            <button className="btn btn-danger btn-sm" onClick={del} data-testid="client-delete">Eliminar cliente</button>
          </div>
          <div className="panel-title" style={{ marginBottom: 8 }}>Créditos</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Capital</th><th>Cuotas</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {creds.length ? creds.map((cr) => (
                  <tr key={cr.id} className="clickable" onClick={() => { closeModal(); openModal({ type: "creditDetail", id: cr.id }); }}>
                    <td className="mono">{config.moneda} {fmt(cr.capital)}</td>
                    <td>{cr.cuotas.filter((q) => q.estado === "Pagada").length}/{cr.cuotas.length}</td>
                    <td className="mono">{config.moneda} {fmt(saldoPendiente(cr))}</td>
                    <td><span className={`badge ${creditEstado(cr) === "Pagado" ? "ok" : "pending"}`}>{creditEstado(cr)}</span></td>
                    <td>→</td>
                  </tr>
                )) : (<tr className="empty-row"><td colSpan="5">Sin créditos todavía</td></tr>)}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => { closeModal(); openModal({ type: "credit", preselectClientId: id }); }} data-testid="new-credit-for-client">+ Nuevo crédito para este cliente</button>
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
          <div className="modal-body">Primero registra un cliente para poder crear créditos.</div>
          <div className="modal-foot">
            <button className="btn btn-primary" onClick={() => { closeModal(); openModal({ type: "client" }); }}>Registrar cliente</button>
          </div>
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
    } catch (e) {
      const msg = e?.response?.data?.detail;
      showToast(typeof msg === "string" ? msg : "Error al crear crédito", "error");
    }
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
              <select data-testid="credit-frecuencia" value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value })}>
                <option>Diario</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Fecha de inicio</label>
            <input data-testid="credit-fecha" type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} />
          </div>
          {capital > 0 && num > 0 && (
            <div className="summary-box" data-testid="credit-preview">
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
  const { credits, clientById, config, loadAll, closeModal, openModal, showToast } = ctx;
  const cr = credits.find((c) => c.id === id);
  if (!cr) return null;
  const cl = clientById(cr.clientId);

  const del = async () => {
    if (!window.confirm("¿Eliminar este crédito y todas sus cuotas?")) return;
    try {
      await api.delete(`/credits/${id}`);
      await loadAll(); closeModal(); showToast("Crédito eliminado");
    } catch { showToast("Error al eliminar", "error"); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal wide">
        <div className="modal-head"><div className="modal-title">{cl ? cl.nombre : "Crédito"}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 10 }}>
            Capital {config.moneda} {fmt(cr.capital)} · Interés {cr.tasaInteres}% · {cr.frecuencia} · Inicio {fmtDate(cr.fechaInicio + "T00:00:00")}
          </div>
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
          <button className="btn btn-danger" style={{ marginTop: 14 }} onClick={del} data-testid="credit-delete">Eliminar crédito</button>
        </div>
      </div>
    </div>
  );
}

/* ================= PAY MODAL ================= */
function PayModal({ ctx, creditId, numero }) {
  const { credits, clientById, config, operator, loadAll, closeModal, showToast, setReceipt } = ctx;
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
      } catch { /* ignore */ }
    })();
  }, [creditId, numero]);

  if (!cr || !q) return null;

  const applyMora = () => {
    if (moraInfo) setPf({ ...pf, mora: moraInfo.mora.toFixed(2) });
  };

  const cap = parseFloat(pf.capital) || 0;
  const int = parseFloat(pf.interes) || 0;
  const mora = parseFloat(pf.mora) || 0;
  const total = cap + int + mora;

  const confirm = async () => {
    try {
      const r = await api.post(`/credits/${creditId}/cuotas/${numero}/pagar`, {
        capital: cap, interes: int, mora, metodoPago: pf.metodoPago, atendioPor: operator || "",
      });
      await loadAll();
      closeModal();
      showToast("Pago registrado");
      const nq = r.data.cuotas.find((x) => x.numero === numero);
      setReceipt({ credit: r.data, cuota: nq, client: cl });
    } catch (e) {
      const msg = e?.response?.data?.detail;
      showToast(typeof msg === "string" ? msg : "Error al registrar pago", "error");
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head"><div className="modal-title">Registrar pago — Cuota #{q.numero}</div><button className="modal-close" onClick={closeModal}>×</button></div>
        <div className="modal-body">
          <div className="detail-meta" style={{ marginBottom: 14 }}>{cl?.nombre} · Vence {fmtDate(q.fechaVencimiento)}</div>
          <div className="field-row">
            <div className="field"><label>Capital</label><input data-testid="pay-capital" type="number" step="0.01" value={pf.capital} onChange={(e) => setPf({ ...pf, capital: e.target.value })} /></div>
            <div className="field"><label>Interés</label><input data-testid="pay-interes" type="number" step="0.01" value={pf.interes} onChange={(e) => setPf({ ...pf, interes: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Mora</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input data-testid="pay-mora" type="number" step="0.01" value={pf.mora} onChange={(e) => setPf({ ...pf, mora: e.target.value })} />
              {moraInfo && moraInfo.dias > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={applyMora} data-testid="apply-mora" title={`Sugerido: ${moraInfo.dias} días de atraso × ${moraInfo.tasa_diaria_pct}%`}>
                  <Coins size={14} /> Sugerir ({fmt(moraInfo.mora)})
                </button>
              )}
            </div>
            {moraInfo && moraInfo.dias > 0 && <div className="hint">{moraInfo.dias} día(s) de atraso · Tasa {moraInfo.tasa_diaria_pct}%/día</div>}
            {moraInfo && moraInfo.dias === 0 && <div className="hint">Sin atraso</div>}
          </div>
          <div className="field">
            <label>Método de pago</label>
            <select data-testid="pay-metodo" value={pf.metodoPago} onChange={(e) => setPf({ ...pf, metodoPago: e.target.value })}>
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

/* ================= RECEIPT ================= */
function Receipt({ data, config, onClose }) {
  const { credit, cuota, client } = data;
  const next = credit.cuotas.find((x) => x.numero === cuota.numero + 1);
  const nota = next ? `Cuota ${next.numero}- Próx: ${fmtDate(next.fechaVencimiento)} ${config.moneda} ${fmt(next.total)}` : "Crédito cancelado en su totalidad";
  return (
    <div className="receipt-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="receipt-wrap">
        <div className="receipt-actions">
          <button className="btn btn-secondary" onClick={() => window.print()} data-testid="print-receipt"><Printer size={14} /> Imprimir</button>
          <button className="btn btn-ghost" style={{ background: "#fff" }} onClick={onClose} data-testid="close-receipt">Cerrar</button>
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
