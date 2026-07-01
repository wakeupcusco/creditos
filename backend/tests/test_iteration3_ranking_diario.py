"""Iteration 3 backend tests:
- Diario Lun-Sáb (skip Sundays)
- /api/reports/ranking (admin-only, periods, ordering, puntualidad)
- Pago con mora=0 (exoneración)
"""
import os
import uuid
import pytest
import requests
from datetime import date, datetime, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_s(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module")
def asesor_creds(admin_s):
    """Create a fresh asesor for testing."""
    uname = f"test_ranking_ase_{uuid.uuid4().hex[:6]}"
    pw = "ranking123"
    r = admin_s.post(f"{API}/users", json={"username": uname, "name": "TEST Ranking Asesor", "password": pw, "role": "asesor"})
    assert r.status_code == 200, r.text
    yield {"username": uname, "password": pw, "id": r.json()["id"]}


@pytest.fixture(scope="module")
def asesor_s(asesor_creds):
    r = requests.post(f"{API}/auth/login", json={"username": asesor_creds["username"], "password": asesor_creds["password"]})
    assert r.status_code == 200
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def state():
    return {}


# ================ DIARIO LUN-SÁB ================
class TestDiarioLunSab:
    def _wd(self, iso):
        return datetime.fromisoformat(iso[:19] if len(iso) >= 19 else iso).weekday()

    def test_diario_starts_friday_8_cuotas(self, admin_s, state):
        # Client
        r = admin_s.post(f"{API}/clients", json={"nombre": "TEST_Diario1"})
        assert r.status_code == 200
        cid = r.json()["id"]
        state["c1"] = cid
        r = admin_s.post(f"{API}/credits", json={
            "clientId": cid, "capital": 800, "tasaInteres": 10, "numCuotas": 8,
            "frecuencia": "Diario", "fechaInicio": "2026-01-16"
        })
        assert r.status_code == 200, r.text
        state["cr1"] = r.json()["id"]
        cuotas = r.json()["cuotas"]
        fechas = [c["fechaVencimiento"][:10] for c in cuotas]
        # Expected: 17,19,20,21,22,23,24,26 (skip 18 and 25 Sundays)
        expected = ["2026-01-17", "2026-01-19", "2026-01-20", "2026-01-21",
                    "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-26"]
        assert fechas == expected, f"Got {fechas}"
        # Ensure no Sunday
        for c in cuotas:
            assert self._wd(c["fechaVencimiento"]) != 6

    def test_diario_starts_saturday(self, admin_s, state):
        r = admin_s.post(f"{API}/credits", json={
            "clientId": state["c1"], "capital": 300, "tasaInteres": 10, "numCuotas": 3,
            "frecuencia": "Diario", "fechaInicio": "2026-01-17"
        })
        assert r.status_code == 200
        state["cr2"] = r.json()["id"]
        fechas = [c["fechaVencimiento"][:10] for c in r.json()["cuotas"]]
        # First should be Monday 19 (skip Sun 18)
        assert fechas[0] == "2026-01-19"
        assert fechas == ["2026-01-19", "2026-01-20", "2026-01-21"]

    def test_diario_starts_sunday(self, admin_s, state):
        r = admin_s.post(f"{API}/credits", json={
            "clientId": state["c1"], "capital": 200, "tasaInteres": 10, "numCuotas": 2,
            "frecuencia": "Diario", "fechaInicio": "2026-01-18"
        })
        assert r.status_code == 200
        state["cr3"] = r.json()["id"]
        fechas = [c["fechaVencimiento"][:10] for c in r.json()["cuotas"]]
        assert fechas == ["2026-01-19", "2026-01-20"]


# ================ RANKING ENDPOINT ================
class TestRankingRBAC:
    def test_no_auth_401(self):
        r = requests.get(f"{API}/reports/ranking")
        assert r.status_code == 401

    def test_asesor_403(self, asesor_s):
        r = asesor_s.get(f"{API}/reports/ranking")
        assert r.status_code == 403

    def test_admin_ok_mes(self, admin_s):
        r = admin_s.get(f"{API}/reports/ranking", params={"period": "mes"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["period"] == "mes"
        assert data["desde"] and data["hasta"]
        assert isinstance(data["rows"], list)
        if data["rows"]:
            row = data["rows"][0]
            for k in ["asesorId", "asesor", "username", "role", "cobrado",
                      "capital_cobrado", "interes_cobrado", "mora_recuperada",
                      "puntuales", "atrasadas", "creditos_activos",
                      "cartera_pendiente", "puntualidad_pct"]:
                assert k in row, f"missing {k}"

    def test_periods(self, admin_s):
        for p in ["prev_mes", "trimestre", "all"]:
            r = admin_s.get(f"{API}/reports/ranking", params={"period": p})
            assert r.status_code == 200
            d = r.json()
            assert d["period"] == p
            if p == "all":
                assert d["desde"] is None and d["hasta"] is None
            else:
                assert d["desde"] and d["hasta"]

    def test_invalid_period_422(self, admin_s):
        r = admin_s.get(f"{API}/reports/ranking", params={"period": "xxx"})
        assert r.status_code == 422


# ================ RANKING DATA (seed + verify) ================
class TestRankingData:
    def test_seed_and_verify(self, admin_s, asesor_s, asesor_creds, state):
        # Reassign cr1 to asesor
        r = admin_s.patch(f"{API}/credits/{state['cr1']}/asesor", json={"asesorId": asesor_creds["id"]})
        assert r.status_code == 200
        # Create a fresh credit with future start date so payment today is puntual
        future_start = (date.today() + timedelta(days=30)).isoformat()
        r = admin_s.post(f"{API}/credits", json={
            "clientId": state["c1"], "capital": 500, "tasaInteres": 10, "numCuotas": 3,
            "frecuencia": "Mensual", "fechaInicio": future_start
        })
        assert r.status_code == 200
        state["cr_future"] = r.json()["id"]
        # Reassign to our asesor
        admin_s.patch(f"{API}/credits/{state['cr_future']}/asesor", json={"asesorId": asesor_creds["id"]})
        # Pay cuota 1 (future venc, so paying today => puntual)
        r = asesor_s.post(f"{API}/credits/{state['cr_future']}/cuotas/1/pagar",
                          json={"capital": 100, "interes": 10, "mora": 0, "metodoPago": "Efectivo"})
        assert r.status_code == 200, r.text
        state["puntual_total"] = next(x for x in r.json()["cuotas"] if x["numero"] == 1)["total"]

        r = admin_s.get(f"{API}/reports/ranking", params={"period": "mes"})
        assert r.status_code == 200
        rows = r.json()["rows"]
        # ordered desc by cobrado
        for i in range(len(rows) - 1):
            assert rows[i]["cobrado"] >= rows[i + 1]["cobrado"]
        # Find our asesor
        me = next((x for x in rows if x["asesorId"] == asesor_creds["id"]), None)
        assert me is not None
        assert me["puntuales"] >= 1
        assert me["cobrado"] >= state["puntual_total"]

    def test_sum_cobrado_matches_cobranzas(self, admin_s):
        rk = admin_s.get(f"{API}/reports/ranking", params={"period": "mes"}).json()
        cb = admin_s.get(f"{API}/reports/cobranzas", params={
            "desde": rk["desde"], "hasta": rk["hasta"]
        }).json()
        sum_rk = round(sum(r["cobrado"] for r in rk["rows"]), 2)
        assert abs(sum_rk - cb["totales"]["total"]) < 0.05, f"rk={sum_rk} cb={cb['totales']['total']}"


# ================ MORA=0 (exonerar) ================
class TestMoraExoneracion:
    def test_pago_con_mora_cero(self, admin_s, state):
        # Pay cuota 2 with mora=0 explicitly
        r = admin_s.post(f"{API}/credits/{state['cr1']}/cuotas/2/pagar",
                         json={"capital": 100, "interes": 10, "mora": 0, "metodoPago": "Yape"})
        assert r.status_code == 200
        q2 = next(x for x in r.json()["cuotas"] if x["numero"] == 2)
        assert q2["mora"] == 0.0
        assert q2["total"] == 110.0
        assert q2["estado"] == "Pagada"


# ================ CLEANUP ================
class TestZCleanup:
    def test_delete_credits(self, admin_s, state):
        for k in ["cr1", "cr2", "cr3", "cr_future"]:
            if state.get(k):
                admin_s.delete(f"{API}/credits/{state[k]}")

    def test_delete_client(self, admin_s, state):
        if state.get("c1"):
            admin_s.delete(f"{API}/clients/{state['c1']}")

    def test_delete_asesor(self, admin_s, asesor_creds):
        admin_s.delete(f"{API}/users/{asesor_creds['id']}")
