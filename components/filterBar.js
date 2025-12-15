// filterBar.js
import * as d3 from "d3";

export function createFilterBar(data, onChangeCallback) {

    const container = document.getElementById("filter-bar");
    if (!container) {
        console.error("createFilterBar: #filter-bar not found");
        return;
    }

    // ---------------------------------------------------------
    // 1.DATA PROCESSING
    // ---------------------------------------------------------
    
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

    const fallbackEnd = new Date();
    const fallbackStart = new Date(fallbackEnd);
    fallbackStart.setMonth(fallbackEnd.getMonth() - 6);

    const minDateObj = dateVals.length ? d3.min(dateVals) : fallbackStart;
    const maxDateObj = dateVals.length ? d3.max(dateVals) : fallbackEnd;

    function toInputDateString(d) {
        if (!(d instanceof Date) || isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 10);
    }

    function escapeHtml(s) {
        return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function createCheckboxHtml(value, type) {
        return `
            <label class="custom-checkbox">
                <input type="checkbox" class="filter-${type}" value="${escapeHtml(value)}">
                <span class="checkmark"></span> ${escapeHtml(value)}
            </label>
        `;
    }

    // ---------------------------------------------------------
    // 2.UI RENDERING
    // ---------------------------------------------------------
    container.innerHTML = `
        <div class="filter-header">
            <h2><i class="fa-solid fa-filter"></i> Filters</h2>
            <a href="#" id="btn-reset" class="reset-link">Reset</a>
        </div>

        <div class="filter-group">
            <h3><i class="fa-regular fa-calendar-days"></i> Date Range</h3>
            <div class="date-inputs">
                <div class="input-wrapper">
                    <label>Start</label>
                    <input type="date" id="start-date" value="${toInputDateString(minDateObj)}">
                </div>
                <div class="input-wrapper">
                    <label>End</label>
                    <input type="date" id="end-date" value="${toInputDateString(maxDateObj)}">
                </div>
            </div>
            <div id="date-slider" style="margin-top:10px;"></div>
        </div>

        <div class="filter-group">
            <h3><i class="fa-solid fa-user-group"></i> Gender</h3>
            <div class="checkbox-group">
                ${genders.map(g => createCheckboxHtml(g, 'gender')).join("")}
            </div>
        </div>

        <div class="filter-group">
            <h3><i class="fa-solid fa-tags"></i> Category</h3>
            <div class="checkbox-group scrollable-list">
                ${categories.map(c => createCheckboxHtml(c, 'category')).join("")}
            </div>
        </div>

        <div class="filter-group">
            <h3><i class="fa-regular fa-credit-card"></i> Payment Method</h3>
            <div class="checkbox-group">
                ${payments.map(p => createCheckboxHtml(p, 'payment')).join("")}
            </div>
        </div>

        <div class="filter-group">
            <h3><i class="fa-solid fa-building"></i> Shopping Mall</h3>
            <div class="checkbox-group scrollable-list">
                ${malls.map(m => createCheckboxHtml(m, 'mall')).join("")}
            </div>
        </div>

        <div class="filter-group">
            <h3><i class="fa-solid fa-cake-candles"></i> Age Range</h3>
            <div class="age-inputs">
                <input type="number" id="age-min" value="${minAge}" min="0" max="100">
                <span>-</span>
                <input type="number" id="age-max" value="${maxAge}" min="0" max="100">
            </div>
        </div>
    `;

    // ---------------------------------------------------------
    // 3. LOGIC SLIDER (D3 BRUSH)
    // ---------------------------------------------------------
    const sliderDiv = document.getElementById("date-slider");
    const getWidth = () => {
        return sliderDiv.parentElement ? sliderDiv.parentElement.clientWidth : 220;
    };
    
    let isSyncing = false;

    let svg, x, brush, gBrush;
    const svgHeight = 50;
    const margin = { top: 5, right: 10, bottom: 20, left: 10 };

    function renderSlider() {
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

        svg.append("rect")
            .attr("x", margin.left)
            .attr("y", (svgHeight - margin.bottom) / 2 - 3)
            .attr("width", width - margin.left - margin.right)
            .attr("height", 6)
            .attr("rx", 3)
            .attr("fill", "#e5e7eb");

        svg.append("g")
            .attr("transform", `translate(0, ${svgHeight - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(3).tickFormat(d3.timeFormat("%b %y")));

        brush = d3.brushX()
            .extent([[margin.left, 0], [width - margin.right, svgHeight - margin.bottom]])
            .on("brush end", brushed);

        gBrush = svg.append("g")
            .attr("class", "brush")
            .call(brush);

        try {
            gBrush.call(brush.move, [x(minDateObj), x(maxDateObj)]);
        } catch (e) { }
    }

    renderSlider();

    window.addEventListener("resize", () => {
        renderSlider();
        syncInputsToBrush();
    });


    function parseSafeDate(val, fallback) {
        if (!val) return fallback;
        const d = new Date(val);
        return isNaN(d.getTime()) ? fallback : d;
    }

    function brushed(event) {
        if (isSyncing || !event.selection) return;

        const [sx, ex] = event.selection;
        const s = x.invert(sx);
        const e = x.invert(ex);

        isSyncing = true;
        
        const startEl = document.getElementById("start-date");
        const endEl = document.getElementById("end-date");
        
        if(startEl && endEl) {
            startEl.value = toInputDateString(s);
            endEl.value = toInputDateString(e);
        }

        setTimeout(() => { isSyncing = false; }, 0);
        updateFilters(); 
    }

    function syncInputsToBrush() {
        if (!gBrush || !x) return;
        const startEl = document.getElementById("start-date");
        const endEl = document.getElementById("end-date");
        
        const s = parseSafeDate(startEl.value, minDateObj);
        const e = parseSafeDate(endEl.value, maxDateObj);

        const finalS = s > e ? e : s;
        const finalE = s > e ? s : e;

        isSyncing = true;
        try {
            gBrush.call(brush.move, [x(finalS), x(finalE)]);
        } catch (err) {}
        setTimeout(() => { isSyncing = false; }, 0);
    }

    // ---------------------------------------------------------
    // 4. LOGIC UPDATE FILTER
    // ---------------------------------------------------------

    function updateFilters() {
        const startVal = document.getElementById("start-date").value;
        const endVal = document.getElementById("end-date").value;
        
        let s = parseSafeDate(startVal, minDateObj);
        let e = parseSafeDate(endVal, maxDateObj);

        if (s > e) { const tmp = s; s = e; e = tmp; }
        
        s.setHours(0,0,0,0);
        e.setHours(23,59,59,999);

        const newFilters = {
            dateRange: [s, e],
            genders: getValues(".filter-gender"),
            categories: getValues(".filter-category"),
            paymentMethods: getValues(".filter-payment"),
            malls: getValues(".filter-mall"),
            ageRange: [
                Number(document.getElementById("age-min").value) || 0,
                Number(document.getElementById("age-max").value) || 100
            ]
        };

        onChangeCallback(newFilters);
    }

    function getValues(selector) {
        return [...document.querySelectorAll(selector)]
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    // ---------------------------------------------------------
    // 5. EVENT LISTENERS
    // ---------------------------------------------------------

    document.getElementById("start-date").addEventListener("change", () => { syncInputsToBrush(); updateFilters(); });
    document.getElementById("end-date").addEventListener("change", () => { syncInputsToBrush(); updateFilters(); });

    container.querySelectorAll("input:not([type='date'])").forEach(inp => {
        inp.addEventListener("change", updateFilters);
    });

    const btnReset = document.getElementById("btn-reset");
    if(btnReset) {
        btnReset.addEventListener("click", (e) => {
            e.preventDefault();
            container.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = false);
            document.getElementById("start-date").value = toInputDateString(minDateObj);
            document.getElementById("end-date").value = toInputDateString(maxDateObj);
            document.getElementById("age-min").value = minAge;
            document.getElementById("age-max").value = maxAge;
            
            syncInputsToBrush();
            updateFilters();
        });
    }
}