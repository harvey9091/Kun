// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyBackground,
  applyCachedAppearance,
  applyGlass,
  pathToFileUrl
} from './apply-appearance'

const GLASS_CACHE_KEY = 'kun.glass.v1'
const BACKGROUND_CACHE_KEY = 'kun.background.v1'

describe('pathToFileUrl', () => {
  it('encodes a Windows path into a file:// URL with forward slashes', () => {
    expect(pathToFileUrl('C:\\Users\\me\\My Images\\bg #1.png')).toBe(
      'file:///C:/Users/me/My%20Images/bg%20%231.png'
    )
  })

  it('passes through an existing file URL and returns empty for blank input', () => {
    expect(pathToFileUrl('file:///already/encoded.png')).toBe('file:///already/encoded.png')
    expect(pathToFileUrl('   ')).toBe('')
  })
})

describe('applyGlass', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-glass')
  })

  it('turns glass on, injects vars and caches the look', () => {
    applyGlass({ enabled: true, blurPx: 20, tint: '#abcdef' })
    expect(document.documentElement.getAttribute('data-glass')).toBe('on')
    expect(document.documentElement.style.getPropertyValue('--ds-glass-blur')).toBe('20px')
    expect(document.documentElement.style.getPropertyValue('--ds-glass-tint')).toBe('#abcdef')
    expect(JSON.parse(localStorage.getItem(GLASS_CACHE_KEY) ?? '{}').enabled).toBe(true)
  })

  it('marks data-glass off when disabled so the CSS engine stops blurring', () => {
    applyGlass({ enabled: false })
    expect(document.documentElement.getAttribute('data-glass')).toBe('off')
  })
})

describe('applyBackground', () => {
  beforeEach(() => {
    localStorage.clear()
    for (const attribute of ['data-bg-type', 'data-bg-motion', 'data-bg-fit']) {
      document.documentElement.removeAttribute(attribute)
    }
  })

  it('sets attributes and a file url for the image type', () => {
    applyBackground({ type: 'image', imagePath: 'C:\\app\\bg.png', fit: 'contain', motion: 'drift' })
    expect(document.documentElement.getAttribute('data-bg-type')).toBe('image')
    expect(document.documentElement.getAttribute('data-bg-fit')).toBe('contain')
    expect(document.documentElement.getAttribute('data-bg-motion')).toBe('drift')
    expect(document.documentElement.style.getPropertyValue('--ds-app-bg-image')).toContain('url(')
  })

  it('clears the image url for non-image types', () => {
    applyBackground({ type: 'solid', solidColor: '#101014' })
    expect(document.documentElement.style.getPropertyValue('--ds-app-bg-image')).toBe('none')
    expect(document.documentElement.style.getPropertyValue('--ds-app-bg-solid')).toBe('#101014')
  })
})

describe('applyCachedAppearance', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-glass')
    document.documentElement.removeAttribute('data-bg-type')
  })

  it('repaints from the persisted cache before settings load', () => {
    applyGlass({ enabled: true, blurPx: 12 })
    applyBackground({ type: 'gradient' })
    document.documentElement.removeAttribute('data-glass')
    document.documentElement.removeAttribute('data-bg-type')
    applyCachedAppearance()
    expect(document.documentElement.getAttribute('data-glass')).toBe('on')
    expect(document.documentElement.getAttribute('data-bg-type')).toBe('gradient')
  })

  it('drops a corrupt cache entry instead of throwing', () => {
    localStorage.setItem(GLASS_CACHE_KEY, '{not json')
    expect(() => applyCachedAppearance()).not.toThrow()
    expect(localStorage.getItem(GLASS_CACHE_KEY)).toBeNull()
  })
})
