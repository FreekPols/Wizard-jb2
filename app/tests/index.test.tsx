import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock solid-js/web
const renderMock = vi.fn()
vi.mock('solid-js/web', () => ({ render: renderMock }))

// Clear DOM and Module cache before each test
beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    renderMock.mockReset()
})

// Use "describe" to create a group of tests
describe('Example tests for index.src expected behaviour', () => {
    // Use "it" to start a test
    it('Renders <App /> into #root when #root exists', async () => {
        // Create a custom root element
        const root = document.createElement('div')
        root.id = 'root'
        document.body.appendChild(root)

        // Import index.tsx
        await import('../src/index')

        // Assert render was called with our custom root element
        expect(renderMock).toHaveBeenCalledWith(expect.any(Function), root)
    })

    it('Throws a helpful error if #root is missing', async () => {
        await expect(import('../src/index')).rejects.toThrowError()
    })
})