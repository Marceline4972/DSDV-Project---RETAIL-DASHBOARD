import * as d3 from "d3";

/* =========================
   GLOBAL VARIABLES
========================= */
let svg, g, xScale, yScale, xAxisG, yAxisG, legendG;
let width, height, margin;
let verticalLine, dotGroup;

let currentMode = "traffic";

const mallColorMap = new Map();
let globalTop5Malls = [];
const OTHERS_COLOR = "#B0B0B0";

// Format Number 
const localeVN = d3.formatLocale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["$", ""]
});

const formatIncome = localeVN.format("$,.0f"); // $47.840.345


// Tootip
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "area-tooltip")
    .style("position", "absolute")
    .style("background", "white")
    .style("border-radius", "12px")
    .style("padding", "14px 16px")
    .style("box-shadow", "0 8px 20px rgba(0,0,0,0.15)")
    .style("font-size", "14px")
    .style("line-height", "1.5")
    .style("opacity", 0)
    .style("pointer-events", "none");


/* =========================
   HELPERS
========================= */


// Format Number

function formatNumber(value) {
    return currentMode === "income"
        ? formatIncome(value)
        : localeVN.format(",.0f")(value);
}


// Age → Age group
function getAgeCluster(age) {
    age = +age;
    if (age <= 25) return "18-25";
    if (age <= 35) return "26-35";
    if (age <= 45) return "36-45";
    if (age <= 55) return "46-55";
    if (age <= 65) return "56-65";
    return "65+";
}

// Income segment
function getIncomeSegment(d, low, high) {
    const spend = d.quantity * d.price;
    if (spend >= high) return "High";
    if (spend >= low) return "Medium";
    return "Low";
}

