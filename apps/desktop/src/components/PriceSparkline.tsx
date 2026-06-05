import { useEffect, useRef } from 'react'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler)

interface Props {
  values: number[]
  width?: number
  height?: number
  positive?: boolean
}

export function PriceSparkline({ values, width = 90, height = 28, positive }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
    if (!values || values.length < 2) return
    const isUp = positive === undefined
      ? values[values.length - 1] >= values[0]
      : positive
    const color = isUp ? '#059669' : '#e11d48'
    const ctx = ref.current.getContext('2d')
    if (!ctx) return
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, isUp ? 'rgba(5, 150, 105, 0.30)' : 'rgba(225, 29, 72, 0.30)')
    grad.addColorStop(1, isUp ? 'rgba(5, 150, 105, 0.00)' : 'rgba(225, 29, 72, 0.00)')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: values.map((_, i) => i),
        datasets: [
          {
            data: values,
            borderColor: color,
            backgroundColor: grad,
            borderWidth: 1.5,
            fill: true,
            pointRadius: 0,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    })
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [values, width, height, positive])

  return <canvas ref={ref} width={width} height={height} className="priceSparkline" />
}
