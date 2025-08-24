import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'

interface TerminalEmulatorProps {
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  className?: string
}

export interface TerminalHandle {
  writeData: (data: string) => void
  clear: () => void
  focus: () => void
}

const TerminalEmulator = forwardRef<TerminalHandle, TerminalEmulatorProps>((
  { onData, onResize, className = '' },
  ref
) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const [isConnecting, setIsConnecting] = useState(true)

  const onDataRef = useRef(onData)
  const onResizeRef = useRef(onResize)
  
  // Keep refs updated
  onDataRef.current = onData
  onResizeRef.current = onResize

  useEffect(() => {
    if (!terminalRef.current) return

    // Create terminal instance with proper UTF-8 support
    const term = new Terminal({
      cursorBlink: true,
      rightClickSelectsWord: true,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      allowProposedApi: true,
      convertEol: true,
      scrollback: 1000,
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#3366cc',
      },
    })

    // Create and load addons
    const fit = new FitAddon()
    const webLinks = new WebLinksAddon()

    term.loadAddon(fit)
    term.loadAddon(webLinks)

    // Open terminal in the container
    term.open(terminalRef.current)

    // Set up data handler using ref
    const dataDisposable = term.onData((data) => {
      if (onDataRef.current) {
        onDataRef.current(data)
      }
    })

    // Set up resize handler using ref
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (onResizeRef.current) {
        onResizeRef.current(cols, rows)
      }
    })

    // Store references
    setTerminal(term)

    // Handle resize with debouncing for better performance
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            fit.fit()
          } catch (error) {
            console.warn('Terminal fit failed:', error)
          }
        })
      }, 16) // ~60fps debounce
    }

    // Initial fit after a brief delay to ensure container is ready
    const initialFitTimeout = setTimeout(() => {
      try {
        fit.fit()
        setIsConnecting(false)
      } catch (error) {
        console.warn('Initial terminal fit failed:', error)
        setIsConnecting(false)
      }
    }, 100)

    // Set up resize observer for container size changes
    const resizeObserver = new ResizeObserver(handleResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Also listen for window resize as backup
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout)
      clearTimeout(initialFitTimeout)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      term.dispose()
      setTerminal(null)
    }
  }, []) // No dependencies - only create once

  // Method to write data to terminal
  const writeData = (data: string) => {
    if (terminal) {
      terminal.write(data)
    }
  }

  // Method to clear terminal
  const clear = () => {
    if (terminal) {
      terminal.clear()
    }
  }

  // Method to focus terminal
  const focus = () => {
    if (terminal) {
      terminal.focus()
    }
  }

  // Expose methods via ref using useImperativeHandle
  useImperativeHandle(ref, () => ({
    writeData,
    clear,
    focus,
  }), [terminal])

  return (
    <div className={`relative h-full ${className}`}>
      {isConnecting && (
        <div className="absolute inset-0 bg-main-view-fg/5 flex items-center justify-center z-10">
          <div className="text-center text-main-view-fg/70">
            <div className="animate-pulse mb-2">●</div>
            <p className="text-sm">Connecting to terminal...</p>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="h-full w-full terminal-container"
        style={{
          opacity: isConnecting ? 0.3 : 1,
          transition: 'opacity 0.3s ease',
        }}
      />
    </div>
  )
})

TerminalEmulator.displayName = 'TerminalEmulator'

export default TerminalEmulator
