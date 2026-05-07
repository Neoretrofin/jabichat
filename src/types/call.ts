// 'accepting' is the brief state between the user tapping Accept on an
// incoming call and the WebRTC layer reaching 'connected'. The controller
// hook uses it as a trigger to run the answerer setup flow without
// auto-accepting the call as soon as the offer arrives.
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'accepting' | 'connected' | 'ended'

export type SignalType =
  | 'call-offer'
  | 'call-answer'
  | 'ice-candidate'
  | 'call-end'
  | 'call-reject'

export interface SignalPayload {
  type: SignalType
  callId: string
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit | null
}