/* =========================
   INIT
========================= */
export function initStackedAreaChart() {

    const container = document.getElementById("areachart-container");
    if (!container) return;

    container.innerHTML = "";

    margin = { top: 40, right: 140, bottom: 50, left: 110 };
    width = container.clientWidth - margin.left - margin.right;
    height = 420 - margin.top - margin.bottom;


    svg = d3.select(container)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    svg.append("defs").attr("id", "area-gradients");


    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    verticalLine = g.append("line")
        .attr("class", "vertical-guideline")
        .attr("y1", 0)
        .attr("y2", height)
        .style("opacity", 0);

    dotGroup = g.append("g")
        .attr("class", "dot-group")
        .style("opacity", 0);


    /* ===== X AXIS ===== */
    xScale = d3.scalePoint()
        .domain(["18-25", "26-35", "36-45", "46-55", "56-65", "65+"])
        .range([0, width]);

    yScale = d3.scaleLinear().range([height, 0]);

    xAxisG = g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    yAxisG = g.append("g");

    /* ===== Y LABEL ===== */
    svg.append("text")
        .attr("class", "y-label")
        .attr("x", -(height / 2))
        .attr("y", 20)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle");

    /* ===== LEGEND ===== */
    legendG = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width + margin.left + 20}, ${margin.top})`);

    /* ===== MODE SWITCH ===== */
    d3.selectAll("input[name='areaMode']")
        .on("change", e => {
            currentMode = e.target.value;
            drawStackedAreaChart(drawStackedAreaChart.lastData);
        });
        
}

/* =========================
   DRAW
========================= */
export function drawStackedAreaChart(data) {

    if (!data || data.length === 0) return;
    drawStackedAreaChart.lastData = data;

    const ageBins = xScale.domain();
    const mallsInData = [...new Set(data.map(d => d.shopping_mall))];

    /* =========================
       MODE: TRAFFIC
    ========================= */
    if (currentMode === "traffic") {

        let keys = [];
        let aggregated = [];

        /* ===== FILTER MODE ===== */
        if (mallsInData.length <= 5) {

            keys = mallsInData;

            aggregated = ageBins.map(age => {
                const row = { age };
                keys.forEach(mall => {
                    row[mall] = data.filter(d =>
                        getAgeCluster(d.age) === age &&
                        d.shopping_mall === mall
                    ).length;
                });
                return row;
            });
        }

        /* ===== OVERVIEW MODE ===== */
        else {
            const top5 = d3.rollups(
                data,
                v => v.length,
                d => d.shopping_mall
            )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(d => d[0]);

            globalTop5Malls = top5;

            keys = [...top5, "Others"];

            aggregated = ageBins.map(age => {
                const row = { age };

                top5.forEach(mall => {
                    row[mall] = data.filter(d =>
                        getAgeCluster(d.age) === age &&
                        d.shopping_mall === mall
                    ).length;
                });

                row["Others"] = data.filter(d =>
                    getAgeCluster(d.age) === age &&
                    !top5.includes(d.shopping_mall)
                ).length;

                return row;
            });
        }

        renderStack(aggregated, keys, "Number of Visitors");
    }

    /* =========================
       MODE: INCOME
    ========================= */
    else {

        const spends = data.map(d => d.quantity * d.price).sort(d3.ascending);
        const low = d3.quantile(spends, 0.33);
        const high = d3.quantile(spends, 0.66);

        const keys = ["Low", "Medium", "High"];

        const aggregated = ageBins.map(age => {
            const row = { age, Low: 0, Medium: 0, High: 0 };

            data.filter(d => getAgeCluster(d.age) === age)
                .forEach(d => {
                    const seg = getIncomeSegment(d, low, high);
                    row[seg] += d.quantity * d.price;
                });

            return row;
        });

        renderStack(aggregated, keys, "Total Income");
    }
}

/* =========================
   STACK + LEGEND
========================= */
function renderStack(data, keys, yLabel) {

    const stack = d3.stack().keys(keys);
    const series = stack(data);
    const incomeColorMap = {
        Low: "#ff0000ff",      // red
        Medium: "#FFC107",   // yellow
        High: "#55c54bff"      // green
    };

    const title = d3.select("#area-title");
    const subtitle = d3.select("#area-subtitle");

    if (currentMode === "income") {
        title.html(`
            <i class="fa-solid fa-layer-group"></i>
            Total Income by Age Group
        `);
        subtitle.text("Income distribution across customer age clusters");
    } else {
        title.html(`
            <i class="fa-solid fa-layer-group"></i>
            Shopping Mall Traffic by Age Group
        `);
        subtitle.text("Customer distribution across shopping malls by age cluster");
}


    // Vertical Guideline
    verticalLine = g.append("line")
        .attr("class", "vertical-guideline")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 4")
        .style("opacity", 0)
        .style("pointer-events", "none");

    // Dot Group
    dotGroup = g.append("g")
        .attr("class", "dot-group")
        .style("opacity", 0)
        .style("pointer-events", "none");
    


    yScale.domain([
        0,
        d3.max(data, d => d3.sum(keys, k => d[k]))
    ]).nice();

    yAxisG.transition().duration(600).call(d3.axisLeft(yScale));
    const yLabelText =
        yLabel === "Number of Visitors"
            ? "Visitors"
            : yLabel;

    svg.select(".y-label")
        .text(yLabelText)
        .attr("fill", "#475569")
        .style("font-size", "15px")
        .style("font-weight", "700")
        .style("letter-spacing", "0.5px");


    /* ===== COLOR LOGIC ===== */
    const color = d3.scaleOrdinal()
    .domain(keys)
    .range(keys.map(k => {

        // ===== INCOME MODE =====
        if (currentMode === "income") {
            return incomeColorMap[k];
        }

        // ===== TRAFFIC MODE =====
        if (k === "Others") return OTHERS_COLOR;

        if (
            globalTop5Malls.length &&
            !globalTop5Malls.includes(k)
        ) {
            return OTHERS_COLOR;
        }

        if (!mallColorMap.has(k)) {
            mallColorMap.set(
                k,
                d3.schemeSet2[mallColorMap.size % d3.schemeSet2.length]
            );
        }

        return mallColorMap.get(k);
    }));


    /* ===== GRADIENTS ===== */
    const defs = svg.select("#area-gradients");
    defs.selectAll("*").remove();

    keys.forEach(k => {
        const baseColor = color(k);

        const gradient = defs.append("linearGradient")
            .attr("id", `gradient-${k.replace(/\s+/g, "")}`)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%");

        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", baseColor)
            .attr("stop-opacity", currentMode === "income" ? 0.95 : 0.85);

        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", baseColor)
            .attr("stop-opacity", currentMode === "income" ? 0.35 : 0.25);
    });


    /* ===== AREA ===== */
    const area = d3.area()
    .x(d => xScale(d.data.age))
    .y0(d => yScale(d[0]))
    .y1(d => yScale(d[1]))
    .curve(d3.curveMonotoneX);

g.selectAll(".layer")
    .data(series, d => d.key)
    .join(
        enter => enter
            .append("path")
            .attr("class", "layer")
            .attr("fill", d => `url(#gradient-${d.key.replace(/\s+/g, "")})`)
            .attr("stroke", d => color(d.key))
            .attr("stroke-width", 1.2)
            .attr("opacity", 0.85)
            .attr("d", area),

        update => update
            .transition()
            .duration(700)
            .attr("fill", d => `url(#gradient-${d.key.replace(/\s+/g, "")})`)
            .attr("stroke", d => color(d.key))
            .attr("d", area),

        exit => exit.remove()
    )
    .on("mousemove", function (event, d) {

        const [mx] = d3.pointer(event, g.node());

        const age = xScale.domain().reduce((a, b) =>
            Math.abs(xScale(b) - mx) < Math.abs(xScale(a) - mx) ? b : a
        );

        const row = data.find(r => r.age === age);
        if (!row) return;

        const x = xScale(age);
        const total = d3.sum(keys, k => row[k]);

        verticalLine
            .attr("x1", x)
            .attr("x2", x)
            .style("opacity", 1);

        dotGroup.style("opacity", 1);
        dotGroup.selectAll("*").remove();

        let yAcc = 0;
        keys.forEach(k => {
            yAcc += row[k];
            dotGroup.append("circle")
                .attr("cx", x)
                .attr("cy", yScale(yAcc))
                .attr("r", 4.5)
                .attr("fill", color(k))
                .attr("stroke", "#fff")
                .attr("stroke-width", 1.5);
        });

        tooltip
            .style("opacity", 1)
            .style("left", (event.pageX + 14) + "px")
            .style("top", (event.pageY - 20) + "px")
            .html(`
                <div class="title">Age Cluster: ${age}</div>
                ${keys.map(k => `
                    <div style="color:${color(k)}">
                        ${k}: ${formatNumber(row[k])}
                    </div>
                `).join("")}
                <div><b>Total:</b> ${formatNumber(total)}</div>
            `);
    })
    .on("mouseleave", () => {
        tooltip.style("opacity", 0);
        verticalLine.style("opacity", 0);
        dotGroup.style("opacity", 0);
    });


    /* ===== LEGEND ===== */
   legendG.selectAll("*").remove();

const DEFAULT_OPACITY = 0.85;
const FADE_OPACITY = 0.2;

const legendItem = legendG.selectAll(".legend-item")
    .data(keys)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(0, ${i * 22})`)
    .style("cursor", "pointer")

    .on("mouseenter", function (event, key) {

        g.selectAll(".layer")
            .transition()
            .duration(200)
            .attr("opacity", FADE_OPACITY);

        g.selectAll(".layer")
            .filter(d => d.key === key)
            .transition()
            .duration(200)
            .attr("opacity", 1);
    })

    .on("mouseleave", function () {

        g.selectAll(".layer")
            .transition()
            .duration(200)
            .attr("opacity", DEFAULT_OPACITY);
    });

legendItem.append("rect")
    .attr("width", 14)
    .attr("height", 14)
    .attr("rx", 3)
    .attr("fill", d => color(d));

legendItem.append("text")
    .attr("x", 20)
    .attr("y", 11)
    .style("font-size", "12px")
    .style("dominant-baseline", "middle")
    .text(d => d);
}

