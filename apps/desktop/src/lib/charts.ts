import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  ArcElement,
  RadialLinearScale,
} from 'chart.js'
import type { Theme } from '../context/ThemeContext'

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
)

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const FALLBACK = {
  text: '#627d98',
  textStrong: '#102a43',
  border: '#d9e2ec',
  panel: '#ffffff',
  accent: '#4f46e5',
  accentHover: '#4338ca',
  success: '#059669',
  danger: '#e11d48',
  warn: '#d97706',
}

export interface ChartTheme {
  text: string
  textStrong: string
  border: string
  panel: string
  accent: string
  accentHover: string
  success: string
  danger: string
  warn: string
}

export function getChartTheme(): ChartTheme {
  return {
    text: cssVar('--muted', FALLBACK.text),
    textStrong: cssVar('--text-strong', FALLBACK.textStrong),
    border: cssVar('--border', FALLBACK.border),
    panel: cssVar('--panel', FALLBACK.panel),
    accent: cssVar('--accent', FALLBACK.accent),
    accentHover: cssVar('--accent-hover', FALLBACK.accentHover),
    success: cssVar('--success', FALLBACK.success),
    danger: cssVar('--danger', FALLBACK.danger),
    warn: cssVar('--warn', FALLBACK.warn),
  }
}

export function applyChartTheme(theme: Theme) {
  void theme
  const t = getChartTheme()

  ChartJS.defaults.color = t.text
  ChartJS.defaults.borderColor = t.border

  ChartJS.defaults.plugins.tooltip.backgroundColor = t.panel
  ChartJS.defaults.plugins.tooltip.borderColor = t.border
  ChartJS.defaults.plugins.tooltip.borderWidth = 1
  ChartJS.defaults.plugins.tooltip.titleColor = t.textStrong
  ChartJS.defaults.plugins.tooltip.bodyColor = t.textStrong
  ChartJS.defaults.plugins.tooltip.cornerRadius = 8
  ChartJS.defaults.plugins.tooltip.padding = 12

  const datasets = ChartJS.defaults.datasets as { color?: string; borderColor?: string }
  datasets.color = t.accent
  datasets.borderColor = t.accent
}

// Apply default light theme on module load
applyChartTheme('light')
