'use client'

// Super-Sankey for the Integrated Reproduction tab (App C).
// Renders the 3x3 inter-department flow matrix as a d3-sankey diagram:
//   left column  = Dept I/II/III as sources (row totals)
//   right column = Dept I/II/III as destinations (column totals)
// Links come from the matrix cells (Dept i -> Dept j flow value).

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey'

const DEPT_META = [
  { id: 1, short: 'Dept I',    label: 'Dept I — Means of Production',     color: '#22d3ee' },
  { id: 2, short: 'Dept II',   label: 'Dept II — Means of Consumption',    color: '#ffb020' },
  { id: 3, short: 'Dept III',  label: 'Dept III — Money / Finance / State', color: '#f6465d' },
]

const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function SuperSankey({ data, unit = 'T ARS', height = 380 }) {
  const ref = useRef(null)
  const { matrix, row_totals, col_totals } = data || {}

  useEffect(() => {
    const container = ref.current
    if (!container || !matrix || !row_totals || !col_totals) return
    const width = container.clientWidth

    d3.select(container).selectAll('*').remove()
    d3.select(container).style('position', 'relative')

    const totalFlow = DEPT_META.reduce((s, d) => s + (row_totals[d.id] || 0), 0)
    const suffix = unit === 'B USD' ? 'B$' : 'T$'

    const left = DEPT_META.map((m) => ({ dept: m.id, name: m.short, full: m.label, value: row_totals[m.id] || 0, color: m.color }))
    const right = DEPT_META.map((m) => ({ dept: m.id, name: m.short, full: m.label, value: col_totals[m.id] || 0, color: m.color }))
    const nodes = [...left, ...right]

    const links = []
    DEPT_META.forEach((sd, i) => {
      DEPT_META.forEach((td, j) => {
        const v = matrix[sd.id]?.[td.id]
        if (v > 0) links.push({ source: i, target: left.length + j, value: v, sd: sd.id, td: td.id })
      })
    })

    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(10, 14, 26, 0.97)')
      .style('border', '1px solid rgba(255, 176, 32, 0.4)')
      .style('border-radius', '4px')
      .style('padding', '8px 10px')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('color', '#f1f5f9')
      .style('box-shadow', '0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,176,32,0.15)')
      .style('opacity', 0)
      .style('z-index', 100)
      .style('transition', 'opacity 0.12s')
      .style('max-width', '280px')

    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height)

    const defs = svg.append('defs')

    const sg = sankey()
      .nodeWidth(12)
      .nodePadding(22)
      .nodeAlign(sankeyJustify)
      .extent([[8, 8], [width - 8, height - 8]])

    const graph = sg({ nodes: nodes.map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) })

    graph.links.forEach((link, i) => {
      const g = defs.append('linearGradient')
        .attr('id', `super-sankey-grad-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', link.source.x1)
        .attr('x2', link.target.x0)
      g.append('stop').attr('offset', '0%').attr('stop-color', link.source.color).attr('stop-opacity', 0.95)
      g.append('stop').attr('offset', '100%').attr('stop-color', link.target.color).attr('stop-opacity', 0.6)
    })

    // Links
    svg.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (_, i) => `url(#super-sankey-grad-${i})`)
      .attr('stroke-width', (d) => Math.max(1, d.width))
      .style('stroke-opacity', 0.4)
      .on('mouseenter', function (event, d) {
        d3.select(this).style('stroke-opacity', 0.9)
        const sourcePct = ((d.value / (d.source.value || 1)) * 100).toFixed(1)
        const targetPct = ((d.value / (d.target.value || 1)) * 100).toFixed(1)
        const globalPct = ((d.value / (totalFlow || 1)) * 100).toFixed(2)
        tooltip.html(`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,176,32,0.25)">
            <span style="width:6px;height:6px;border-radius:50%;background:#ffb020;box-shadow:0 0 6px #ffb020"></span>
            <span style="color:#ffb020;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:9px">INTER-DEPARTMENT FLOW</span>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${d.source.color};font-weight:600">${d.source.full}</div>
            <div style="color:#64748b;text-align:center;margin:2px 0">↓</div>
            <div style="color:${d.target.color};font-weight:600">${d.target.full}</div>
          </div>
          <div style="display:grid;grid-template-columns:auto auto;gap:2px 8px;color:#94a3b8;font-size:10px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">
            <span>Volume:</span><span style="color:#f1f5f9;font-weight:600">${d.value.toFixed(2)}${suffix}</span>
            <span>% of source row:</span><span style="color:#22d3ee">${sourcePct}%</span>
            <span>% of target col:</span><span style="color:#22d3ee">${targetPct}%</span>
            <span>% of total flow:</span><span style="color:#ffb020">${globalPct}%</span>
          </div>
        `)
        tooltip.style('opacity', 1)
      })
      .on('mousemove', function (event) {
        const rect = container.getBoundingClientRect()
        const x = Math.min(event.clientX - rect.left + 14, width - 300)
        tooltip.style('left', x + 'px').style('top', (event.clientY - rect.top + 14) + 'px')
      })
      .on('mouseleave', function () {
        d3.select(this).style('stroke-opacity', 0.4)
        tooltip.style('opacity', 0)
      })

    // Nodes
    const nodeSel = svg.append('g')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', 'sankey-node')

    nodeSel.append('rect')
      .attr('x', (d) => d.x0)
      .attr('y', (d) => d.y0)
      .attr('height', (d) => Math.max(2, d.y1 - d.y0))
      .attr('width', (d) => d.x1 - d.x0)
      .attr('fill', (d) => d.color)
      .attr('rx', 1)
      .on('mouseenter', function (event, d) {
        const isSource = graph.nodes.indexOf(d) < left.length
        const outbound = (d.sourceLinks || []).length
        const inbound = (d.targetLinks || []).length
        const globalPct = ((d.value || 0) / (totalFlow || 1)) * 100
        tooltip.html(`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,176,32,0.25)">
            <span style="width:6px;height:6px;border-radius:50%;background:${d.color};box-shadow:0 0 6px ${d.color}"></span>
            <span style="color:#ffb020;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:9px">${isSource ? 'SOURCES · DEPT' : 'DESTINATIONS · DEPT'}</span>
          </div>
          <div style="color:#f1f5f9;font-weight:700;font-size:11px;margin-bottom:4px">${d.full}</div>
          <div style="display:grid;grid-template-columns:auto auto;gap:2px 8px;color:#94a3b8;font-size:10px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">
            <span>Volume:</span><span style="color:#f1f5f9;font-weight:600">${(d.value || 0).toFixed(2)}${suffix}</span>
            <span>% of total flow:</span><span style="color:#ffb020">${globalPct.toFixed(2)}%</span>
            <span>${isSource ? 'Outbound' : 'Inbound'} flows:</span><span style="color:#22d3ee">${isSource ? outbound : inbound}</span>
          </div>
        `)
        tooltip.style('opacity', 1)
      })
      .on('mousemove', function (event) {
        const rect = container.getBoundingClientRect()
        const x = Math.min(event.clientX - rect.left + 14, width - 300)
        tooltip.style('left', x + 'px').style('top', (event.clientY - rect.top + 14) + 'px')
      })
      .on('mouseleave', function () {
        tooltip.style('opacity', 0)
      })

    nodeSel.append('text')
      .attr('x', (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr('y', (d) => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
      .attr('fill', (d) => d.color)
      .attr('font-weight', 600)
      .style('pointer-events', 'none')
      .text((d) => `${d.name}  |  ${fmt(d.value || 0, 1)}${suffix}`)

    return () => d3.select(container).selectAll('*').remove()
  }, [matrix, row_totals, col_totals, unit, height])

  return <div ref={ref} className="w-full" />
}
