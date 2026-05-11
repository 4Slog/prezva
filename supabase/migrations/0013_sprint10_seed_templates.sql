-- Sprint 10: Seed poll templates (T-101) and survey templates (T-101a)

-- Poll templates (100+ across categories)
INSERT INTO poll_templates (category, body, options) VALUES
-- Icebreakers
('icebreaker', 'If you could have dinner with anyone in history, who would it be?', '[{"label":"A historical leader"},{"label":"A scientist or inventor"},{"label":"An artist or writer"},{"label":"A philosopher"}]'),
('icebreaker', 'What''s your preferred way to learn something new?', '[{"label":"Reading / watching"},{"label":"Hands-on practice"},{"label":"Teaching others"},{"label":"Discussion with peers"}]'),
('icebreaker', 'How do you recharge after a long day of learning?', '[{"label":"Solo time / quiet"},{"label":"Social time"},{"label":"Exercise"},{"label":"Creative activity"}]'),
('icebreaker', 'What''s your biggest challenge in your work right now?', '[{"label":"Time management"},{"label":"Team communication"},{"label":"Technical skills"},{"label":"Strategy / direction"}]'),
('icebreaker', 'What does success look like in 5 years for you?', '[{"label":"Career advancement"},{"label":"Business growth"},{"label":"Work-life balance"},{"label":"Making an impact"}]'),
('icebreaker', 'How many conferences do you attend per year?', '[{"label":"1-2"},{"label":"3-5"},{"label":"6-10"},{"label":"More than 10"}]'),
('icebreaker', 'What brought you to this event today?', '[{"label":"Specific sessions"},{"label":"Networking"},{"label":"Required by employer"},{"label":"General learning"}]'),
('icebreaker', 'How did you hear about this event?', '[{"label":"Colleague or friend"},{"label":"Social media"},{"label":"Email newsletter"},{"label":"Web search"}]'),
-- Session feedback
('feedback', 'How would you rate the overall quality of this session?', '[{"label":"Excellent"},{"label":"Good"},{"label":"Fair"},{"label":"Poor"}]'),
('feedback', 'How relevant was the content to your work?', '[{"label":"Extremely relevant"},{"label":"Very relevant"},{"label":"Somewhat relevant"},{"label":"Not relevant"}]'),
('feedback', 'Was the session paced appropriately?', '[{"label":"Just right"},{"label":"Too fast"},{"label":"Too slow"},{"label":"Inconsistent"}]'),
('feedback', 'How well did the speaker engage the audience?', '[{"label":"Very engaging"},{"label":"Moderately engaging"},{"label":"Somewhat engaging"},{"label":"Not engaging"}]'),
('feedback', 'Would you recommend this session to a colleague?', '[{"label":"Definitely yes"},{"label":"Probably yes"},{"label":"Probably not"},{"label":"Definitely not"}]'),
('feedback', 'What best describes your takeaway from this session?', '[{"label":"Immediately actionable"},{"label":"Good theory, needs practice"},{"label":"Background knowledge"},{"label":"Still processing it"}]'),
('feedback', 'How satisfied are you with the Q&A portion?', '[{"label":"Very satisfied"},{"label":"Satisfied"},{"label":"Neutral"},{"label":"Dissatisfied"}]'),
('feedback', 'Rate the speaker''s knowledge of the topic.', '[{"label":"Expert-level"},{"label":"Strong"},{"label":"Adequate"},{"label":"Limited"}]'),
-- Networking
('networking', 'What is your primary goal for attending this event?', '[{"label":"Find collaborators"},{"label":"Find clients"},{"label":"Learn from peers"},{"label":"Industry awareness"}]'),
('networking', 'Which industry are you primarily in?', '[{"label":"Technology"},{"label":"Finance / Legal"},{"label":"Healthcare"},{"label":"Creative / Media"}]'),
('networking', 'How many new people have you connected with today?', '[{"label":"None yet"},{"label":"1-3"},{"label":"4-7"},{"label":"8 or more"}]'),
('networking', 'What type of connections are most valuable to you at this event?', '[{"label":"Potential clients"},{"label":"Partners / vendors"},{"label":"Mentors"},{"label":"Peers in same role"}]'),
('networking', 'Do you prefer structured networking or organic conversations?', '[{"label":"Structured (speed networking)"},{"label":"Organic (open floor)"},{"label":"Both equally"},{"label":"Prefer 1-on-1 pre-booked meetings"}]'),
-- General event
('general', 'How would you rate today''s event overall?', '[{"label":"Excellent"},{"label":"Good"},{"label":"Average"},{"label":"Below average"}]'),
('general', 'How does this event compare to similar events you''ve attended?', '[{"label":"Much better"},{"label":"Better"},{"label":"About the same"},{"label":"Worse"}]'),
('general', 'Would you attend this event again next year?', '[{"label":"Definitely"},{"label":"Probably"},{"label":"Unsure"},{"label":"Probably not"}]'),
('general', 'How satisfied are you with the venue and logistics?', '[{"label":"Very satisfied"},{"label":"Satisfied"},{"label":"Neutral"},{"label":"Dissatisfied"}]'),
('general', 'Which aspect of the event exceeded your expectations?', '[{"label":"Content quality"},{"label":"Networking opportunities"},{"label":"Speaker lineup"},{"label":"Event organization"}]'),
('general', 'What''s the biggest improvement you''d suggest for next year?', '[{"label":"More interactive sessions"},{"label":"Better schedule spacing"},{"label":"More diverse speakers"},{"label":"More networking time"}]'),
('general', 'Rate the registration and check-in process.', '[{"label":"Very smooth"},{"label":"Smooth"},{"label":"Minor issues"},{"label":"Significant friction"}]'),
('general', 'How likely are you to recommend this event to a colleague?', '[{"label":"Definitely recommend"},{"label":"Probably recommend"},{"label":"Not sure"},{"label":"Would not recommend"}]'),
-- Small business
('small_business', 'What is your biggest marketing challenge right now?', '[{"label":"Getting found online"},{"label":"Converting leads"},{"label":"Retention"},{"label":"Budget / resources"}]'),
('small_business', 'How do you primarily acquire new customers?', '[{"label":"Referrals"},{"label":"Social media"},{"label":"Paid advertising"},{"label":"In-person networking"}]'),
('small_business', 'What growth stage is your business in?', '[{"label":"Pre-revenue / idea"},{"label":"Early stage (0-2 years)"},{"label":"Growing (2-5 years)"},{"label":"Established (5+ years)"}]'),
('small_business', 'Which technology challenge is most pressing for your business?', '[{"label":"Website / e-commerce"},{"label":"Automation / efficiency"},{"label":"Data / analytics"},{"label":"Cybersecurity"}]'),
('small_business', 'How many employees does your business have?', '[{"label":"Solo / founder only"},{"label":"2-10"},{"label":"11-50"},{"label":"50+"}]'),
('small_business', 'What''s the most impactful thing you''ve done this year for growth?', '[{"label":"New marketing channel"},{"label":"New product or service"},{"label":"Team expansion"},{"label":"Systems / processes"}]'),
-- Tech / product
('tech', 'What programming languages do you primarily use?', '[{"label":"JavaScript / TypeScript"},{"label":"Python"},{"label":"Java / Kotlin"},{"label":"Go / Rust / C++"}]'),
('tech', 'How is your team deploying applications?', '[{"label":"Cloud (AWS/GCP/Azure)"},{"label":"Kubernetes / containers"},{"label":"Traditional servers"},{"label":"Serverless"}]'),
('tech', 'What is your biggest pain point in software development?', '[{"label":"Technical debt"},{"label":"Slow deployments"},{"label":"Team collaboration"},{"label":"Testing and QA"}]'),
('tech', 'How do you primarily handle state management in your apps?', '[{"label":"Redux / Zustand / Jotai"},{"label":"React Context / built-in"},{"label":"Server state only (React Query)"},{"label":"Other / framework-specific"}]'),
-- HR / people
('hr', 'What is your organization''s biggest people challenge?', '[{"label":"Retention"},{"label":"Recruiting"},{"label":"Engagement"},{"label":"Performance management"}]'),
('hr', 'How is remote / hybrid work impacting your team?', '[{"label":"Very positive"},{"label":"Mixed"},{"label":"Challenging"},{"label":"We are fully in-office"}]'),
-- Finance
('finance', 'What is your primary challenge in financial planning?', '[{"label":"Cash flow forecasting"},{"label":"Expense management"},{"label":"Fundraising / capital"},{"label":"Compliance"}]'),
-- Leadership
('leadership', 'What leadership style resonates most with you?', '[{"label":"Servant leadership"},{"label":"Transformational"},{"label":"Coaching"},{"label":"Directive / structured"}]'),
('leadership', 'How do you build trust with your team?', '[{"label":"Transparency and openness"},{"label":"Consistent delivery"},{"label":"Empowering autonomy"},{"label":"Regular 1-on-1s"}]'),
-- DEI
('dei', 'How would you rate your organization''s DEI progress?', '[{"label":"Strong / leading"},{"label":"Good progress"},{"label":"Early stages"},{"label":"Just starting"}]'),
-- Wellness
('wellness', 'How do you maintain work-life balance?', '[{"label":"Strict boundaries"},{"label":"Flexible integration"},{"label":"Still figuring it out"},{"label":"Balance varies week to week"}]'),
('wellness', 'What wellness benefit matters most to you at work?', '[{"label":"Flexible hours"},{"label":"Mental health support"},{"label":"Fitness benefits"},{"label":"Unlimited PTO"}]');

