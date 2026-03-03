import * as p from '@clack/prompts'
import pc from 'picocolors'

let _verbose = false
let _spinner: ReturnType<typeof p.spinner> | null = null

export function setVerbose(v: boolean): void { _verbose = v }
export function setSpinner(s: ReturnType<typeof p.spinner> | null): void { _spinner = s }

// Verbose-only — updates spinner message inline if one is active, else prints a dim step line
export function toolCall(msg: string): void {
  if (!_verbose) return;
  if (_spinner) {
    _spinner.message(pc.dim(msg));
  } else {
    p.log.step(pc.dim(msg));
  }
}

// Always visible
export const intro = p.intro
export const outro = p.outro
export function step(msg: string): void  { p.log.step(msg) }
export function info(msg: string): void  { p.log.info(msg) }
export function warn(msg: string): void  { p.log.warn(msg) }
export function error(msg: string): void { p.log.error(msg) }

// Verbose-only — full brightness (primary steps gated behind --verbose)
export function verboseStep(msg: string): void {
  if (_verbose) p.log.step(msg)
}

// Verbose-only — dim (secondary metadata)
export function detail(msg: string): void {
  if (_verbose) p.log.step(pc.dim(msg))
}

// Spinner
export function createSpinner(): ReturnType<typeof p.spinner> {
  return p.spinner()
}

// Interactive prompts
export const confirm = p.confirm
export const isCancel = p.isCancel

// Picocolors passthrough
export { pc }
