import type { IcebreakerPrompt } from './types'

export const ICEBREAKER_PROMPTS: IcebreakerPrompt[] = [
  // casual
  { id: 'ice-001', text: 'What brings you to {event_title}?', tags: ['casual', 'event-specific'] },
  { id: 'ice-002', text: 'Coffee, tea, or something else to get you going?', tags: ['casual', 'light'] },
  { id: 'ice-003', text: "What's a recent win — work or personal?", tags: ['casual', 'positive'] },
  { id: 'ice-004', text: "If you weren't in your current role, what would you be doing?", tags: ['casual'] },
  { id: 'ice-005', text: 'Where are you visiting from today?', tags: ['casual', 'location'] },
  { id: 'ice-006', text: "What's the last book, podcast, or article that genuinely changed how you think?", tags: ['casual', 'reflective'] },
  { id: 'ice-007', text: 'What do you do to recharge after a long week?', tags: ['casual'] },
  { id: 'ice-008', text: "What's something most people here probably don't know about you?", tags: ['casual', 'fun'] },
  { id: 'ice-009', text: "What's your current side project or passion outside of work?", tags: ['casual'] },
  { id: 'ice-010', text: 'If you could have dinner with anyone — living or historical — who would it be?', tags: ['casual', 'fun'] },

  // networking
  { id: 'ice-011', text: "Who's someone you're hoping to meet here today?", tags: ['networking'] },
  { id: 'ice-012', text: "What's one collaboration you're actively looking for?", tags: ['networking', 'professional'] },
  { id: 'ice-013', text: "What's the most valuable connection you've made at an event like this?", tags: ['networking', 'reflective'] },
  { id: 'ice-014', text: 'What problem are you trying to solve in your work right now?', tags: ['networking', 'professional'] },
  { id: 'ice-015', text: "What's one thing you wish more people in your industry understood?", tags: ['networking', 'professional'] },
  { id: 'ice-016', text: 'What does success look like for you in the next 12 months?', tags: ['networking', 'professional'] },
  { id: 'ice-017', text: "What's a skill you're actively building right now?", tags: ['networking', 'professional'] },
  { id: 'ice-018', text: "What's the best way to stay in touch with you after today?", tags: ['networking'] },
  { id: 'ice-019', text: "What's one community or group outside this event you'd recommend to others?", tags: ['networking'] },
  { id: 'ice-020', text: 'If you could instantly master one skill relevant to your work, what would it be?', tags: ['networking', 'professional'] },

  // creative
  { id: 'ice-021', text: 'If your team had a theme song, what would it be?', tags: ['creative', 'fun'] },
  { id: 'ice-022', text: 'If your work style was a movie genre, which one fits best?', tags: ['creative', 'fun'] },
  { id: 'ice-023', text: 'What emoji best represents how you feel right now?', tags: ['creative', 'light'] },
  { id: 'ice-024', text: 'If you could redesign one thing about your industry from scratch, what would it be?', tags: ['creative', 'professional'] },
  { id: 'ice-025', text: 'What fictional workplace would you love to work in for a week?', tags: ['creative', 'fun'] },
  { id: 'ice-026', text: 'If you had to teach a 10-minute masterclass on anything, what topic would you choose?', tags: ['creative', 'professional'] },
  { id: 'ice-027', text: "What's an unconventional solution you've used that actually worked?", tags: ['creative', 'professional'] },
  { id: 'ice-028', text: 'If your career was a road trip, what landmark are you at right now?', tags: ['creative', 'reflective'] },
  { id: 'ice-029', text: "What's one rule in your field you think should be broken?", tags: ['creative', 'professional'] },
  { id: 'ice-030', text: "If you could swap roles with someone in this room for a day, who and why?", tags: ['creative', 'fun'] },

  // energizer
  { id: 'ice-031', text: "Stand up if you've attended more than 3 events like this one!", tags: ['energizer', 'quick'] },
  { id: 'ice-032', text: "Find someone you've never met and share the best thing that happened to you this month — go!", tags: ['energizer', 'networking'] },
  { id: 'ice-033', text: 'Two truths and a lie — go around your table and guess!', tags: ['energizer', 'fun'] },
  { id: 'ice-034', text: "Name one word that describes what you're bringing to this event today.", tags: ['energizer', 'quick'] },
  { id: 'ice-035', text: 'High-five someone near you and introduce yourself in 10 seconds.', tags: ['energizer', 'quick'] },
  { id: 'ice-036', text: "What's the most interesting thing you've learned in the last 30 days?", tags: ['energizer', 'professional'] },
  { id: 'ice-037', text: "Raise your hand if today is your first time at this event!", tags: ['energizer', 'quick'] },
  { id: 'ice-038', text: 'What one word best describes the energy you want to leave with today?', tags: ['energizer', 'reflective'] },
  { id: 'ice-039', text: 'Share the GIF or meme that best captures your current workload.', tags: ['energizer', 'fun', 'light'] },
  { id: 'ice-040', text: 'What would the title of your autobiography be based on this past year?', tags: ['energizer', 'fun', 'reflective'] },

  // reflective
  { id: 'ice-041', text: "What's the best decision you made in the last year, professionally?", tags: ['reflective', 'professional'] },
  { id: 'ice-042', text: "What's one thing you used to believe about your field that you've since changed your mind on?", tags: ['reflective', 'professional'] },
  { id: 'ice-043', text: "What's a lesson you learned the hard way that you'd share with your younger self?", tags: ['reflective'] },
  { id: 'ice-044', text: 'What does meaningful work look like to you?', tags: ['reflective', 'professional'] },
  { id: 'ice-045', text: "What's something you're grateful for in your career right now?", tags: ['reflective', 'positive'] },
  { id: 'ice-046', text: "What's a moment from this past year that you're most proud of?", tags: ['reflective', 'positive'] },
  { id: 'ice-047', text: "How has your definition of success changed over the years?", tags: ['reflective'] },
  { id: 'ice-048', text: "What's one habit that has made the biggest difference in your effectiveness?", tags: ['reflective', 'professional'] },

  // professional
  { id: 'ice-049', text: "What's one tool or process you can't live without in your work?", tags: ['professional'] },
  { id: 'ice-050', text: "What's the best business advice you've ever received?", tags: ['professional', 'advice'] },
]
