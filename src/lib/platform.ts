// Platform detection for call-time capability negotiation. We only enable
// multi-track audio (separate voice + screen-audio transceivers) when both
// peers report as desktop, because Android Chrome's SDP parser sometimes
// refuses to flow media when more than one audio m-line is offered.
export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini/i.test(navigator.userAgent)
}
