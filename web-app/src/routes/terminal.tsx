import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import TerminalPage from '@/pages/TerminalPage'
import 'xterm/css/xterm.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.terminal as any)({
  component: TerminalPage,
})
