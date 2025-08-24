import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import TerminalEmulator, { TerminalHandle } from './TerminalEmulator'
import SplitPane from './SplitPane'
import { TerminalTreeNode, TerminalPane, SplitPane as SplitPaneType } from '@/types/terminal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { IconDots, IconLayoutBoardSplit, IconColumns, IconX } from '@tabler/icons-react'

interface TerminalOutputEvent {
  session_id: string
  data: string
}

interface TerminalTreeRendererProps {
  node: TerminalTreeNode
  onSplitPane: (paneId: string, direction: 'horizontal' | 'vertical') => void
  onClosePane: (paneId: string) => void
  onUpdateSizes: (splitId: string, sizes: [number, number]) => void
  terminalRefs: Map<string, TerminalHandle>
}

function TerminalPaneComponent({
  pane,
  onSplitPane,
  onClosePane,
  terminalRefs,
}: {
  pane: TerminalPane
  onSplitPane: (paneId: string, direction: 'horizontal' | 'vertical') => void
  onClosePane: (paneId: string) => void
  terminalRefs: Map<string, TerminalHandle>
}) {
  const terminalRef = useRef<TerminalHandle>(null)
  const isInitialized = useRef<boolean>(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  // Store terminal ref in the map
  useEffect(() => {
    if (terminalRef.current) {
      terminalRefs.set(pane.id, terminalRef.current)
    }
    return () => {
      terminalRefs.delete(pane.id)
    }
  }, [pane.id, terminalRefs])

  // Listen for terminal output
  useEffect(() => {
    if (!pane.sessionId) return

    const unlisten = listen<TerminalOutputEvent>('terminal-output', (event) => {
      const { session_id, data } = event.payload
      if (session_id === pane.sessionId && terminalRef.current) {
        try {
          terminalRef.current.writeData(data)
        } catch (error) {
          console.error('Failed to write terminal output:', error)
        }
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [pane.sessionId])

  // Initialize terminal with a prompt - only once per session
  useEffect(() => {
    if (pane.sessionId && !isInitialized.current) {
      isInitialized.current = true
      setTimeout(async () => {
        try {
          await invoke('terminal_write', { sessionId: pane.sessionId, data: '\r' })
        } catch (error) {
          console.error('Failed to send initial newline:', error)
        }
      }, 200)
    }
  }, [pane.sessionId])

  const handleData = async (data: string) => {
    if (!pane.sessionId) return

    try {
      await invoke('terminal_write', { sessionId: pane.sessionId, data })
    } catch (error) {
      console.error('Failed to write to terminal:', error)
    }
  }

  const handleResize = async (cols: number, rows: number) => {
    if (!pane.sessionId) return

    try {
      await invoke('terminal_resize', { sessionId: pane.sessionId, cols, rows })
    } catch (error) {
      console.error('Failed to resize terminal:', error)
    }
  }

  return (
    <div className="relative h-full w-full group flex flex-col">
      {/* Context menu trigger */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded bg-main-view-fg/10 hover:bg-main-view-fg/20">
              <IconDots size={14} className="text-main-view-fg" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSplitPane(pane.id, 'horizontal')}>
              <IconLayoutBoardSplit size={16} />
              <span>Split Horizontally</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSplitPane(pane.id, 'vertical')}>
              <IconColumns size={16} />
              <span>Split Vertically</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onClosePane(pane.id)}
              className="text-red-600 focus:text-red-600"
            >
              <IconX size={16} />
              <span>Close Pane</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-auto" style={{ marginLeft: '7px', marginBottom: '15px' }}>
        <div className="rounded-md h-full min-h-0">
          <TerminalEmulator
            ref={terminalRef}
            onData={handleData}
            onResize={handleResize}
            className="h-full rounded-md"
          />
        </div>
      </div>
    </div>
  )
}

export default function TerminalTreeRenderer({
  node,
  onSplitPane,
  onClosePane,
  onUpdateSizes,
  terminalRefs,
}: TerminalTreeRendererProps) {
  if (node.type === 'terminal') {
    return (
      <TerminalPaneComponent
        pane={node}
        onSplitPane={onSplitPane}
        onClosePane={onClosePane}
        terminalRefs={terminalRefs}
      />
    )
  }

  // Split pane
  const splitPane = node as SplitPaneType

  return (
    <SplitPane
      direction={splitPane.direction}
      sizes={splitPane.sizes || [50, 50]}
      onSizesChange={(sizes) => onUpdateSizes(splitPane.id, sizes)}
    >
      <TerminalTreeRenderer
        key={splitPane.children[0].id}
        node={splitPane.children[0]}
        onSplitPane={onSplitPane}
        onClosePane={onClosePane}
        onUpdateSizes={onUpdateSizes}
        terminalRefs={terminalRefs}
      />
      <TerminalTreeRenderer
        key={splitPane.children[1].id}
        node={splitPane.children[1]}
        onSplitPane={onSplitPane}
        onClosePane={onClosePane}
        onUpdateSizes={onUpdateSizes}
        terminalRefs={terminalRefs}
      />
    </SplitPane>
  )
}