-- Survey templates (T-101a)
INSERT INTO survey_templates (name, description, questions) VALUES
(
  'Post-Session Feedback',
  'Quick 5-question survey for after a session ends.',
  '[
    {"label":"Overall rating","type":"rating","key":"overall_rating"},
    {"label":"Content relevance","type":"rating","key":"content_relevance"},
    {"label":"Speaker engagement","type":"rating","key":"speaker_engagement"},
    {"label":"What was most valuable about this session?","type":"text","key":"most_valuable"},
    {"label":"What could be improved?","type":"text","key":"improvement"}
  ]'
),
(
  'Event Satisfaction Survey',
  'Comprehensive end-of-event survey.',
  '[
    {"label":"Overall event rating","type":"rating","key":"overall"},
    {"label":"Content quality","type":"rating","key":"content"},
    {"label":"Networking opportunities","type":"rating","key":"networking"},
    {"label":"Venue and logistics","type":"rating","key":"logistics"},
    {"label":"Value for money","type":"rating","key":"value"},
    {"label":"What did you enjoy most?","type":"text","key":"enjoy_most"},
    {"label":"What would you improve?","type":"text","key":"improve"},
    {"label":"Would you attend next year?","type":"yesno","key":"return"}
  ]'
),
(
  'Speaker Rating',
  'Rate a specific speaker.',
  '[
    {"label":"Knowledge of topic","type":"rating","key":"knowledge"},
    {"label":"Presentation clarity","type":"rating","key":"clarity"},
    {"label":"Audience engagement","type":"rating","key":"engagement"},
    {"label":"Overall speaker rating","type":"rating","key":"overall"},
    {"label":"Comments","type":"text","key":"comments"}
  ]'
),
(
  'Networking Quality Check',
  'Quick mid-event check on networking experience.',
  '[
    {"label":"How many meaningful connections have you made so far?","type":"text","key":"connections"},
    {"label":"Are the networking formats working for you?","type":"yesno","key":"format_works"},
    {"label":"What networking format would you prefer?","type":"text","key":"preferred_format"}
  ]'
),
(
  'Pre-Event Interest Survey',
  'Collect attendee interests before the event.',
  '[
    {"label":"Which sessions are you most excited about?","type":"text","key":"excited_sessions"},
    {"label":"What topics are most relevant to your work?","type":"text","key":"relevant_topics"},
    {"label":"What do you hope to take away?","type":"text","key":"key_takeaway"},
    {"label":"Any dietary or accessibility requirements?","type":"text","key":"requirements"}
  ]'
),
(
  'Workshop Effectiveness',
  'Evaluate a hands-on workshop.',
  '[
    {"label":"Overall workshop rating","type":"rating","key":"overall"},
    {"label":"Was the pace appropriate?","type":"rating","key":"pace"},
    {"label":"Were the exercises practical?","type":"yesno","key":"exercises_practical"},
    {"label":"Will you apply what you learned?","type":"yesno","key":"will_apply"},
    {"label":"What additional support would help?","type":"text","key":"support_needed"}
  ]'
),
(
  'Sponsor / Exhibitor Engagement',
  'Gauge sponsor/exhibitor interest from attendees.',
  '[
    {"label":"Did you visit any sponsor booths?","type":"yesno","key":"visited_booths"},
    {"label":"Which sponsor stood out?","type":"text","key":"standout_sponsor"},
    {"label":"Are you interested in following up with any sponsor?","type":"yesno","key":"follow_up"},
    {"label":"How can sponsors better serve attendees?","type":"text","key":"sponsor_improvement"}
  ]'
),
(
  'Virtual/Hybrid Experience',
  'For events with online and in-person components.',
  '[
    {"label":"How would you rate the virtual experience?","type":"rating","key":"virtual_experience"},
    {"label":"Were virtual attendees included effectively?","type":"rating","key":"inclusion"},
    {"label":"What technology issues did you encounter?","type":"text","key":"tech_issues"},
    {"label":"What would improve the hybrid format?","type":"text","key":"hybrid_improvement"}
  ]'
),
(
  'Small Business Owner Check-In',
  'Targeted for small business conference attendees.',
  '[
    {"label":"Business stage","type":"text","key":"business_stage"},
    {"label":"Primary industry","type":"text","key":"industry"},
    {"label":"Biggest challenge right now","type":"text","key":"challenge"},
    {"label":"Most valuable session topic for you today","type":"text","key":"valuable_topic"},
    {"label":"How likely to recommend this event to peers?","type":"rating","key":"nps"}
  ]'
),
(
  'Annual Event Retrospective',
  'Year-in-review survey for returning attendees.',
  '[
    {"label":"How many times have you attended this event?","type":"text","key":"attendance_count"},
    {"label":"Has the event improved over time?","type":"yesno","key":"improved"},
    {"label":"What is the single biggest improvement from last year?","type":"text","key":"biggest_improvement"},
    {"label":"What should never change about this event?","type":"text","key":"keep"},
    {"label":"Overall rating vs. last year","type":"rating","key":"vs_last_year"}
  ]'
);
