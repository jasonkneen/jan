// Terminal split pane and tab system types

export interface TerminalSession {
  id: string
  title?: string
}

export type SplitDirection = 'horizontal' | 'vertical'

export interface TerminalPane {
  id: string
  type: 'terminal'
  sessionId: string
  title?: string
}

export interface SplitPane {
  id: string
  type: 'split'
  direction: SplitDirection
  children: [TerminalTreeNode, TerminalTreeNode]
  sizes?: [number, number] // Percentage sizes [0-100]
}

export type TerminalTreeNode = TerminalPane | SplitPane

export interface TerminalTab {
  id: string
  title: string
  rootNode: TerminalTreeNode
  active?: boolean
}

export interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
}

export interface TerminalTheme {
  name: string
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface TerminalSettings {
  theme: string
  fontSize: number
  fontFamily: string
  lineHeight: number
  scrollbackLines: number
  cursorBlink: boolean
  defaultShell?: string
}
