import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";

//COLORS
const COLORS = {
    gender: {
        Male: "#2563eb",     
        Female: "#ec4899"   
    },
    payment: {
        Cash: "#9ca3af",
        "Credit Card": "#22c55e",
        "Debit Card": "#f97316"
    },
    category: [
        "#60a5fa", "#34d399", "#fbbf24",
        "#a78bfa", "#fb7185", "#38bdf8"
    ]
};

//TOOLTIP
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "sankey-tooltip")
    .style("position", "fixed")
    .style("pointer-events", "none")
    .style("background", "#fff")
    .style("border", "1px solid #e5e7eb")
    .style("border-radius", "8px")
    .style("padding", "10px 12px")
    .style("font-size", "12px")
    .style("box-shadow", "0 10px 25px rgba(0,0,0,.1)")
    .style("opacity", 0);

//INIT
let svg, width, height;

export function initSankeyDiagram() {
    width = 960;
    height = 520;

    svg = d3.select("#sankey-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
}

//DRAW
export function drawSankeyDiagram(data) {

    svg.selectAll("*").remove();

    if (!data || !data.length) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#94a3b8")
            .text("No data available");
        return;
    }

    //AGGREGATE
    const rolled = d3.rollups(
        data,
        v => d3.sum(v, d => d.price * d.quantity),
        d => d.gender,
        d => d.category,
        d => d.payment_method
    );

    const nodes = [];
    const links = [];
    const nodeIndex = new Map();

    const getNode = (name, type) => {
        const key = `${type}-${name}`;
        if (!nodeIndex.has(key)) {
            nodeIndex.set(key, nodes.length);
            nodes.push({ name, type });
        }
        return nodeIndex.get(key);
    };

    rolled.forEach(([gender, catArr]) => {
        catArr.forEach(([category, payArr]) => {
            payArr.forEach(([payment, value]) => {
                if (!value) return;
                links.push({
                    source: getNode(gender, "gender"),
                    target: getNode(category, "category"),
                    value,
                    gender
                });
                links.push({
                    source: getNode(category, "category"),
                    target: getNode(payment, "payment"),
                    value,
                    gender
                });
            });
        });
    });

    //SANKEY
    const sankeyGen = sankey()
        .nodeWidth(18)
        .nodePadding(16)
        .extent([[1, 1], [width - 1, height - 6]]);

    const graph = sankeyGen({
        nodes: nodes.map(d => ({ ...d })),
        links
    });

    //LINKS
    svg.append("g")
        .selectAll("path")
        .data(graph.links)
        .enter()
        .append("path")
        .attr("d", sankeyLinkHorizontal())
        .attr("fill", "none")
        .attr("stroke", d => COLORS.gender[d.gender] || "#999")
        .attr("stroke-width", d => Math.max(2, d.width))
        .attr("opacity", 0.35)
        .style("pointer-events", "stroke")
        .on("mouseenter", (e, d) => {
            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.source.name} → ${d.target.name}</strong><br/>
                    Revenue: $${d.value.toLocaleString()}
                `);
        })
        .on("mousemove", e => {
            tooltip
                .style("left", e.clientX + 12 + "px")
                .style("top", e.clientY + 12 + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

    //NODES
    svg.append("g")
        .selectAll("rect")
        .data(graph.nodes)
        .enter()
        .append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => d.y1 - d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("rx", 4)
        .attr("fill", d => {
            if (d.type === "gender") return COLORS.gender[d.name];
            if (d.type === "payment") return COLORS.payment[d.name] || "#999";
            return COLORS.category[d.index % COLORS.category.length];
        })
        .on("mouseenter", (e, d) => {
            tooltip
                .style("opacity", 1)
                .html(`<strong>${d.name}</strong>`);
        })
        .on("mousemove", e => {
            tooltip
                .style("left", e.clientX + 12 + "px")
                .style("top", e.clientY + 12 + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

    //LABELS
    svg.append("g")
        .selectAll("text")
        .data(graph.nodes)
        .enter()
        .append("text")
        .attr("x", d => d.x0 - 6)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#334155")
        .text(d => d.name);
}
