'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey'

const CATEGORY_COLORS = {
  consumption: '#22d3ee',
  direct: '#38bdf8',
  payroll: '#818cf8',
  trade: '#a78bfa',
  financial: '#f472b6',
  monetary: '#ffb020',
  debt: '#ef4444',
  social: '#10b981',
  subsidy: '#ffb020',
  transfer: '#94a3b8',
  operations: '#64748b',
}

const CATEGORY_LABEL = {
  consumption: 'Consumption Tax',
  direct: 'Direct Tax',
  payroll: 'Payroll Tax',
  trade: 'Trade Tax',
  financial: 'Financial Tax',
  monetary: 'Monetary Extraction',
  debt: 'Debt Financing',
  social: 'Social Transfer',
  subsidy: 'Sector Subsidy',
  transfer: 'Federal Transfer',
  operations: 'State Operations',
}

export default function SankeyDiagram({ data, height = 480, unit = 'T ARS' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!data || !ref.current) return
    const container = ref.current
    const width = container.clientWidth

    d3.select(container).selectAll('*').remove()

    const nodeNames = Array.from(new Set([
      ...data.sources.map((s) => s.name),
      ...data.destinations.map((d) => d.name),
    ]))

    const nodeCategoryMap = new Map()
    data.sources.forEach((s) => nodeCategoryMap.set(s.name, s.category))
    data.destinations.forEach((d) => nodeCategoryMap.set(d.name, d.category))

    const nodes = nodeNames.map((name) => ({ name, category: nodeCategoryMap.get(name) }))
    const idx = new Map(nodes.map((n, i) => [n.name, i]))
    const links = data.links
      .map((l) => ({
        source: idx.get(l.source),
        target: idx.get(l.target),
        value: l.value,
        sourceCategory: nodeCategoryMap.get(l.source),
      }))
      .filter((l) => l.source !== undefined && l.target !== undefined)

    const totalFlow = data.sources.reduce((s, x) => s + x.value, 0)

    // Position container relatively for tooltip absolute positioning
    d3.select(container).style('position', 'relative')

    // HTML tooltip overlay
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

    const sankeyGen = sankey()
      .nodeWidth(14)
      .nodePadding(10)
      .nodeAlign(sankeyJustify)
      .extent([[8, 8], [width - 8, height - 8]])

    const graph = sankeyGen({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    })

    graph.links.forEach((link, i) => {
      const g = defs.append('linearGradient')
        .attr('id', `sankey-grad-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', link.source.x1)
        .attr('x2', link.target.x0)
      g.append('stop').attr('offset', '0%').attr('stop-color', CATEGORY_COLORS[link.sourceCategory] || '#64748b').attr('stop-opacity', 0.9)
      g.append('stop').attr('offset', '100%').attr('stop-color', CATEGORY_COLORS[link.target.category] || '#64748b').attr('stop-opacity', 0.7)
    })

    const suffix = unit === 'B USD' ? 'B$' : (unit === 'T ARS' ? 'T$' : '')

    // Links
    const linkSel = svg.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('class', 'sankey-link')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (_, i) => `url(#sankey-grad-${i})`)
      .attr('stroke-width', (d) => Math.max(1, d.width))
      .on('mouseenter', function (event, d) {
        d3.select(this).style('stroke-opacity', 0.85)
        const sourcePct = ((d.value / (d.source.value || 1)) * 100).toFixed(1)
        const targetPct = ((d.value / (d.target.value || 1)) * 100).toFixed(1)
        const globalPct = ((d.value / totalFlow) * 100).toFixed(2)
        tooltip.html(`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,176,32,0.25)">
            <span style="width:6px;height:6px;border-radius:50%;background:#ffb020;box-shadow:0 0 6px #ffb020"></span>
            <span style="color:#ffb020;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:9px">FLOW LINK</span>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${CATEGORY_COLORS[d.sourceCategory] || '#94a3b8'};font-weight:600">${d.source.name}</div>
            <div style="color:#64748b;text-align:center;margin:2px 0">${''}</div>
            <div style="color:${CATEGORY_COLORS[d.target.category] || '#94a3b8'};font-weight:600">${d.target.name}</div>
          </div>
          <div style="display:grid;grid-template-columns:auto auto;gap:2px 8px;color:#94a3b8;font-size:10px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">
            <span>Volume:</span><span style="color:#f1f5f9;font-weight:600">${d.value.toFixed(2)}${suffix}</span>
            <span>% of source:</span><span style="color:#22d3ee">${sourcePct}%</span>
            <span>% of target:</span><span style="color:#22d3ee">${targetPct}%</span>
            <span>% of total flow:</span><span style="color:#ffb020">${globalPct}%</span>
          </div>
        `)
        tooltip.style('opacity', 1)
      })
      .on('mousemove', function (event) {
        const rect = container.getBoundingClientRect()
        const x = Math.min(event.clientX - rect.left + 14, width - 300)
        const y = event.clientY - rect.top + 14
        tooltip.style('left', x + 'px').style('top', y + 'px')
      })
      .on('mouseleave', function () {
        d3.select(this).style('stroke-opacity', 0.35)
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
      .attr('fill', (d) => CATEGORY_COLORS[d.category] || '#64748b')
      .attr('rx', 1)
      .on('mouseenter', function (event, d) {
        const isSource = data.sources.some((s) => s.name === d.name)
        const globalPct = ((d.value / totalFlow) * 100).toFixed(2)
        const catLabel = CATEGORY_LABEL[d.category] || d.category
        const inbound = (d.targetLinks || []).length
        const outbound = (d.sourceLinks || []).length
        tooltip.html(`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,176,32,0.25)">
            <span style="width:6px;height:6px;border-radius:50%;background:${CATEGORY_COLORS[d.category] || '#94a3b8'};box-shadow:0 0 6px ${CATEGORY_COLORS[d.category] || '#94a3b8'}"></span>
            <span style="color:#ffb020;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:9px">${isSource ? 'INFLOW SOURCE' : 'OUTFLOW SINK'}</span>
          </div>
          <div style="color:#f1f5f9;font-weight:700;font-size:11px;margin-bottom:4px">${d.name}</div>
          <div style="color:${CATEGORY_COLORS[d.category] || '#94a3b8'};font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${catLabel}</div>
          <div style="display:grid;grid-template-columns:auto auto;gap:2px 8px;color:#94a3b8;font-size:10px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">
            <span>Volume:</span><span style="color:#f1f5f9;font-weight:600">${(d.value || 0).toFixed(2)}${suffix}</span>
            <span>% of total flow:</span><span style="color:#ffb020">${globalPct}%</span>
            <span>${isSource ? 'Outbound' : 'Inbound'} links:</span><span style="color:#22d3ee">${isSource ? outbound : inbound}</span>
          </div>
        `)
        tooltip.style('opacity', 1)
      })
      .on('mousemove', function (event) {
        const rect = container.getBoundingClientRect()
        const x = Math.min(event.clientX - rect.left + 14, width - 300)
        const y = event.clientY - rect.top + 14
        tooltip.style('left', x + 'px').style('top', y + 'px')
      })
      .on('mouseleave', function () {
        tooltip.style('opacity', 0)
      })

    nodeSel.append('text')
      .attr('x', (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr('y', (d) => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
      .attr('fill', (d) => (d.category === 'monetary' || d.category === 'subsidy' ? '#ffb020' : '#e5e7eb'))
      .attr('font-weight', (d) => (d.category === 'monetary' || d.category === 'subsidy' ? 700 : 500))
      .style('pointer-events', 'none')
      .text((d) => `${d.name}  |  ${(d.value || 0).toFixed(1)}${suffix}`)

  }, [data, height, unit])

  return <div ref={ref} className="w-full" />
}
