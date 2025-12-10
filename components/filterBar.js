// filterBar.js
import * as d3 from "d3";

export function createFilterBar(data, onChangeCallback) {

    const container = document.getElementById("filter-bar");
    if (!container) {
        console.error("createFilterBar: #filter-bar not found");
        return;
    }
    container.innerHTML = "";

    // Extract unique values
    const genders = [...new Set(data.map(d => d.gender).filter(Boolean))].sort();
    const categories = [...new Set(data.map(d => d.category).filter(Boolean))].sort();
    const payments = [...new Set(data.map(d => d.payment_method).filter(Boolean))].sort();
    const malls = [...new Set(data.map(d => d.shopping_mall).filter(Boolean))].sort();

    const numericAges = data.map(d => +d.age).filter(v => !isNaN(v));
    const minAge = numericAges.length ? d3.min(numericAges) : 0;
    const maxAge = numericAges.length ? d3.max(numericAges) : 100;

    const dateVals = data
        .map(d => d.invoice_date)
        .filter(d => d instanceof Date && !isNaN(d.getTime()));

    // Fallbacks in case dataset has no valid dates
    const fallbackEnd = new Date();
    const fallbackStart = new Date(fallbackEnd);
    fallbackStart.setMonth(fallbackEnd.getMonth() - 6);

    const minDateObj = dateVals.length ? d3.min(dateVals) : fallbackStart;
    const maxDateObj = dateVals.length ? d3.max(dateVals) : fallbackEnd;

    function toInputDateString(d) {
        if (!(d instanceof Date) || isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 10);
    }

    // -----------------------------
    // Build FILTER UI
    // -----------------------------
    container.innerHTML = `
        <h2>Filters</h2>

        <div class="filter-section" id="date-section">
            <h3>Date Range</h3>
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column;">
                    <label for="start-date" style="font-size:12px">Start</label>
                    <input type="date" id="start-date" value="${toInputDateString(minDateObj)}">
                </div>
                <div style="display:flex; flex-direction:column;">
                    <label for="end-date" style="font-size:12px">End</label>
                    <input type="date" id="end-date" value="${toInputDateString(maxDateObj)}">
                </div>
            </div>

            <div id="date-slider" style="margin-top:10px;"></div>
        </div>

        <div class="filter-section">
            <h3>Gender</h3>
            ${genders.map(g => `<label><input type="checkbox" class="filter-gender" value="${escapeHtml(g)}"> ${escapeHtml(g)}</label><br>`).join("")}
        </div>

        <div class="filter-section">
            <h3>Category</h3>
            ${categories.map(c => `<label><input type="checkbox" class="filter-category" value="${escapeHtml(c)}"> ${escapeHtml(c)}</label><br>`).join("")}
        </div>

        <div class="filter-section">
            <h3>Payment Method</h3>
            ${payments.map(p => `<label><input type="checkbox" class="filter-payment" value="${escapeHtml(p)}"> ${escapeHtml(p)}</label><br>`).join("")}
        </div>

        <div class="filter-section">
            <h3>Shopping Mall</h3>
            ${malls.map(m => `<label><input type="checkbox" class="filter-mall" value="${escapeHtml(m)}"> ${escapeHtml(m)}</label><br>`).join("")}
        </div>

        <div class="filter-section">
            <h3>Age Range</h3>
            <input type="number" id="age-min" value="${minAge}" style="width:90px;">
            <input type="number" id="age-max" value="${maxAge}" style="width:90px;">
        </div>
    `;

    function escapeHtml(s) {
        return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    // -----------------------------
    // Slider (D3 brush)
    // -----------------------------
    const sliderDiv = document.getElementById("date-slider");
    const minSliderWidth = 240;
    const sliderPadding = 12;

    // state for preventing feedback loops
    let isSyncing = false;

    // helper to get slider width
    function getWidth() {
        const parent = sliderDiv.parentElement;
        const w = parent ? parent.clientWidth - (sliderPadding * 2) : 320;
        return Math.max(minSliderWidth, w);
    }

    // initial render function
    let svg, x, brush, gBrush, svgHeight = 64, margin = { top: 6, right: 12, bottom: 18, left: 12 };

    function render() {
        // clear old
        sliderDiv.innerHTML = "";

        const width = getWidth();
        svg = d3.select(sliderDiv).append("svg")
            .attr("width", width)
            .attr("height", svgHeight)
            .style("overflow", "visible");

        x = d3.scaleTime()
            .domain([minDateObj, maxDateObj])
            .range([margin.left, width - margin.right])
            .clamp(true);

        // light background track for context
        svg.append("rect")
            .attr("x", margin.left)
            .attr("y", (svgHeight - margin.bottom) / 2 - 6)
            .attr("width", width - margin.left - margin.right)
            .attr("height", 12)
            .attr("rx", 6)
            .attr("fill", "#f3f4f6");

        // axis (few ticks)
        svg.append("g")
            .attr("transform", `translate(0, ${svgHeight - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(Math.min(8, Math.ceil(width / 100))));

        brush = d3.brushX()
            .extent([[margin.left, margin.top], [width - margin.right, svgHeight - margin.bottom]])
            .on("brush end", brushed);

        gBrush = svg.append("g")
            .attr("class", "brush")
            .call(brush);

        // rounded corners on selection if present
        svg.selectAll(".selection").attr("rx", 6).attr("ry", 6);

        // default full selection
        try {
            const x0 = x(minDateObj);
            const x1 = x(maxDateObj);
            gBrush.call(brush.move, [x0, x1]);
        } catch (err) {
            // ignore if brush not ready
            console.warn("brush.move init failed", err);
        }
    }

    render();

    // responsive re-render on resize (debounced)
    let rt;
    window.addEventListener("resize", () => {
        clearTimeout(rt);
        rt = setTimeout(() => {
            try { render(); syncInputsToBrush(); } catch (e) { console.warn(e); }
        }, 120);
    });

    // -----------------------------
    // Utilities: parse + clamp
    // -----------------------------
    function parseSafeDate(val, fallback) {
        if (!val) return fallback;
        const d = new Date(val);
        if (isNaN(d.getTime())) return fallback;
        return d;
    }

    function clampToDomain(d) {
        if (d < minDateObj) return new Date(minDateObj);
        if (d > maxDateObj) return new Date(maxDateObj);
        return d;
    }

    // -----------------------------
    // Brush handler: slider -> inputs -> filters
    // -----------------------------
    function brushed(event) {
        if (isSyncing) return; // prevent feedback loops
        try {
            if (!event.selection) return;
            const [sx, ex] = event.selection;
            let s = x.invert(sx);
            let e = x.invert(ex);

            if (!(s instanceof Date) || isNaN(s)) s = new Date(minDateObj);
            if (!(e instanceof Date) || isNaN(e)) e = new Date(maxDateObj);

            // ensure ordering
            if (s > e) { const tmp = s; s = e; e = tmp; }

            s = clampToDomain(s);
            e = clampToDomain(e);

            // set inputs and call updateFilters directly (no dispatch)
            isSyncing = true;
            const startEl = document.getElementById("start-date");
            const endEl = document.getElementById("end-date");
            if (startEl && endEl) {
                startEl.value = toInputDateString(s);
                endEl.value = toInputDateString(e);
            }

            // small timeout to allow brush move to finish before clearing flag
            setTimeout(() => { isSyncing = false; }, 0);

            // call updateFilters to propagate
            updateFilters();
        } catch (err) {
            console.warn("brushed error:", err);
            isSyncing = false;
        }
    }

    // -----------------------------
    // Inputs -> brush sync
    // -----------------------------
    function syncInputsToBrush() {
        try {
            const startEl = document.getElementById("start-date");
            const endEl = document.getElementById("end-date");
            if (!startEl || !endEl || !gBrush || !x) return;

            let s = parseSafeDate(startEl.value, minDateObj);
            let e = parseSafeDate(endEl.value, maxDateObj);

            // ensure ordering + clamp
            if (s > e) { const tmp = s; s = e; e = tmp; }
            s = clampToDomain(s);
            e = clampToDomain(e);

            const sx = x(s);
            const ex = x(e);

            // prevent triggering brush handler loop
            isSyncing = true;
            try {
                gBrush.call(brush.move, [sx, ex]);
            } catch (err) {
                console.warn("brush.move error:", err);
            }
            setTimeout(() => { isSyncing = false; }, 0);
        } catch (err) {
            console.warn("syncInputsToBrush error:", err);
            isSyncing = false;
        }
    }

    // -----------------------------
    // Filter update logic (same as yours, safe)
    // -----------------------------
    function updateFilters() {
        try {
            const startVal = document.getElementById("start-date").value;
            const endVal = document.getElementById("end-date").value;

            const s = parseSafeDate(startVal, minDateObj);
            const e = parseSafeDate(endVal, maxDateObj);

            let start = s;
            let end = e;
            if (start > end) { const tmp = start; start = end; end = tmp; }

            const newFilters = {
                dateRange: [
                    new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0),
                    new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
                ],
                genders: getValues(".filter-gender"),
                categories: getValues(".filter-category"),
                paymentMethods: getValues(".filter-payment"),
                malls: getValues(".filter-mall"),
                ageRange: [
                    NumberOrNull(document.getElementById("age-min").value),
                    NumberOrNull(document.getElementById("age-max").value)
                ]
            };

            onChangeCallback(newFilters);
        } catch (err) {
            console.warn("updateFilters error:", err);
        }
    }

    function NumberOrNull(v) {
        const n = Number(v);
        return isNaN(n) ? null : n;
    }

    function getValues(sel) {
        try {
            return [...container.querySelectorAll(sel)].filter(x => x.checked).map(x => x.value);
        } catch {
            return [];
        }
    }

    // Attach listeners
    // For date inputs: sync to brush & update filters
    const startInput = document.getElementById("start-date");
    const endInput = document.getElementById("end-date");

    if (startInput) startInput.addEventListener("change", () => { syncInputsToBrush(); updateFilters(); });
    if (endInput) endInput.addEventListener("change", () => { syncInputsToBrush(); updateFilters(); });

    // For other inputs/checkboxes: simply trigger updateFilters
    container.querySelectorAll("input:not(#start-date):not(#end-date)").forEach(inp => {
        inp.addEventListener("change", updateFilters);
    });

    // initial sync & trigger
    try {
        syncInputsToBrush();
        updateFilters();
    } catch (err) {
        console.warn("initial sync error:", err);
    }
}
