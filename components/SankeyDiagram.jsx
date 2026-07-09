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
  monetary: '#ffb020',    // Inflation tax  amber highlight
  debt: '#ef4444',
  social: '#10b981',
  subsidy: '#ffb020',
  transfer: '#94a3b8',
  operations: '#64748b',
}

export default function SankeyDiagram({ data, height = 480 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!data || !ref.current) return
    const container = ref.current
    const width = container.clientWidth

    // Clear
    d3.select(container).selectAll('*').remove()

    // Build node list (unique) and index map
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

    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height)

    // Gradient defs
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

    // Create gradients per link
    graph.links.forEach((link, i) => {
      const g = defs.append('linearGradient')
        .attr('id', `sankey-grad-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', link.source.x1)
        .attr('x2', link.target.x0)
      g.append('stop').attr('offset', '0%').attr('stop-color', CATEGORY_COLORS[link.sourceCategory] || '#64748b').attr('stop-opacity', 0.9)
      g.append('stop').attr('offset', '100%').attr('stop-color', CATEGORY_COLORS[link.target.category] || '#64748b').attr('stop-opacity', 0.7)
    })

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

    linkSel.append('title').text((d) => `${d.source.name}  ${d.target.name}\n${d.value.toFixed(1)}T ARS`)

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
      .append('title')
      .text((d) => `${d.name}\n${(d.value || 0).toFixed(1)}T ARS`)

    nodeSel.append('text')
      .attr('x', (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr('y', (d) => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
      .attr('fill', (d) => (d.category === 'monetary' || d.category === 'subsidy' ? '#ffb020' : '#e5e7eb'))
      .attr('font-weight', (d) => (d.category === 'monetary' || d.category === 'subsidy' ? 700 : 500))
      .text((d) => `${d.name}  |  ${(d.value || 0).toFixed(1)}T`)

  }, [data, height])

  return <div ref={ref} className="w-full" />
}
