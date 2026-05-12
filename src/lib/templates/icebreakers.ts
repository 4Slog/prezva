import type { IcebreakerPrompt } from './types'

export const ICEBREAKER_PROMPTS: IcebreakerPrompt[] = [
  { id: 'ib-1', text: 'What brings you to {event_title}?', tags: ['event-specific'] },
  { id: 'ib-2', text: "What's one tool you can't live without in your work?", tags: ['professional'] },
  { id: 'ib-3', text: 'Where are you visiting from?', tags: ['location'] },
  { id: 'ib-4', text: "What's a hidden gem in your industry that more people should know about?", tags: ['professional'] },
  { id: 'ib-5', text: "If you weren't in your current role, what would you be doing?", tags: ['casual'] },
  { id: 'ib-6', text: "What's the best business advice you've ever received?", tags: ['professional', 'advice'] },
  { id: 'ib-7', text: "What are you hoping to learn at this event?", tags: ['event-specific'] },
  { id: 'ib-8', text: "What's a recent win — work or personal?", tags: ['casual', 'positive'] },
  { id: 'ib-9', text: "Who's someone you're hoping to meet here?", tags: ['networking'] },
  { id: 'ib-10', text: 'Coffee, tea, or something else?', tags: ['casual', 'light'] },
]
