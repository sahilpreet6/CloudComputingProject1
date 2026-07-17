/* ==========================================================================
   Nutritional Insights — dashboard logic
   Consumes the deployed Azure Function endpoints and renders four
   visualizations (bar, scatter, heatmap, pie) plus recipes + clusters.
   ========================================================================== */
const API_BASE = "https://project2-func-gsfhenfdbae0bsh9.eastus-01.azurewebsites.net/api";
const ENDPOINTS = {
  INSIGHTS: API_BASE + "/analyze_diets",
  RECIPES: API_BASE + "/recipes",
  CLUSTERS: API_BASE + "/clusters",
};

(() => {
  "use strict";

  const COLORS = { protein: "#2f6fe4", carbs: "#f59e0b", fat: "#ef4444" };
  const PIE_PALETTE = ["#2f6fe4", "#7c3aed", "#f59e0b", "#1a9e63", "#ef4444", "#0891b2", "#db2777"];
  const NUTRIENTS = ["Protein(g)", "Carbs(g)", "Fat(g)"];
  const NUTRIENT_SHORT = { "Protein(g)": "Prot", "Carbs(g)": "Carb", "Fat(g)": "Fat" };

  const charts = { bar: null, scatter: null, pie: null };
  let insights = null;      // full analyze_diets payload
  let recipesPage = 1;      // current recipes page
  let recipesTotalPages = 1;
  let activePanel = null;   // "recipes" | "clusters" | null

  const $ = (id) => document.getElementById(id);
  const P = (r) => Number(r["Protein(g)"]) || 0;
  const C = (r) => Number(r["Carbs(g)"]) || 0;
  const F = (r) => Number(r["Fat(g)"]) || 0;

  /* --------------------------- Fetch helper --------------------------- */
  async function fetchJson(url) {
    const started = performance.now();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const ms = performance.now() - started;
    if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
    return { payload: await res.json(), ms: ms };
  }

  function setStatus(msg, kind) {
    const s = $("apiStatus");
    s.textContent = msg;
    s.className = "api__status" + (kind ? " is-" + kind : "");
  }

  const fmtExec = (secs, fallbackMs) =>
    (secs != null ? (secs * 1000).toFixed(0) + " ms" : Math.round(fallbackMs) + " ms");

  /* --------------------------- Filters --------------------------- */
  function currentDiet() {
    const sel = $("dietFilter").value;
    const q = $("searchInput").value.trim().toLowerCase();
    return { sel: sel, q: q };
  }

  // Keep only records for diets matching the dropdown + search box.
  function filterByDiet(rows) {
    const f = currentDiet();
    return rows.filter((r) => {
      const d = String(r.Diet_type || "");
      const matchSel = f.sel === "all" || d.toLowerCase() === f.sel.toLowerCase();
      const matchQ = !f.q || d.toLowerCase().includes(f.q);
      return matchSel && matchQ;
    });
  }

  function populateDietFilter(list) {
    const sel = $("dietFilter");
    const current = sel.value;
    sel.innerHTML = '<option value="all">All Diet Types</option>';
    (list || []).forEach((d) => {
      const o = document.createElement("option");
      o.value = d; o.textContent = d;
      sel.appendChild(o);
    });
    if ([].slice.call(sel.options).some((o) => o.value === current)) sel.value = current;
  }

  /* --------------------------- Charts --------------------------- */
  function renderCharts() {
    if (!insights) return;
    const bars = filterByDiet((insights.bar_chart && insights.bar_chart.data) || insights.average_macros || []);
    const scatterRows = filterByDiet((insights.scatter_plot && insights.scatter_plot.data) || []);
    const pieRows = filterByDiet((insights.pie_chart && insights.pie_chart.data) || []);

    // ---- Bar: average macros per diet ----
    const labels = bars.map((r) => r.Diet_type);
    if (charts.bar) charts.bar.destroy();
    charts.bar = new Chart($("barChart"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Protein (g)", data: bars.map(P), backgroundColor: COLORS.protein, borderRadius: 4 },
          { label: "Carbs (g)", data: bars.map(C), backgroundColor: COLORS.carbs, borderRadius: 4 },
          { label: "Fat (g)", data: bars.map(F), backgroundColor: COLORS.fat, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 8, font: { size: 10 } } } },
        scales: { y: { beginAtZero: true, grid: { color: "#eef1f5" } }, x: { grid: { display: false } } },
      },
    });

    // ---- Scatter: protein vs carbs per recipe, grouped/colored by diet ----
    const byDiet = {};
    scatterRows.forEach((r) => {
      const d = r.Diet_type || "Other";
      (byDiet[d] = byDiet[d] || []).push({ x: P(r), y: C(r), name: r.Recipe_name });
    });
    const scatterSets = Object.keys(byDiet).map((d, i) => ({
      label: d,
      data: byDiet[d],
      backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length],
      pointRadius: 4, pointHoverRadius: 6,
    }));
    if (charts.scatter) charts.scatter.destroy();
    charts.scatter = new Chart($("scatterChart"), {
      type: "scatter",
      data: { datasets: scatterSets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, padding: 6, font: { size: 10 } } },
          tooltip: { callbacks: { label: (c) => (c.raw.name ? c.raw.name + ": " : "") + "P " + c.parsed.x + "g, C " + c.parsed.y + "g" } },
        },
        scales: {
          x: { title: { display: true, text: "Protein (g)" }, grid: { color: "#eef1f5" } },
          y: { title: { display: true, text: "Carbs (g)" }, grid: { color: "#eef1f5" } },
        },
      },
    });

    // ---- Heatmap: nutrient correlation matrix ----
    renderHeatmap((insights.heatmap && insights.heatmap.data) || []);

    // ---- Pie: recipe distribution by diet type ----
    const pieLabels = pieRows.map((r) => r.Diet_type);
    const pieData = pieRows.map((r) => Number(r.Recipe_count) || 0);
    if (charts.pie) charts.pie.destroy();
    charts.pie = new Chart($("pieChart"), {
      type: "pie",
      data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieLabels.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]), borderColor: "#fff", borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, padding: 6, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const total = c.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total ? ((c.parsed / total) * 100).toFixed(1) : 0;
                return " " + c.label + ": " + c.parsed + " recipes (" + pct + "%)";
              },
            },
          },
        },
      },
    });
  }

  /* --------------------------- Heatmap (HTML grid) --------------------------- */
  function renderHeatmap(data) {
    const box = $("heatmap");
    box.innerHTML = "";
    if (!data.length) return;

    // Build value lookup: value[y][x]
    const lookup = {};
    data.forEach((d) => { (lookup[d.y] = lookup[d.y] || {})[d.x] = d.value; });

    box.style.gridTemplateColumns = "minmax(46px, 0.8fr) repeat(" + NUTRIENTS.length + ", 1fr)";
    box.appendChild(cell("", "heatmap__corner"));
    NUTRIENTS.forEach((n) => box.appendChild(labelCell(NUTRIENT_SHORT[n])));

    NUTRIENTS.forEach((yN) => {
      box.appendChild(labelCell(NUTRIENT_SHORT[yN]));
      NUTRIENTS.forEach((xN) => {
        const v = (lookup[yN] && lookup[yN][xN] != null) ? lookup[yN][xN] : 0;
        const c = cell(v.toFixed(2), "heatmap__cell");
        c.style.background = lerpColor([255, 255, 204], [37, 52, 148], v); // 0..1 correlation
        c.style.color = v > 0.55 ? "#fff" : "#1f2328";
        box.appendChild(c);
      });
    });
  }

  function cell(text, cls) { const d = document.createElement("div"); d.className = cls; d.textContent = text; return d; }
  function labelCell(text) { const d = document.createElement("div"); d.className = "heatmap__label"; d.textContent = text; return d; }
  function lerpColor(a, b, t) {
    const tt = Math.max(0, Math.min(1, t));
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * tt));
    return "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")";
  }

  /* --------------------------- Insights --------------------------- */
  async function loadInsights() {
    disableApi(true);
    setStatus("Loading nutritional insights...");
    try {
      const out = await fetchJson(ENDPOINTS.INSIGHTS);
      insights = out.payload;
      const meta = insights.metadata || {};
      populateDietFilter((insights.filters && insights.filters.diet_types) || []);
      renderCharts();
      setStatus(
        "Loaded " + (meta.total_recipes != null ? meta.total_recipes.toLocaleString() : "?") +
        " recipes across " + (meta.total_diet_types != null ? meta.total_diet_types : "?") +
        " diet types · execution time " + fmtExec(meta.execution_time_seconds, out.ms) + " (Azure Function)",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus("Could not load insights: " + err.message + " — if this mentions CORS, the function needs an Access-Control-Allow-Origin header.", "error");
    } finally {
      disableApi(false);
    }
  }

  /* --------------------------- Recipes --------------------------- */
  function recipesUrl(page) {
    const f = currentDiet();
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (f.sel !== "all") params.set("diet_type", f.sel);
    if (f.q) params.set("search", f.q);
    return ENDPOINTS.RECIPES + "?" + params.toString();
  }

  async function loadRecipes(page) {
    activePanel = "recipes";
    disableApi(true);
    setStatus("Loading recipes...");
    try {
      const out = await fetchJson(recipesUrl(page || 1));
      const p = out.payload;
      const pag = p.pagination || {};
      recipesPage = pag.page || page || 1;
      recipesTotalPages = pag.total_pages || 1;
      renderRecipesTable(p.recipes || []);
      renderPagination();
      setStatus(
        "Showing page " + recipesPage + " of " + recipesTotalPages + " · " +
        (pag.total_items != null ? pag.total_items.toLocaleString() : "?") +
        " recipes · execution time " + fmtExec(p.execution_time_seconds, out.ms), "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus("Could not load recipes: " + err.message, "error");
    } finally {
      disableApi(false);
    }
  }

  function renderRecipesTable(rows) {
    const box = $("results");
    box.hidden = false;
    if (!rows.length) { box.innerHTML = '<p class="results__title">Recipes</p><p>No recipes match the current filters.</p>'; return; }
    let html = '<p class="results__title">Recipes</p><div class="table-wrap"><table class="data-table"><thead><tr>' +
      "<th>Diet</th><th>Recipe</th><th>Cuisine</th><th class='num'>Protein (g)</th><th class='num'>Carbs (g)</th><th class='num'>Fat (g)</th>" +
      "</tr></thead><tbody>";
    rows.forEach((r) => {
      html += "<tr><td>" + esc(r.Diet_type) + "</td><td>" + esc(r.Recipe_name) + "</td><td>" + esc(r.Cuisine_type) +
        "</td><td class='num'>" + P(r) + "</td><td class='num'>" + C(r) + "</td><td class='num'>" + F(r) + "</td></tr>";
    });
    html += "</tbody></table></div>";
    box.innerHTML = html;
  }

  /* --------------------------- Clusters --------------------------- */
  async function loadClusters() {
    activePanel = "clusters";
    disableApi(true);
    setStatus("Loading clusters...");
    try {
      const out = await fetchJson(ENDPOINTS.CLUSTERS);
      const p = out.payload;
      renderClusters(p.clusters || []);
      // clusters view has no pagination
      recipesTotalPages = 1; recipesPage = 1; renderPagination();
      setStatus("Loaded " + (p.clusters || []).length + " clusters · execution time " + fmtExec(p.execution_time_seconds, out.ms), "ok");
    } catch (err) {
      console.error(err);
      setStatus("Could not load clusters: " + err.message, "error");
    } finally {
      disableApi(false);
    }
  }

  function renderClusters(clusters) {
    const box = $("results");
    box.hidden = false;
    let html = '<p class="results__title">Diet Clusters</p><div class="cluster-grid">';
    clusters.forEach((c) => {
      html += '<div class="cluster-card"><h4>' + esc(c.cluster_name) + "</h4>" +
        '<p class="tags">' + esc((c.diet_types || []).join(", ")) + "</p>" +
        '<div class="macros">' +
        "<span>Protein<b>" + round1(c.average_protein_g) + "g</b></span>" +
        "<span>Carbs<b>" + round1(c.average_carbs_g) + "g</b></span>" +
        "<span>Fat<b>" + round1(c.average_fat_g) + "g</b></span>" +
        "</div></div>";
    });
    html += "</div>";
    box.innerHTML = html;
  }

  const round1 = (n) => (Math.round(Number(n) * 10) / 10);
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }

  /* --------------------------- Pagination --------------------------- */
  function renderPagination() {
    const nav = $("pagination");
    if (recipesTotalPages <= 1) {
      nav.innerHTML = '<button class="page-btn" data-page="prev" type="button" disabled>Previous</button>' +
        '<button class="page-btn is-active" data-page="1" type="button">1</button>' +
        '<button class="page-btn" data-page="next" type="button" disabled>Next</button>';
      bindPagination();
      return;
    }
    // windowed page numbers around the current page
    const win = [];
    const start = Math.max(1, recipesPage - 1);
    const end = Math.min(recipesTotalPages, start + 2);
    for (let p = start; p <= end; p++) win.push(p);

    let html = '<button class="page-btn" data-page="prev" type="button"' + (recipesPage <= 1 ? " disabled" : "") + ">Previous</button>";
    if (win[0] > 1) html += '<button class="page-btn" data-page="1" type="button">1</button><span class="page-ellipsis">…</span>';
    win.forEach((p) => { html += '<button class="page-btn' + (p === recipesPage ? " is-active" : "") + '" data-page="' + p + '" type="button">' + p + "</button>"; });
    if (win[win.length - 1] < recipesTotalPages) html += '<span class="page-ellipsis">…</span><button class="page-btn" data-page="' + recipesTotalPages + '" type="button">' + recipesTotalPages + "</button>";
    html += '<button class="page-btn" data-page="next" type="button"' + (recipesPage >= recipesTotalPages ? " disabled" : "") + ">Next</button>";
    nav.innerHTML = html;
    bindPagination();
  }

  function bindPagination() {
    $("pagination").querySelectorAll(".page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const d = btn.dataset.page;
        let target = recipesPage;
        if (d === "prev") target = Math.max(1, recipesPage - 1);
        else if (d === "next") target = Math.min(recipesTotalPages, recipesPage + 1);
        else target = Number(d);
        if (activePanel === "recipes" && target !== recipesPage) loadRecipes(target);
      });
    });
  }

  const fmtMs = (ms) => Math.round(ms) + " ms";
  function disableApi(v) { ["getInsights", "getRecipes", "getClusters"].forEach((id) => { $(id).disabled = v; }); }

  /* --------------------------- Init --------------------------- */
  function onFilterChange() {
    if (insights) renderCharts();
    if (activePanel === "recipes") loadRecipes(1);
  }

  function init() {
    $("getInsights").addEventListener("click", loadInsights);
    $("getRecipes").addEventListener("click", () => loadRecipes(1));
    $("getClusters").addEventListener("click", loadClusters);
    $("dietFilter").addEventListener("change", onFilterChange);
    let t;
    $("searchInput").addEventListener("input", () => { clearTimeout(t); t = setTimeout(onFilterChange, 300); });
    renderPagination();
    loadInsights();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
