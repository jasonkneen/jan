import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  TerminalState,
  TerminalTab,
  TerminalTreeNode,
  TerminalPane,
  SplitPane,
  SplitDirection,
} from '@/types/terminal'

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function useTerminalState() {
  const [state, setState] = useState<TerminalState>({
    tabs: [],
    activeTabId: null,
  })
  
  const terminalRefs = useRef<Map<string, any>>(new Map())

  const createTerminalSession = useCallback(async (): Promise<string> => {
    try {
      const sessionId = await invoke<string>('terminal_spawn', {
        shell: null,
        cols: 80,
        rows: 24
      })
      return sessionId
    } catch (error) {
      console.error('Failed to create terminal session:', error)
      throw error
    }
  }, [])

  const createTab = useCallback(async (title?: string): Promise<string> => {
    const sessionId = await createTerminalSession()
    const tabId = generateId()
    const paneId = generateId()
    
    const rootPane: TerminalPane = {
      id: paneId,
      type: 'terminal',
      sessionId,
      title: title || 'Terminal',
    }

    const newTab: TerminalTab = {
      id: tabId,
      title: title || `Terminal`,
      rootNode: rootPane,
      active: true,
    }

    setState(prev => ({
      tabs: [...prev.tabs.map(tab => ({ ...tab, active: false })), newTab],
      activeTabId: tabId,
    }))

    return tabId
  }, [createTerminalSession])

  const closeTab = useCallback(async (tabId: string) => {
    setState(prev => {
      const tab = prev.tabs.find(t => t.id === tabId)
      if (!tab) return prev

      // Kill all terminal sessions in this tab asynchronously
      const killNode = async (node: TerminalTreeNode) => {
        if (node.type === 'terminal') {
          try {
            await invoke('terminal_kill', { sessionId: node.sessionId })
          } catch (error) {
            console.error('Failed to kill terminal session:', error)
          }
        } else {
          await Promise.all(node.children.map(killNode))
        }
      }
      killNode(tab.rootNode) // Don't wait for this

      const newTabs = prev.tabs.filter(t => t.id !== tabId)
      const newActiveTabId = prev.activeTabId === tabId 
        ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
        : prev.activeTabId

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
      }
    })
  }, [])

  const switchTab = useCallback((tabId: string) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        active: tab.id === tabId,
      })),
      activeTabId: tabId,
    }))
  }, [])

  const splitPane = useCallback(async (
    paneId: string,
    direction: SplitDirection
  ): Promise<string> => {
    const sessionId = await createTerminalSession()
    const newPaneId = generateId()
    const splitId = generateId()

    const newPane: TerminalPane = {
      id: newPaneId,
      type: 'terminal',
      sessionId,
      title: 'Terminal',
    }

    setState(prev => {
      const updateNode = (node: TerminalTreeNode): TerminalTreeNode => {
        if (node.type === 'terminal' && node.id === paneId) {
          // Replace the terminal pane with a split pane
          const splitPane: SplitPane = {
            id: splitId,
            type: 'split',
            direction,
            children: [node, newPane],
            sizes: [50, 50],
          }
          return splitPane
        } else if (node.type === 'split') {
          return {
            ...node,
            children: [
              updateNode(node.children[0]),
              updateNode(node.children[1]),
            ] as [TerminalTreeNode, TerminalTreeNode],
          }
        }
        return node
      }

      return {
        ...prev,
        tabs: prev.tabs.map(tab => ({
          ...tab,
          rootNode: updateNode(tab.rootNode),
        })),
      }
    })

    return newPaneId
  }, [createTerminalSession])

  const closePane = useCallback(async (paneId: string) => {
    setState(prev => {
      const updateNode = (node: TerminalTreeNode): TerminalTreeNode | null => {
        if (node.type === 'terminal') {
          if (node.id === paneId) {
            // Kill the session
            invoke('terminal_kill', { sessionId: node.sessionId }).catch(console.error)
            return null // Mark for removal
          }
          return node
        } else {
          const newChildren = node.children.map(updateNode).filter(Boolean) as TerminalTreeNode[]
          
          if (newChildren.length === 0) {
            return null // Remove empty split
          } else if (newChildren.length === 1) {
            return newChildren[0] // Collapse split with single child
          } else {
            return {
              ...node,
              children: newChildren as [TerminalTreeNode, TerminalTreeNode],
            }
          }
        }
      }

      return {
        ...prev,
        tabs: prev.tabs.map(tab => {
          const updatedRootNode = updateNode(tab.rootNode)
          if (!updatedRootNode) {
            // If root node is removed, we need to handle this case
            return tab
          }
          return {
            ...tab,
            rootNode: updatedRootNode,
          }
        }),
      }
    })
  }, [])

  const updatePaneSizes = useCallback((splitId: string, sizes: [number, number]) => {
    setState(prev => {
      const updateNode = (node: TerminalTreeNode): TerminalTreeNode => {
        if (node.type === 'split' && node.id === splitId) {
          return { ...node, sizes }
        } else if (node.type === 'split') {
          return {
            ...node,
            children: [
              updateNode(node.children[0]),
              updateNode(node.children[1]),
            ] as [TerminalTreeNode, TerminalTreeNode],
          }
        }
        return node
      }

      return {
        ...prev,
        tabs: prev.tabs.map(tab => ({
          ...tab,
          rootNode: updateNode(tab.rootNode),
        })),
      }
    })
  }, [])

  const activeTab = state.tabs.find(tab => tab.id === state.activeTabId)

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    createTab,
    closeTab,
    switchTab,
    splitPane,
    closePane,
    updateSplitSizes: updatePaneSizes,
    terminalRefs: terminalRefs.current,
  }
}
