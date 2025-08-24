import { useState, useCallback, useEffect } from 'react'
import { useTerminalState } from '@/hooks/useTerminalState'
import TerminalTreeRenderer from '@/components/terminal/TerminalTreeRenderer'
import { Button } from '@/components/ui/button'
import {
  IconPlus,
  IconX,
  IconLayoutBoardSplit,
  IconColumns,
  IconTerminal,
  IconSettings,
  IconRefresh,
} from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TerminalPageProps {}

export default function TerminalPage({}: TerminalPageProps) {
  const {
    tabs,
    activeTabId,
    createTab,
    switchTab,
    closeTab,
    splitPane,
    closePane,
    updateSplitSizes,
    terminalRefs,
  } = useTerminalState()

  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [mainMenuOpen, setMainMenuOpen] = useState(false)

  const activeTab = tabs.find(tab => tab.id === activeTabId)

  const handleCreateTab = useCallback(async () => {
    if (isCreatingSession) return
    
    setIsCreatingSession(true)
    try {
      await createTab()
    } catch (error) {
      console.error('Failed to create new tab:', error)
    } finally {
      setIsCreatingSession(false)
    }
  }, [createTab, isCreatingSession])

  const handleSplitPane = useCallback(async (paneId: string, direction: 'horizontal' | 'vertical') => {
    if (isCreatingSession) return
    
    setIsCreatingSession(true)
    try {
      await splitPane(paneId, direction)
    } catch (error) {
      console.error('Failed to split pane:', error)
    } finally {
      setIsCreatingSession(false)
    }
  }, [splitPane, isCreatingSession])

  // Create initial tab if none exist
  useEffect(() => {
    if (tabs.length === 0 && !isCreatingSession) {
      handleCreateTab()
    }
  }, [tabs.length, isCreatingSession, handleCreateTab])

  const handleTabAction = (action: string) => {
    switch (action) {
      case 'split-horizontal':
        if (activeTab?.rootNode.type === 'terminal') {
          handleSplitPane(activeTab.rootNode.id, 'horizontal')
        }
        break
      case 'split-vertical':
        if (activeTab?.rootNode.type === 'terminal') {
          handleSplitPane(activeTab.rootNode.id, 'vertical')
        }
        break
      case 'new-tab':
        handleCreateTab()
        break
      case 'close-tab':
        if (activeTab) {
          closeTab(activeTab.id)
        }
        break
      case 'clear':
        // Clear all terminals in current tab
        const clearAllTerminals = (node: any) => {
          if (node.type === 'terminal') {
            const terminal = terminalRefs.get(node.id)
            if (terminal) {
              terminal.clear()
            }
          } else if (node.children) {
            node.children.forEach(clearAllTerminals)
          }
        }
        if (activeTab) {
          clearAllTerminals(activeTab.rootNode)
        }
        break
    }
    setMainMenuOpen(false)
  }

  const getPaneCount = (node: any): number => {
    if (node.type === 'terminal') {
      return 1
    }
    return node.children.reduce((count: number, child: any) => count + getPaneCount(child), 0)
  }

  return (
    <div className="flex flex-col h-full bg-main-view-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-main-view-border bg-main-view-header">
        <div className="flex items-center gap-2">
          <IconTerminal size={20} className="text-main-view-fg" />
          <h1 className="text-lg font-semibold text-main-view-fg">Terminal</h1>
          {activeTab && getPaneCount(activeTab.rootNode) > 1 && (
            <Badge variant="secondary" className="text-xs">
              {getPaneCount(activeTab.rootNode)} panes
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Main actions dropdown */}
          <DropdownMenu open={mainMenuOpen} onOpenChange={setMainMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <IconSettings size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleTabAction('new-tab')}>
                <IconPlus size={16} />
                <span>New Tab</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleTabAction('split-horizontal')}>
                <IconLayoutBoardSplit size={16} />
                <span>Split Horizontally</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabAction('split-vertical')}>
                <IconColumns size={16} />
                <span>Split Vertically</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleTabAction('clear')}>
                <IconRefresh size={16} />
                <span>Clear All</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabAction('close-tab')}>
                <IconX size={16} />
                <span>Close Tab</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New tab button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCreateTab}
            disabled={isCreatingSession}
            className="h-8"
          >
            <IconPlus size={14} />
            {isCreatingSession ? 'Creating...' : 'New Tab'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTabId || undefined} className="flex-1 flex flex-col min-h-0">
            {/* Tab list */}
            {tabs.length > 1 && (
              <TabsList className="w-fit mx-4 mt-2">
                {tabs.map((tab: any, index: number) => (
                  <div key={tab.id} className="relative">
                    <TabsTrigger
                      value={tab.id}
                      onClick={() => switchTab(tab.id)}
                      className="pr-8"
                    >
                      <IconTerminal size={14} className="mr-1" />
                      {tab.name || `Terminal ${index + 1}`}
                    </TabsTrigger>
                    {tabs.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.id)
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
                      >
                        <IconX size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </TabsList>
            )}

            {/* Tab content */}
            {tabs.map((tab: any) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="flex-1 m-0 p-0 data-[state=active]:flex data-[state=inactive]:hidden flex-col"
              >
                <div className="flex-1">
                  <TerminalTreeRenderer
                    node={tab.rootNode}
                    onSplitPane={handleSplitPane}
                    onClosePane={closePane}
                    onUpdateSizes={updateSplitSizes}
                    terminalRefs={terminalRefs}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Empty state */}
      {tabs.length === 0 && !isCreatingSession && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <IconTerminal size={64} className="mx-auto text-main-view-fg/30 mb-4" />
            <h2 className="text-xl font-semibold text-main-view-fg mb-2">No Terminal Session</h2>
            <p className="text-main-view-fg/60 mb-4">Create a new terminal tab to get started</p>
            <Button onClick={handleCreateTab}>
              <IconPlus size={16} className="mr-2" />
              Create Terminal
            </Button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {tabs.length === 0 && isCreatingSession && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-main-view-fg mx-auto mb-4"></div>
            <p className="text-main-view-fg/60">Creating terminal session...</p>
          </div>
        </div>
      )}
    </div>
  )
}
