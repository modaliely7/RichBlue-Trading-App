import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string | number
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  emptyState?: ReactNode
  loading?: boolean
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  loading = false,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="loadingState centered">
        <div className="loadingSpinner" />
        <span>Loading…</span>
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  if (rows.length === 0) {
    return (
      <div className="emptyState">
        <div className="title">No data</div>
      </div>
    )
  }

  return (
    <div className="tableWrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  width: c.width,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? 'left' }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
