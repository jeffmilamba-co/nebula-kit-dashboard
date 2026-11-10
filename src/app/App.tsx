import { useData, DataProvider } from './DataProvider.tsx'
import { DerivedProvider, useDerived } from './derived.tsx'
import { FilterBar } from '../layout/FilterBar.tsx'
import { TopNav } from '../layout/TopNav.tsx'
import { Button } from '../ui/Button.tsx'
import { DataView } from '../views/DataView.tsx'
import { FollowUpView } from '../views/FollowUpView.tsx'
import { OrdersView } from '../views/OrdersView.tsx'
import { OverviewView } from '../views/OverviewView.tsx'
import { TurnaroundView } from '../views/TurnaroundView.tsx'

function Routes() {
  const { loc, linkTo } = useDerived()
  const [, section = '', id] = loc.path.split('/')
  switch (section) {
    case '':
      return <OverviewView />
    case 'turnaround':
      return <TurnaroundView />
    case 'follow-up':
      return <FollowUpView />
    case 'orders':
      return <OrdersView orderId={id ? decodeURIComponent(id) : null} />
    case 'data':
      return <DataView />
    default:
      return (
        <div className="mx-auto max-w-[1128px] px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Page not found</h1>
          <a className="mt-2 inline-block font-semibold text-brand hover:underline" href={linkTo('/')}>
            Go to the overview
          </a>
        </div>
      )
  }
}

function Shell() {
  const data = useData()
  if (!data.model) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[400px] rounded-lg bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex size-12 items-center justify-center rounded bg-brand text-2xl font-bold text-white">N</span>
          {data.status === 'error' ? (
            <>
              <h1 className="mt-3 text-lg font-semibold">Couldn’t load the sample data</h1>
              <ul className="mt-1 text-sm text-ink-2">{data.error?.map((e) => <li key={e}>{e}</li>)}</ul>
              <Button variant="primary" className="mt-4" onClick={() => void data.loadSample()}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-lg font-semibold">Loading kit data…</h1>
              <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-[#e8e6e1]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <DerivedProvider model={data.model}>
      <div className="min-h-screen">
        <TopNav />
        <FilterBar />
        {data.busy && <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-brand" role="progressbar" aria-label="Loading data" />}
        <main className={data.busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Routes />
        </main>
        <footer className="mx-auto max-w-[1128px] px-4 pb-8 text-center text-xs text-ink-3">
          Kit Ops · built for the Nebula Genomics take-home on synthetic data · files you load stay in your browser
        </footer>
      </div>
    </DerivedProvider>
  )
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}
