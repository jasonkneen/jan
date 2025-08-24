import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { SplitDirection } from '@/types/terminal'

interface SplitPaneProps {
  direction: SplitDirection
  sizes: [number, number]
  onSizesChange?: (sizes: [number, number]) => void
  children: [React.ReactNode, React.ReactNode]
  className?: string
  minSize?: number // Minimum size percentage for each pane
}

export default function SplitPane({
  direction,
  sizes,
  onSizesChange,
  children,
  className = '',
  minSize = 10,
}: SplitPaneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const splitPaneRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitPaneRef.current) return

      const rect = splitPaneRef.current.getBoundingClientRect()
      const isHorizontal = direction === 'horizontal'
      
      const total = isHorizontal ? rect.height : rect.width
      const position = isHorizontal 
        ? e.clientY - rect.top
        : e.clientX - rect.left

      const percentage = (position / total) * 100
      const clampedPercentage = Math.max(minSize, Math.min(100 - minSize, percentage))
      
      const newSizes: [number, number] = [
        clampedPercentage,
        100 - clampedPercentage,
      ]

      onSizesChange?.(newSizes)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [direction, minSize, onSizesChange])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={splitPaneRef}
      className={cn(
        'flex h-full w-full',
        isHorizontal ? 'flex-col' : 'flex-row',
        className
      )}
    >
      {/* First pane */}
      <div
        style={{
          [isHorizontal ? 'height' : 'width']: `${sizes[0]}%`,
        }}
        className="overflow-hidden"
      >
        {children[0]}
      </div>

      {/* Splitter */}
      <div
        className={cn(
          'bg-main-view-fg/10 hover:bg-main-view-fg/20 transition-colors duration-200',
          isHorizontal 
            ? 'h-1 cursor-row-resize' 
            : 'w-1 cursor-col-resize',
          isDragging && 'bg-main-view-fg/30'
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            'flex items-center justify-center',
            isHorizontal ? 'h-full w-full' : 'h-full w-full'
          )}
        >
          {/* Visual indicator dots */}
          <div
            className={cn(
              'flex',
              isHorizontal 
                ? 'flex-row space-x-1' 
                : 'flex-col space-y-1'
            )}
          >
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="w-1 h-1 bg-main-view-fg/40 rounded-full"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Second pane */}
      <div
        style={{
          [isHorizontal ? 'height' : 'width']: `${sizes[1]}%`,
        }}
        className="overflow-hidden"
      >
        {children[1]}
      </div>
    </div>
  )
}
